import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
const seedDir = path.join(projectRoot, "artifacts", "v2-supabase", "seed-export");
const manifestPath = path.join(seedDir, "manifest.json");
const schema = String(process.env.CRM_AGENT_DB_SCHEMA || "crm_agent").trim() || "crm_agent";
const batchSize = Number.parseInt(process.env.SUPABASE_SEED_BATCH_SIZE || "500", 10);

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

function getSeedConnectionString() {
  return String(
    process.env.SUPABASE_SEED_DATABASE_URL
    || process.env.SUPABASE_ADMIN_DATABASE_URL
    || ""
  ).trim();
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
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

function buildInsert({ tableName, rows }) {
  if (rows.length === 0) {
    return null;
  }
  const columns = Object.keys(rows[0]);
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const rowPlaceholders = columns.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });

  return {
    sql: `
      insert into ${schema}.${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(", ")})
      values ${placeholders.join(", ")}
      on conflict do nothing
    `,
    values
  };
}

async function seedTable(client, table) {
  const filePath = path.join(projectRoot, table.file);
  const rows = readJsonl(filePath);
  await client.query(`truncate table ${schema}.${quoteIdentifier(table.table)} restart identity cascade`);

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const insert = buildInsert({ tableName: table.table, rows: batch });
    if (insert) {
      await client.query(insert.sql, insert.values);
    }
  }

  const count = await client.query(`select count(*)::int as row_count from ${schema}.${quoteIdentifier(table.table)}`);
  return {
    table: table.table,
    exported_rows: rows.length,
    inserted_rows: Number(count.rows[0]?.row_count || 0)
  };
}

async function alignKnownSchemaDrift(client) {
  await client.query(`alter table ${schema}.orders alter column payment_status type text using payment_status::text`);
  await client.query(`alter table ${schema}.staffs drop constraint if exists staffs_pkey`);
  await client.query(`alter table ${schema}.staffs add primary key (user_id)`);
}

async function main() {
  loadDotEnv(envPath);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing seed export manifest at ${manifestPath}. Run npm run v2:export-supabase-seed first.`);
  }
  const connectionString = getSeedConnectionString();
  if (!connectionString) {
    throw new Error("Missing SUPABASE_SEED_DATABASE_URL or SUPABASE_ADMIN_DATABASE_URL in .env.");
  }
  if (/crm_agent_readonly/i.test(connectionString)) {
    throw new Error("Refusing to seed with crm_agent_readonly. Use a temporary admin/seed connection string.");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
    query_timeout: 60_000,
    application_name: "crm-seed-script"
  });

  await client.connect();
  const results = [];
  try {
    await client.query("begin");
    await alignKnownSchemaDrift(client);
    for (const table of manifest.tables) {
      results.push(await seedTable(client, table));
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  console.log(JSON.stringify({
    ok: results.every((result) => result.exported_rows === result.inserted_rows),
    schema,
    table_count: results.length,
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
