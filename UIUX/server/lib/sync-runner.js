import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiuxDir = path.resolve(__dirname, "..", "..");
const projectRoot = path.resolve(uiuxDir, "..");
const pythonExecutable = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");
const logTailLimit = 200;
const syncAdminToken = String(process.env.SYNC_ADMIN_TOKEN || "").trim();
const syncLookbackHours = parseInteger(process.env.SYNC_LOOKBACK_HOURS, 6);
const syncStaffPageSize = parseInteger(process.env.SYNC_STAFF_PAGE_SIZE, 100);
const autoCustomerLimitPages = parseInteger(process.env.SYNC_CUSTOMER_AUTO_LIMIT_PAGES, 50);
const autoCustomerPageSize = parseInteger(process.env.SYNC_CUSTOMER_AUTO_PAGE_SIZE, 100);
const autoCustomerWorkers = parseInteger(process.env.SYNC_CUSTOMER_AUTO_WORKERS, 4);
const syncBootMode = String(process.env.SYNC_ON_BOOT || "").trim().toLowerCase();
const defaultMode = String(process.env.SYNC_DEFAULT_MODE || "auto").trim().toLowerCase();
const syncIntervalMinutes = parseInteger(process.env.SYNC_INTERVAL_MINUTES, 0);
const crmDbPath = path.resolve(process.env.CRM_DB_PATH || path.join(projectRoot, "data", "crm.db"));

const state = {
  activeRunId: null,
  running: false,
  queuedAt: null,
  startedAt: null,
  finishedAt: null,
  lastStatus: "idle",
  lastMode: null,
  lastTrigger: null,
  lastError: null,
  logTail: [],
};

let activeRunPromise = null;
let syncIntervalHandle = null;

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function appendLog(line) {
  if (!line) {
    return;
  }
  state.logTail.push(line);
  if (state.logTail.length > logTailLimit) {
    state.logTail.splice(0, state.logTail.length - logTailLimit);
  }
}

function logLine(prefix, line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return;
  }
  const entry = `${new Date().toISOString()} ${prefix} ${trimmed}`;
  appendLog(entry);
  console.log(entry);
}

function readSyncTable() {
  if (!fs.existsSync(crmDbPath)) {
    return [];
  }
  const db = new DatabaseSync(crmDbPath);
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 60000;
    `);
  } catch {
    // Ignore PRAGMA failures and continue with default settings.
  }
  try {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_state'")
      .get();
    if (!tableExists) {
      return [];
    }
    return db
      .prepare(
        `SELECT job_name, last_successful_updated_at, last_started_at, last_completed_at, last_status
         FROM sync_state
         ORDER BY job_name ASC`,
      )
      .all();
  } catch (error) {
    appendLog(`${new Date().toISOString()} [sync] failed to read sync_state: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  } finally {
    db.close();
  }
}

function buildMode(mode) {
  const normalized = String(mode || defaultMode || "incremental").trim().toLowerCase();
  if (normalized === "incremental") {
    return "auto";
  }
  if (normalized === "manual-full") {
    return "full";
  }
  if ([
    "auto",
    "full",
    "customers-auto",
    "orders-auto",
    "customers-full",
    "orders-full",
  ].includes(normalized)) {
    return normalized;
  }
  return "auto";
}

function buildCustomerAutoStep() {
  return {
    label: "customers-auto",
    command: pythonExecutable,
    args: [
      path.join(projectRoot, "tasks", "01_scrap", "scrape_getfly.py"),
      "--lookback-hours", String(Math.max(0, syncLookbackHours)),
      "--limit-pages", String(Math.max(1, autoCustomerLimitPages)),
      "--page-size", String(Math.max(1, autoCustomerPageSize)),
      "--workers", String(Math.max(1, autoCustomerWorkers)),
      "--skip-comments",
      "--prefer-recent-first",
    ],
  };
}

function buildCustomerFullStep() {
  return {
    label: "customers-full",
    command: pythonExecutable,
    args: [path.join(projectRoot, "tasks", "01_scrap", "scrape_getfly.py"), "--full-sync"],
  };
}

function buildOrdersAutoStep() {
  return {
    label: "orders-auto",
    command: pythonExecutable,
    args: [
      path.join(projectRoot, "tasks", "01_scrap", "scrape_orders.py"),
      "--lookback-hours", String(Math.max(0, syncLookbackHours)),
    ],
  };
}

function buildOrdersFullStep() {
  return {
    label: "orders-full",
    command: pythonExecutable,
    args: [path.join(projectRoot, "tasks", "01_scrap", "scrape_orders.py"), "--full-sync"],
  };
}

