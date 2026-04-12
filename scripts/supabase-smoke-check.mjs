import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
const schemaRegistryPath = path.join(projectRoot, "modules", "ai-chat", "config", "schema-registry.json");

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

function getConnectionString() {
  return String(
    process.env.SUPABASE_DATABASE_URL
    || process.env.SUPABASE_DIRECT_URL
    || ""
  ).trim();
}

function getExpectedTables() {
  const registry = JSON.parse(fs.readFileSync(schemaRegistryPath, "utf8"));
  return Object.keys(registry.tables).sort();
}

async function main() {
  loadDotEnv(envPath);
  const connectionString = getConnectionString();
  const schema = String(process.env.CRM_AGENT_DB_SCHEMA || "crm_agent").trim() || "crm_agent";

  if (!connectionString) {
    throw new Error("Missing SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in .env.");
  }

  const expectedTables = getExpectedTables();
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 10_000,
    query_timeout: 10_000,
    application_name: "crm-readonly-smoke"
  });

  await client.connect();
  try {
    const identity = await client.query("select current_user as current_user, current_database() as current_database");
    const schemaRows = await client.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = $1
        order by table_name
      `,
      [schema]
    );
    const actualTables = schemaRows.rows.map((row) => row.table_name);
    const missingTables = expectedTables.filter((table) => !actualTables.includes(table));
    const counts = [];
    for (const table of expectedTables.filter((table) => actualTables.includes(table))) {
      const result = await client.query(`select count(*)::int as row_count from ${schema}.${table}`);
      counts.push({
        table,
        row_count: Number(result.rows[0]?.row_count || 0)
      });
    }

    let readonlyCheck = "unknown";
    try {
      await client.query(`create table ${schema}.__crm_agent_write_probe (id int)`);
      readonlyCheck = "failed_write_allowed";
      await client.query(`drop table if exists ${schema}.__crm_agent_write_probe`);
    } catch {
      readonlyCheck = "passed_write_blocked";
    }

    console.log(JSON.stringify({
      ok: missingTables.length === 0 && readonlyCheck === "passed_write_blocked",
      current_user: identity.rows[0]?.current_user || null,
      current_database: identity.rows[0]?.current_database || null,
      schema,
      expected_table_count: expectedTables.length,
      actual_table_count: actualTables.length,
      missing_tables: missingTables,
      readonly_check: readonlyCheck,
      counts
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
});
