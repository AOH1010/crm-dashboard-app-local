import path from "node:path";
import fs from "node:fs";
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
import {
  buildActiveMapPayload,
  buildCohortPayload,
  buildRenewPayload,
  buildUserMapPayload,
} from "./lib/operations-data.js";
import { getTeamPayload } from "./lib/team-data.js";
import { ensureSeededCrmDb } from "./lib/seed-db.js";
import {
  getBootSyncMode,
  getSyncStatus,
  isSyncEnabled,
  requireSyncAdminAuth,
  startSyncScheduler,
  shouldSyncOnBoot,
  triggerSync,
} from "./lib/sync-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendAppDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendAppDir, "..", "..");
const chatLabArtifactsRelativeDir = path.join("artifacts", "chat-lab-exports");
const chatLabArtifactsDir = path.join(projectRoot, chatLabArtifactsRelativeDir);

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(backendAppDir, ".env"), override: true });

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

app.get("/api/agent/chat-lab/scenarios", (_req, res) => {
  try {
    const payloadPath = path.join(projectRoot, "docs", "eval", "eval-50-chat-lab.json");
    const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[chat-lab-api] failed to load scenarios", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load Chat Lab scenarios.",
    }));
  }
});

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""').replaceAll("\r\n", "\n").replaceAll("\n", "\\n")}"`;
}

function buildCsvContent(rows) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `\ufeff${lines.join("\n")}`;
}

