import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import { chatWithCrmAgent } from "./lib/agent-chat.js";
import {
  ensureDashboardSalesDb,
  getDashboardPayload,
} from "./lib/dashboard-sales-db.js";
import { getConversionPayload } from "./lib/conversion-data.js";
import { getLeadsPayload } from "./lib/leads-data.js";
import { ensureSeededCrmDb } from "./lib/seed-db.js";
import {
  getBootSyncMode,
  getSyncStatus,
  isSyncEnabled,
  requireSyncAdminAuth,
  shouldSyncOnBoot,
  triggerSync,
} from "./lib/sync-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiuxDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(uiuxDir, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(uiuxDir, ".env"), override: true });

const app = express();
const port = Number.parseInt(process.env.PORT || process.env.DASHBOARD_API_PORT || "3001", 10);
const host = process.env.HOST || "0.0.0.0";
const shouldPrebuildDashboardDb = process.env.PREBUILD_DASHBOARD_DB === "true";
const seedResult = await ensureSeededCrmDb();

process.on("uncaughtException", (error) => {
  console.error("[dashboard-api] uncaughtException", error);
});

process.on("unhandledRejection", (error) => {
  console.error("[dashboard-api] unhandledRejection", error);
});

app.use(express.json());
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Sync-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});
app.options("*", (_, res) => {
  res.status(204).send();
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.get("/api/debug/env-status", (_req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const model = process.env.CRM_AGENT_MODEL || "";
  res.json({
    ok: true,
    has_gemini_api_key: apiKey.length > 0,
    gemini_api_key_length: apiKey.length,
    crm_agent_model: model || null,
    prebuild_dashboard_db: process.env.PREBUILD_DASHBOARD_DB || null,
    sync_enabled: isSyncEnabled(),
  });
});

app.get("/api/admin/sync/status", requireSyncAdminAuth, (_req, res) => {
  res.status(200).json(getSyncStatus());
});

app.post("/api/admin/sync", requireSyncAdminAuth, (req, res) => {
  const requestedMode = typeof req.body?.mode === "string" ? req.body.mode : undefined;
  const triggerSource = typeof req.body?.trigger === "string" ? req.body.trigger : "api";
  const result = triggerSync({
    mode: requestedMode,
    trigger: triggerSource,
  });

  if (result.alreadyRunning) {
    res.status(409).json({
      ok: false,
      already_running: true,
      run_id: result.runId,
      status: result.status,
    });
    return;
  }

  res.status(202).json({
    ok: true,
    accepted: true,
    run_id: result.runId,
    status: result.status,
  });
});

app.get("/api/sales/dashboard", (req, res) => {
  try {
    ensureDashboardSalesDb();
    const payload = getDashboardPayload({
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      grain: typeof req.query.grain === "string" ? req.query.grain : undefined,
    });
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[dashboard-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load dashboard data.",
    }));
  }
});

app.get("/api/sales/conversion", (req, res) => {
  try {
    const sourceGroupQuery = req.query.source_group;
    const selectedSourceGroups = Array.isArray(sourceGroupQuery)
      ? sourceGroupQuery.filter((value) => typeof value === "string")
      : typeof sourceGroupQuery === "string"
        ? [sourceGroupQuery]
        : [];

    const payload = getConversionPayload({
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      sourceMode: typeof req.query.source_mode === "string" ? req.query.source_mode : undefined,
      cohortGrain: typeof req.query.cohort_grain === "string" ? req.query.cohort_grain : undefined,
      selectedSourceGroups,
    });

    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[conversion-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load conversion data.",
    }));
  }
});

app.get("/api/sales/leads", (_req, res) => {
  try {
    const payload = getLeadsPayload();
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[leads-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load leads data.",
    }));
  }
});

app.post("/api/agent/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const viewId = typeof req.body?.view_id === "string" ? req.body.view_id : "dashboard";

    const payload = await chatWithCrmAgent({
      messages,
      viewId,
    });

    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[agent-api] failed to process chat request", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to process agent chat request.",
    }));
  }
});

app.use((error, _req, res, _next) => {
  console.error("[dashboard-api] express error middleware", error);
  res.status(500).type("application/json").send(JSON.stringify({
    error: "Unhandled dashboard server error.",
  }));
});

if (shouldPrebuildDashboardDb) {
  try {
    const result = ensureDashboardSalesDb();
    if (result?.builtAt) {
      console.log(`[dashboard-api] prebuilt dashboard DB at ${result.builtAt}`);
    }
  } catch (error) {
    console.error("[dashboard-api] failed to prebuild dashboard DB", error);
  }
}

console.log("[dashboard-api] env status", {
  hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
  geminiApiKeyLength: String(process.env.GEMINI_API_KEY || "").length,
  crmAgentModel: process.env.CRM_AGENT_MODEL || null,
  prebuildDashboardDb: process.env.PREBUILD_DASHBOARD_DB || null,
  syncEnabled: isSyncEnabled(),
  syncOnBoot: process.env.SYNC_ON_BOOT || null,
  seededCrmDb: seedResult.seeded,
  missingSeedArchive: Boolean(seedResult.missingSeedArchive),
});

app.listen(port, host, () => {
  console.log(`[dashboard-api] listening on http://${host}:${port}`);
  if (shouldSyncOnBoot()) {
    const result = triggerSync({
      mode: getBootSyncMode(),
      trigger: "startup",
    });
    console.log("[dashboard-api] startup sync requested", {
      accepted: result.accepted,
      runId: result.runId,
      alreadyRunning: result.alreadyRunning,
    });
  }
});
