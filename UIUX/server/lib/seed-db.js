import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiuxDir = path.resolve(__dirname, "..", "..");
const projectRoot = path.resolve(uiuxDir, "..");

export async function ensureSeededCrmDb() {
  const dataDir = path.resolve(process.env.CRM_DATA_DIR || path.join(projectRoot, "data"));
  const crmDbPath = path.resolve(process.env.CRM_DB_PATH || path.join(dataDir, "crm.db"));
  const seedArchivePath = path.resolve(process.env.SEED_CRM_DB_GZ_PATH || path.join(projectRoot, "seed-data", "crm.db.gz"));

  await fs.promises.mkdir(path.dirname(crmDbPath), { recursive: true });

  if (fs.existsSync(crmDbPath)) {
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