function sanitizeArtifactFilename(filename, extension = ".csv") {
  const normalized = String(filename || "").trim();
  const fallbackName = extension === ".json" ? "chat-lab-results.json" : "chat-lab-results.csv";
  const basename = path.basename(normalized || fallbackName);
  const safeName = basename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`;
}

function resolveUniqueArtifactFilename(filename) {
  const parsed = path.parse(filename);
  let candidate = filename;
  let counter = 1;

  while (fs.existsSync(path.join(chatLabArtifactsDir, candidate))) {
    candidate = `${parsed.name}-v${counter}${parsed.ext || ".csv"}`;
    counter += 1;
  }

  return candidate;
}

app.post("/api/agent/chat-lab/export", (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows)
      ? req.body.rows.filter((row) => row && typeof row === "object" && !Array.isArray(row))
      : [];

    if (rows.length === 0) {
      res.status(400).json({
        error: "Chat Lab export requires at least one row.",
      });
      return;
    }

    const requestedFilename = sanitizeArtifactFilename(req.body?.filename, ".csv");
    fs.mkdirSync(chatLabArtifactsDir, { recursive: true });
    const filename = resolveUniqueArtifactFilename(requestedFilename);
    const absolutePath = path.join(chatLabArtifactsDir, filename);
    fs.writeFileSync(absolutePath, buildCsvContent(rows), "utf8");

    res.status(200).json({
      ok: true,
      filename,
      relative_path: path.posix.join("artifacts", "chat-lab-exports", filename),
      absolute_path: absolutePath,
      row_count: rows.length,
    });
  } catch (error) {
    console.error("[chat-lab-api] failed to export csv", error instanceof Error ? error.stack : error);
    res.status(500).json({
      error: "Failed to export Chat Lab CSV artifact.",
    });
  }
});

app.post("/api/agent/chat-lab/export-json", (req, res) => {
  try {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      res.status(400).json({
        error: "Chat Lab JSON export requires an object payload.",
      });
      return;
    }

    const requestedFilename = sanitizeArtifactFilename(req.body?.filename, ".json");
    fs.mkdirSync(chatLabArtifactsDir, { recursive: true });
    const filename = resolveUniqueArtifactFilename(requestedFilename);
    const absolutePath = path.join(chatLabArtifactsDir, filename);
    fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    res.status(200).json({
      ok: true,
      filename,
      relative_path: path.posix.join("artifacts", "chat-lab-exports", filename),
      absolute_path: absolutePath,
      row_count: 1,
    });
  } catch (error) {
    console.error("[chat-lab-api] failed to export json", error instanceof Error ? error.stack : error);
    res.status(500).json({
      error: "Failed to export Chat Lab JSON artifact.",
    });
  }
});

app.get("/api/debug/env-status", (_req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY || "";
  const nvidiaApiKey = process.env.NVIDIA_API_KEY || "";
  const model = process.env.CRM_AGENT_MODEL || "";
  const provider = process.env.CRM_AGENT_PROVIDER || (nvidiaApiKey ? "nvidia" : "gemini");
  res.json({
    ok: true,
    crm_agent_provider: provider,
    has_gemini_api_key: geminiApiKey.length > 0,
    gemini_api_key_length: geminiApiKey.length,
    has_nvidia_api_key: nvidiaApiKey.length > 0,
    nvidia_api_key_length: nvidiaApiKey.length,
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

app.get("/api/sales/team", (req, res) => {
  try {
    const payload = getTeamPayload({
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
    });
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[team-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load team data.",
    }));
  }
});

app.get("/api/operations/user-map", (req, res) => {
  try {
    const payload = buildUserMapPayload({
      reportMonth: typeof req.query.report_month === "string" ? req.query.report_month : undefined,
    });
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[operations-user-map-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load user map data.",
    }));
  }
});

app.get("/api/operations/active-map", (req, res) => {
  try {
    const payload = buildActiveMapPayload({
      reportMonth: typeof req.query.report_month === "string" ? req.query.report_month : undefined,
      tenureBucket: typeof req.query.tenure_bucket === "string" ? req.query.tenure_bucket : undefined,
    });
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[operations-active-map-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load active map data.",
    }));
  }
});

app.get("/api/operations/cohort-active", (req, res) => {
  try {
    const payload = buildCohortPayload({
      reportMonth: typeof req.query.report_month === "string" ? req.query.report_month : undefined,
      metric: typeof req.query.metric === "string" ? req.query.metric : undefined,
      threshold: typeof req.query.threshold === "string" ? req.query.threshold : undefined,
    });
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[operations-cohort-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load cohort active data.",
    }));
  }
});

app.get("/api/operations/renew", (req, res) => {
  try {
    const payload = buildRenewPayload({
      reportMonth: typeof req.query.report_month === "string" ? req.query.report_month : undefined,
      year: typeof req.query.year === "string" ? req.query.year : undefined,
    });
    res.status(200).type("application/json").send(JSON.stringify(payload));
  } catch (error) {
    console.error("[operations-renew-api] failed to build payload", error instanceof Error ? error.stack : error);
    res.status(500).type("application/json").send(JSON.stringify({
      error: "Failed to load renew data.",
    }));
  }
});

app.post("/api/agent/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const viewId = typeof req.body?.view_id === "string" ? req.body.view_id : "dashboard";
    const selectedFilters = req.body?.selected_filters && typeof req.body.selected_filters === "object"
      ? req.body.selected_filters
      : null;
    const sessionId = typeof req.body?.session_id === "string" ? req.body.session_id : null;
    const debug = req.body?.debug === true;
    const useIntentClassifier = req.body?.use_intent_classifier !== false;
    const useSkillFormatter = req.body?.use_skill_formatter !== false;

    const payload = await chatWithCrmAgent({
      messages,
      viewId,
      selectedFilters,
      sessionId,
      debug,
      useIntentClassifier,
      useSkillFormatter,
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
  hasNvidiaApiKey: Boolean(process.env.NVIDIA_API_KEY),
  nvidiaApiKeyLength: String(process.env.NVIDIA_API_KEY || "").length,
  crmAgentProvider: process.env.CRM_AGENT_PROVIDER || (process.env.NVIDIA_API_KEY ? "nvidia" : "gemini"),
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
  const scheduler = startSyncScheduler();
  if (scheduler.started) {
    console.log("[dashboard-api] interval sync scheduler started", {
      intervalMinutes: scheduler.intervalMinutes,
    });
  }
});


