import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.resolve(process.env.CRM_DATA_DIR || path.join(projectRoot, "data"));
const crmDbPath = path.resolve(process.env.CRM_DB_PATH || path.join(dataDir, "crm.db"));
const seedArchivePath = path.resolve(process.env.SEED_CRM_DB_GZ_PATH || path.join(projectRoot, "seed-data", "crm.db.gz"));
const serverEntry = path.join(projectRoot, "UIUX", "server", "index.js");

async function seedDatabaseIfNeeded() {
  await fs.promises.mkdir(path.dirname(crmDbPath), { recursive: true });

  if (fs.existsSync(crmDbPath)) {
    console.log(`[railway] using existing crm.db at ${crmDbPath}`);
    return;
  }

  if (!fs.existsSync(seedArchivePath)) {
    console.warn(`[railway] missing seed archive at ${seedArchivePath}; starting without seeded crm.db`);
    return;
  }

  console.log(`[railway] seeding crm.db from ${seedArchivePath} to ${crmDbPath}`);
  await pipeline(
    fs.createReadStream(seedArchivePath),
    zlib.createGunzip(),
    fs.createWriteStream(crmDbPath),
  );
}

function forwardSignal(child, signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

await seedDatabaseIfNeeded();

const child = spawn("node", ["--experimental-sqlite", serverEntry], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

process.on("SIGINT", () => forwardSignal(child, "SIGINT"));
process.on("SIGTERM", () => forwardSignal(child, "SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
