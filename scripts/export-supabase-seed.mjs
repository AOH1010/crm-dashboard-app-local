import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const schemaRegistryPath = path.join(projectRoot, "modules", "ai-chat", "config", "schema-registry.json");
const dataDir = path.resolve(process.env.CRM_DATA_DIR || path.join(projectRoot, "data"));
const dbPaths = {
  main: path.resolve(process.env.CRM_DB_PATH || path.join(dataDir, "crm.db")),
  dashboard: path.resolve(process.env.DASHBOARD_DB_PATH || path.join(dataDir, "dashboard_sales.db")),
  operations: path.resolve(process.env.OPERATIONS_DB_PATH || path.join(dataDir, "dashboard_operations.db"))
};
const outputDir = path.join(projectRoot, "artifacts", "v2-supabase", "seed-export");
const rowLimit = Number.parseInt(String(process.env.SUPABASE_SEED_EXPORT_LIMIT || "0"), 10);

function readSchemaRegistry() {
  return JSON.parse(fs.readFileSync(schemaRegistryPath, "utf8"));
}

function parseActualTable(actual) {
  const parts = String(actual || "").split(".");
  if (parts.length === 1) {
    return { dbKey: "main", table: parts[0] };
  }
  return { dbKey: parts[0], table: parts.slice(1).join(".") };
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function openDb(dbKey) {
  const dbPath = dbPaths[dbKey];
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error(`Missing ${dbKey} database at ${dbPath || "(unknown)"}`);
  }
  return new DatabaseSync(dbPath);
}

function exportTable({ canonicalName, actual }) {
  const { dbKey, table } = parseActualTable(actual);
  const db = openDb(dbKey);
  const outputPath = path.join(outputDir, `${canonicalName}.jsonl`);
  let count = 0;

  try {
    const sql = `SELECT * FROM ${quoteIdentifier(table)}${rowLimit > 0 ? ` LIMIT ${rowLimit}` : ""}`;
    const rows = db.prepare(sql).all();
    const content = rows.map((row) => JSON.stringify(row)).join("\n");
    fs.writeFileSync(outputPath, content ? `${content}\n` : "");
    count = rows.length;
  } finally {
    db.close();
  }

  return {
    table: canonicalName,
    actual,
    row_count: count,
    file: path.relative(projectRoot, outputPath).replace(/\\/g, "/")
  };
}

const registry = readSchemaRegistry();
fs.mkdirSync(outputDir, { recursive: true });

const startedAt = new Date().toISOString();
const tables = [];
for (const [canonicalName, entry] of Object.entries(registry.tables)) {
  tables.push(exportTable({
    canonicalName,
    actual: entry.actual
  }));
}

const manifest = {
  generated_at: startedAt,
  row_limit: rowLimit > 0 ? rowLimit : null,
  source_databases: dbPaths,
  schema_registry_version: registry.version,
  tables
};
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  table_count: tables.length,
  manifest_path: path.relative(projectRoot, manifestPath).replace(/\\/g, "/")
}, null, 2));
