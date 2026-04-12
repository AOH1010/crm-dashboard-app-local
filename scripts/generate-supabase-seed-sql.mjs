import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const seedDir = path.join(projectRoot, "artifacts", "v2-supabase", "seed-export");
const manifestPath = path.join(seedDir, "manifest.json");
const outputPath = path.join(projectRoot, "artifacts", "v2-supabase", "supabase-seed.sql");
const schema = String(process.env.CRM_AGENT_DB_SCHEMA || "crm_agent").trim() || "crm_agent";

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing seed manifest at ${manifestPath}. Run npm run v2:export-supabase-seed first.`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const statements = [
  "-- Generated seed SQL for Supabase CRM agent schema.",
  "-- Contains raw CRM data. Do not commit this file.",
  "begin;",
  ""
];

for (const table of manifest.tables) {
  const rows = readJsonl(path.join(projectRoot, table.file));
  statements.push(`truncate table ${schema}.${quoteIdentifier(table.table)} restart identity cascade;`);
  if (rows.length === 0) {
    statements.push("");
    continue;
  }

  const columns = Object.keys(rows[0]);
  const columnList = columns.map(quoteIdentifier).join(", ");
  const values = rows.map((row) => (
    `(${columns.map((column) => toSqlLiteral(row[column])).join(", ")})`
  ));
  statements.push(`insert into ${schema}.${quoteIdentifier(table.table)} (${columnList}) values`);
  statements.push(values.join(",\n"));
  statements.push("on conflict do nothing;");
  statements.push("");
}

statements.push("commit;");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${statements.join("\n")}\n`);

console.log(JSON.stringify({
  ok: true,
  output_path: path.relative(projectRoot, outputPath).replace(/\\/g, "/"),
  table_count: manifest.tables.length
}, null, 2));
