import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendAppDir = path.resolve(__dirname, "..", "..");
const projectRoot = path.resolve(backendAppDir, "..", "..");

function hasCoreTables(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return false;
  }

  let db;
  try {
    db = new DatabaseSync(dbPath);
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders', 'customers')")
      .all();
    return rows.length === 2;
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close failures when checking local seed DB state.
    }
  }
}

function resolveSeedArchivePath(projectRoot) {
  const explicitPath = process.env.SEED_CRM_DB_GZ_PATH;
  const candidates = [
    explicitPath,
    path.join(projectRoot, "seed-data", "crm.db.gz"),
    path.join(projectRoot, "data", "crm.db.gz"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return path.resolve(candidates[0] || path.join(projectRoot, "seed-data", "crm.db.gz"));
}

export async function ensureSeededCrmDb() {
  const dataDir = path.resolve(process.env.CRM_DATA_DIR || path.join(projectRoot, "data"));
  const crmDbPath = path.resolve(process.env.CRM_DB_PATH || path.join(dataDir, "crm.db"));
  const seedArchivePath = resolveSeedArchivePath(projectRoot);

  await fs.promises.mkdir(path.dirname(crmDbPath), { recursive: true });

  if (hasCoreTables(crmDbPath)) {
    return {
      seeded: false,
      crmDbPath,
      seedArchivePath,
    };
  }

  if (!fs.existsSync(seedArchivePath)) {
    return {
      seeded: false,
      missingSeedArchive: true,
      crmDbPath,
      seedArchivePath,
    };
  }

  if (fs.existsSync(crmDbPath)) {
    await fs.promises.rm(crmDbPath, { force: true });
  }

  await pipeline(
    fs.createReadStream(seedArchivePath),
    zlib.createGunzip(),
    fs.createWriteStream(crmDbPath),
  );

  return {
    seeded: true,
    crmDbPath,
    seedArchivePath,
  };
}