function buildSteps(mode) {
  const rebuildDashboardStep = {
    label: "dashboard-db",
    command: "node",
    args: ["--experimental-sqlite", path.join(projectRoot, "UIUX", "server", "build-dashboard-sales-db.js")],
  };

  if (mode === "full") {
    return [
      {
        label: "staffs",
        command: pythonExecutable,
        args: [path.join(projectRoot, "tasks", "01_scrap", "scrape_staff_group.py"), "--page-size", String(syncStaffPageSize)],
      },
      buildCustomerFullStep(),
      buildOrdersFullStep(),
      rebuildDashboardStep,
    ];
  }

  if (mode === "customers-full") {
    return [buildCustomerFullStep(), rebuildDashboardStep];
  }

  if (mode === "orders-full") {
    return [buildOrdersFullStep(), rebuildDashboardStep];
  }

  if (mode === "customers-auto") {
    return [buildCustomerAutoStep(), rebuildDashboardStep];
  }

  if (mode === "orders-auto") {
    return [buildOrdersAutoStep(), rebuildDashboardStep];
  }

  return [buildCustomerAutoStep(), buildOrdersAutoStep(), rebuildDashboardStep];
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const handleChunk = (streamName) => (chunk) => {
      const lines = String(chunk)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        logLine(`[sync:${step.label}:${streamName}]`, line);
      }
    };

    child.stdout.on("data", handleChunk("stdout"));
    child.stderr.on("data", handleChunk("stderr"));
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.label} exited with code ${code}`));
    });
  });
}

async function executeSyncRun({ mode, trigger }) {
  const steps = buildSteps(mode);
  for (const step of steps) {
    logLine("[sync]", `starting ${step.label}`);
    await runStep(step);
    logLine("[sync]", `completed ${step.label}`);
  }

  return {
    syncState: readSyncTable(),
    mode,
    trigger,
  };
}

export function isSyncEnabled() {
  return syncAdminToken.length > 0;
}

export function requireSyncAdminAuth(req, res, next) {
  if (!isSyncEnabled()) {
    res.status(503).json({ error: "Sync admin token is not configured." });
    return;
  }

  const authHeader = String(req.headers.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const directToken = String(req.headers["x-sync-token"] || "").trim();
  const providedToken = bearerToken || directToken;

  if (!providedToken || providedToken !== syncAdminToken) {
    res.status(401).json({ error: "Unauthorized sync request." });
    return;
  }

  next();
}

export function getSyncStatus() {
  return {
    ok: true,
    enabled: isSyncEnabled(),
    running: state.running,
    active_run_id: state.activeRunId,
    queued_at: state.queuedAt,
    started_at: state.startedAt,
    finished_at: state.finishedAt,
    last_status: state.lastStatus,
    last_mode: state.lastMode,
    last_trigger: state.lastTrigger,
    last_error: state.lastError,
    default_mode: buildMode(defaultMode),
    interval_minutes: syncIntervalMinutes,
    sync_state_rows: readSyncTable(),
    log_tail: state.logTail,
  };
}

export function triggerSync({ mode = defaultMode, trigger = "manual" } = {}) {
  const normalizedMode = buildMode(mode);
  if (activeRunPromise) {
    return {
      accepted: false,
      alreadyRunning: true,
      runId: state.activeRunId,
      status: getSyncStatus(),
    };
  }

  const runId = `sync-${Date.now()}`;
  state.activeRunId = runId;
  state.running = true;
  state.queuedAt = new Date().toISOString();
  state.startedAt = state.queuedAt;
  state.finishedAt = null;
  state.lastStatus = "running";
  state.lastMode = normalizedMode;
  state.lastTrigger = trigger;
  state.lastError = null;
  state.logTail = [];

  activeRunPromise = executeSyncRun({ mode: normalizedMode, trigger })
    .then(() => {
      state.lastStatus = "success";
    })
    .catch((error) => {
      state.lastStatus = "failed";
      state.lastError = error instanceof Error ? error.message : String(error);
      logLine("[sync]", `failed: ${state.lastError}`);
    })
    .finally(() => {
      state.running = false;
      state.finishedAt = new Date().toISOString();
      activeRunPromise = null;
    });

  return {
    accepted: true,
    alreadyRunning: false,
    runId,
    status: getSyncStatus(),
  };
}

export function shouldSyncOnBoot() {
  return syncBootMode === "true"
    || syncBootMode === "incremental"
    || syncBootMode === "full"
    || syncBootMode === "auto"
    || syncBootMode === "customers-auto"
    || syncBootMode === "orders-auto";
}

export function getBootSyncMode() {
  if (syncBootMode === "true" || !syncBootMode) {
    return buildMode(defaultMode);
  }
  return buildMode(syncBootMode);
}

export function startSyncScheduler() {
  if (syncIntervalHandle || syncIntervalMinutes <= 0) {
    return {
      enabled: syncIntervalMinutes > 0,
      intervalMinutes: syncIntervalMinutes,
      started: false,
    };
  }

  const intervalMs = syncIntervalMinutes * 60 * 1000;
  syncIntervalHandle = setInterval(() => {
    const result = triggerSync({
      mode: defaultMode,
      trigger: "interval",
    });
    if (result.alreadyRunning) {
      logLine("[sync]", `interval skipped because run ${result.runId} is already active`);
    }
  }, intervalMs);
  syncIntervalHandle.unref?.();

  return {
    enabled: true,
    intervalMinutes: syncIntervalMinutes,
    started: true,
  };
}
