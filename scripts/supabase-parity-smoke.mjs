import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SQLiteConnector, SupabaseConnector } from "../modules/ai-chat/src/connectors/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
}

const checks = [
  {
    id: "orders_count",
    sql: "SELECT COUNT(*) AS row_count FROM orders",
    maxRows: 1
  },
  {
    id: "customers_count",
    sql: "SELECT COUNT(*) AS row_count FROM customers",
    maxRows: 1
  },
  {
    id: "kpis_daily_count",
    sql: "SELECT COUNT(*) AS row_count FROM kpis_daily",
    maxRows: 1
  },
  {
    id: "latest_order_day",
    sql: `
      SELECT MAX(SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10)) AS latest_day
      FROM orders
    `,
    maxRows: 1
  }
];

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  const asNumber = Number(value);
  return Number.isFinite(asNumber) && String(value).trim() !== "" ? asNumber : String(value);
}

async function main() {
  loadDotEnv(envPath);
  const sqlite = new SQLiteConnector();
  const supabase = new SupabaseConnector({
    applicationName: "crm-parity-smoke"
  });
  const results = [];

  for (const check of checks) {
    const sqliteResult = sqlite.runReadQuery(check);
    const supabaseResult = await supabase.runReadQueryAsync(check);
    const sqliteRow = sqliteResult.rows[0] || {};
    const supabaseRow = supabaseResult.rows[0] || {};
    const sqliteValue = normalizeValue(Object.values(sqliteRow)[0]);
    const supabaseValue = normalizeValue(Object.values(supabaseRow)[0]);
    results.push({
      id: check.id,
      pass: sqliteValue === supabaseValue,
      sqlite_value: sqliteValue,
      supabase_value: supabaseValue,
      sqlite_row_count: sqliteResult.row_count,
      supabase_row_count: supabaseResult.row_count
    });
  }

  console.log(JSON.stringify({
    ok: results.every((result) => result.pass),
    checked_at: new Date().toISOString(),
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
});
