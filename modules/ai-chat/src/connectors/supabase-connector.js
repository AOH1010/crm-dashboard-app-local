import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { clamp, foldText, toJsonSafe } from "../tooling/common.js";
import { compareDateKeys, getSystemTodayDateKey } from "../tooling/date-utils.js";
import { DataConnector } from "./data-connector.js";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleRoot = path.resolve(__dirname, "..", "..");
const schemaRegistryPath = path.join(moduleRoot, "config", "schema-registry.json");

const VALID_SQL_START = /^\s*(select|with)\b/i;
const FORBIDDEN_SQL_KEYWORDS = /\b(insert|update|delete|drop|alter|create|replace|truncate|pragma|attach|detach|vacuum|reindex|analyze|begin|commit|rollback|grant|revoke)\b/i;
const TABLE_REFERENCE_PATTERN = /\b(?:from|join)\s+([a-zA-Z0-9_.`"[\]]+)/gi;
const CTE_NAME_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*\(/gi;
const MAX_SQL_LENGTH = 5000;
const DEFAULT_MAX_ROWS = 40;
const ABS_MAX_ROWS = 120;
const QUERY_TIMEOUT_MS = Number.parseInt(process.env.SUPABASE_QUERY_TIMEOUT_MS || "10000", 10);
const POOL_MAX = Number.parseInt(process.env.SUPABASE_POOL_MAX || "1", 10);
const POOL_IDLE_TIMEOUT_MS = Number.parseInt(process.env.SUPABASE_POOL_IDLE_TIMEOUT_MS || "30000", 10);
const POOL_CONNECTION_TIMEOUT_MS = Number.parseInt(process.env.SUPABASE_POOL_CONNECTION_TIMEOUT_MS || "10000", 10);
const SELLER_ALIAS_STOPWORDS = new Set([
  "nguyen",
  "tran",
  "le",
  "pham",
  "hoang",
  "vu",
  "vo",
  "dang",
  "do",
  "bui",
  "phan",
  "van",
  "thi",
  "thu",
  "anh",
  "thang",
  "nam",
  "nao",
  "the",
  "nhu",
  "cho",
  "toi",
  "tong",
  "quan",
  "tom",
  "tat",
  "doanh",
  "thu",
  "con",
  "ky",
  "roi"
]);
const SELLER_ALIAS_QUERY_STOPWORDS = new Set([
  "seller",
  "sale",
  "nguoi",
  "ban",
  "nao",
  "ai",
  "dang",
  "dan",
  "dau",
  "doanh",
  "thu",
  "dt",
  "revenue",
  "what",
  "whats",
  "the",
  "for",
  "thang",
  "nam",
  "quy",
  "nay",
  "truoc",
  "sau",
  "con",
  "thi",
  "sao",
  "lai",
  "thap",
  "cao",
  "a",
  "overview",
  "tong",
  "quan",
  "tom",
  "tat",
  "kpi",
  "he",
  "thong",
  "system"
]);
const poolCache = new Map();

function readSchemaRegistry() {
  return JSON.parse(fs.readFileSync(schemaRegistryPath, "utf8"));
}

function stripIdentifierWrapper(value) {
  return String(value || "")
    .trim()
    .replace(/^[`"[]/, "")
    .replace(/[`"\]]$/, "");
}

function normalizeTableToken(value) {
  const stripped = stripIdentifierWrapper(String(value || "").replace(/,+$/, ""));
  if (stripped.includes(".")) {
    const parts = stripped.split(".");
    return parts[parts.length - 1].toLowerCase();
  }
  return stripped.toLowerCase();
}

function extractCteNames(sql) {
  const cteNames = new Set();
  let match;
  while ((match = CTE_NAME_PATTERN.exec(sql)) !== null) {
    cteNames.add(String(match[1] || "").toLowerCase());
  }
  return cteNames;
}

function extractReferencedTables(sql) {
  const tables = [];
  let match;
  while ((match = TABLE_REFERENCE_PATTERN.exec(sql)) !== null) {
    const rawToken = String(match[1] || "").trim();
    if (rawToken.startsWith("(")) {
      continue;
    }
    tables.push(normalizeTableToken(rawToken));
  }
  return tables;
}

function getSupabaseUrl() {
  return String(
    process.env.SUPABASE_DATABASE_URL
    || process.env.SUPABASE_DIRECT_URL
    || process.env.DATABASE_URL
    || ""
  ).trim();
}

function rewritePlaceholders(sql) {
  let index = 0;
  return String(sql || "").replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function qualifyCanonicalTables(sql, schema, tableNames) {
  let rewritten = String(sql || "");
  for (const tableName of tableNames) {
    const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const referencePattern = new RegExp(`\\b(from|join)\\s+(${escapedTableName})\\b`, "gi");
    rewritten = rewritten.replace(referencePattern, (match, keyword, table) => (
      `${keyword} ${schema}.${table}`
    ));
  }
  return rewritten;
}

function normalizePostgresSql(sql, { schema, tableNames, allowPlaceholders }) {
  const qualifiedSql = qualifyCanonicalTables(sql, schema, tableNames);
  return allowPlaceholders ? rewritePlaceholders(qualifiedSql) : qualifiedSql;
}

export class SupabaseConnector extends DataConnector {
  constructor({
    schema = process.env.CRM_AGENT_DB_SCHEMA || "crm_agent",
    applicationName = process.env.SUPABASE_APPLICATION_NAME || "crm-dashboard-ai-chat"
  } = {}) {
    super();
    this.schema = schema;
    this.applicationName = applicationName;
    this.connectionString = getSupabaseUrl();
    this.schemaRegistry = readSchemaRegistry();
    this.tableEntries = this.schemaRegistry.tables;
    this.allowedCanonicalTables = new Set(Object.keys(this.tableEntries));
    this.allowedActualTables = new Set(Object.keys(this.tableEntries));
    this.runtimeState = {
      latestOrderDateKey: null,
      latestOperationsMonthEndKey: null,
      sellerNames: []
    };
    this.runtimeStatePromise = null;
  }

  ensureReady() {
    if (!this.connectionString) {
      throw new Error("SupabaseConnector is not configured. Set SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL.");
    }
    return true;
  }

  openDatabase() {
    throw new Error("SupabaseConnector does not expose a sync openDatabase() handle.");
  }

  resolveTable(canonicalName) {
    if (!this.tableEntries[canonicalName]) {
      return null;
    }
    return `${this.schema}.${canonicalName}`;
  }

  describeDomain(domainId) {
    const domain = this.schemaRegistry.domains[domainId];
    if (!domain) {
      return null;
    }
    return {
      id: domainId,
      description: domain.description,
      tables: domain.tables.map((tableId) => ({
        id: tableId,
        actual: this.resolveTable(tableId),
        description: this.tableEntries[tableId]?.description || "",
        columns: this.tableEntries[tableId]?.columns || []
      }))
    };
  }

  getDomainsForView(viewId) {
    return Array.from(new Set([
      ...(this.schemaRegistry.viewDomains[viewId] || ["dashboard", "sales"]),
      "dashboard",
      "sales",
      "operations"
    ]));
  }

  buildSchemaSummary(viewId) {
    const domains = this.getDomainsForView(viewId);
    return domains
      .map((domainId) => this.describeDomain(domainId))
      .filter(Boolean)
      .map((domain) => [
        `Domain ${domain.id}: ${domain.description}`,
        ...domain.tables.map((table) => (
          `- ${table.id} (${table.actual}) => ${table.description}. Columns: ${table.columns.join(", ")}`
        ))
      ].join("\n"))
      .join("\n\n");
  }

  assertSafeSql(rawSql, { allowPlaceholders = false } = {}) {
    const sqlText = String(rawSql || "")
      .trim()
      .replace(/;+$/g, "");

    if (sqlText.length === 0) {
      throw new Error("SQL query is empty.");
    }
    if (sqlText.length > MAX_SQL_LENGTH) {
      throw new Error("SQL query is too long.");
    }
    if (!VALID_SQL_START.test(sqlText)) {
      throw new Error("Only SELECT/WITH queries are allowed.");
    }
    if (FORBIDDEN_SQL_KEYWORDS.test(sqlText)) {
      throw new Error("Unsafe SQL keyword detected.");
    }
    if (sqlText.includes(";")) {
      throw new Error("Multiple SQL statements are not allowed.");
    }
    if (!allowPlaceholders && sqlText.includes("?")) {
      throw new Error("SQLite-style placeholders are not supported for Supabase fallback queries.");
    }

    const referencedTables = extractReferencedTables(sqlText);
    const cteNames = extractCteNames(sqlText);
    const invalidTable = referencedTables.find((tableName) => (
      tableName
      && !this.allowedCanonicalTables.has(tableName)
      && !this.allowedActualTables.has(tableName)
      && !cteNames.has(tableName)
    ));

    if (invalidTable) {
      throw new Error(`Table '${invalidTable}' is not allowed.`);
    }
    if (referencedTables.length === 0) {
      throw new Error("Query must reference at least one allowed table.");
    }

    return sqlText;
  }

  runReadQuery({ sql, params = [], allowPlaceholders = params.length > 0 } = {}) {
    this.assertSafeSql(sql, { allowPlaceholders });
    throw new Error(
      "SupabaseConnector query execution is gated until the V2 async connector refactor is complete. "
      + "Use SQLite for local runtime and run the V2 SQL audit/seed steps first."
    );
  }

  createPool() {
    this.ensureReady();
    const cacheKey = `${this.connectionString}::${this.applicationName}`;
    if (poolCache.has(cacheKey)) {
      return poolCache.get(cacheKey);
    }

    const pool = new Pool({
      connectionString: this.connectionString,
      ssl: { rejectUnauthorized: false },
      statement_timeout: QUERY_TIMEOUT_MS,
      query_timeout: QUERY_TIMEOUT_MS,
      application_name: this.applicationName,
      max: Math.max(1, POOL_MAX),
      idleTimeoutMillis: Math.max(1000, POOL_IDLE_TIMEOUT_MS),
      connectionTimeoutMillis: Math.max(1000, POOL_CONNECTION_TIMEOUT_MS),
      allowExitOnIdle: true
    });

    poolCache.set(cacheKey, pool);
    return pool;
  }

  async createClient() {
    return this.createPool().connect();
  }

  async releaseClient(client) {
    if (!client) {
      return;
    }
    if (typeof client.release === "function") {
      client.release();
      return;
    }
    if (typeof client.end === "function") {
      await client.end();
    }
  }

  async runReadQueryAsync({ sql, maxRows = DEFAULT_MAX_ROWS, params = [], allowPlaceholders = params.length > 0 } = {}) {
    const safeSql = this.assertSafeSql(sql, { allowPlaceholders });
    const rowLimit = clamp(Number(maxRows) || DEFAULT_MAX_ROWS, 1, ABS_MAX_ROWS);
    const postgresSql = normalizePostgresSql(safeSql, {
      schema: this.schema,
      tableNames: this.allowedCanonicalTables,
      allowPlaceholders
    });
    const client = await this.createClient();

    try {
      const result = await client.query(`SELECT * FROM (${postgresSql}) AS __crm_agent_result LIMIT ${rowLimit}`, params);
      const safeRows = result.rows.map((row) => {
        const safeRow = {};
        for (const [key, value] of Object.entries(row || {})) {
          safeRow[key] = toJsonSafe(value);
        }
        return safeRow;
      });

      return {
        sql: safeSql,
        postgres_sql: postgresSql,
        row_limit: rowLimit,
        row_count: safeRows.length,
        columns: result.fields.map((field) => field.name),
        rows: safeRows
      };
    } finally {
      await this.releaseClient(client);
    }
  }

  async initializeRuntimeState() {
    if (this.runtimeStatePromise) {
      await this.runtimeStatePromise;
      return this;
    }

    this.runtimeStatePromise = (async () => {
      const client = await this.createClient();
      try {
        const latestOrderResult = await client.query(`
          SELECT MAX(SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10)) AS latest_day
          FROM ${this.schema}.orders
          WHERE LENGTH(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10))) >= 10
        `);
        const latestOpsMetaResult = await client.query(`
          SELECT COALESCE(MAX(value), '') AS latest_status_month
          FROM ${this.schema}.operations_meta
          WHERE key = 'latest_status_month'
        `);
        const latestOpsFallbackResult = await client.query(`
          SELECT MAX(month_end_key) AS latest_month
          FROM ${this.schema}.monthly_status
        `);
        const sellerNamesResult = await client.query(`
          SELECT DISTINCT TRIM(COALESCE(name, '')) AS name
          FROM (
            SELECT saler_name AS name FROM ${this.schema}.orders
            UNION ALL
            SELECT contact_name AS name FROM ${this.schema}.staffs
          ) seller_names
          WHERE LENGTH(TRIM(COALESCE(name, ''))) > 0
        `);

        const latestOrderDateKey = String(latestOrderResult.rows?.[0]?.latest_day || "").trim() || getSystemTodayDateKey();
        const latestStatusMonth = String(latestOpsMetaResult.rows?.[0]?.latest_status_month || "").trim();
        const latestOpsFallback = String(latestOpsFallbackResult.rows?.[0]?.latest_month || "").trim();
        const latestOperationsMonthEndKey = latestStatusMonth && compareDateKeys(latestStatusMonth, "2000-01-01") > 0
          ? latestStatusMonth
          : (latestOpsFallback || null);
        const sellerNames = (sellerNamesResult.rows || [])
          .map((row) => String(row.name || "").trim())
          .filter(Boolean)
          .sort((left, right) => right.length - left.length || left.localeCompare(right));

        this.runtimeState = {
          latestOrderDateKey,
          latestOperationsMonthEndKey,
          sellerNames
        };
      } finally {
        await this.releaseClient(client);
      }
    })();

    await this.runtimeStatePromise;
    return this;
  }

  healthCheck() {
    return {
      ok: Boolean(this.connectionString),
      connector: "supabase",
      configured: Boolean(this.connectionString),
      schema: this.schema,
      query_runtime_ready: Boolean(this.connectionString),
      pooled: Boolean(this.connectionString),
      pool_max: Math.max(1, POOL_MAX),
      reason: this.connectionString
        ? "Configured for async pooled read-only queries. Sync runtime path remains gated."
        : "Missing SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL."
    };
  }

  getLatestOrderDateKey() {
    return this.runtimeState.latestOrderDateKey || getSystemTodayDateKey();
  }

  getLatestOrderYear() {
    return Number.parseInt(this.getLatestOrderDateKey().slice(0, 4), 10) || new Date().getFullYear();
  }

  getLatestMonthKey() {
    return this.getLatestOrderDateKey().slice(0, 7);
  }

  getLatestOperationsMonthEndKey() {
    return this.runtimeState.latestOperationsMonthEndKey || null;
  }

  getSellerNames() {
    return [...this.runtimeState.sellerNames];
  }

  detectSellerCandidates(question) {
    const foldedQuestion = foldText(question);
    const questionTokens = new Set(
      foldedQuestion
        .split(/\s+/)
        .filter((token) => token && !/^\d+$/.test(token) && !SELLER_ALIAS_QUERY_STOPWORDS.has(token))
    );
    const sellerNames = this.getSellerNames();

    const exactMatch = sellerNames.find((sellerName) => (
      foldText(sellerName).length >= 6 && foldedQuestion.includes(foldText(sellerName))
    ));
    if (exactMatch) {
      return [{ seller_name: exactMatch, score: 100 }];
    }

    if (questionTokens.size === 0) {
      return [];
    }

    return sellerNames
      .map((sellerName) => {
        const foldedName = foldText(sellerName);
        const tokens = foldedName.split(/\s+/).filter((token) => token.length >= 3);
        if (tokens.length === 0) {
          return null;
        }

        let score = 0;
        for (let index = 0; index < tokens.length; index += 1) {
          const token = tokens[index];
          if (!questionTokens.has(token)) {
            continue;
          }

          const isLastToken = index === tokens.length - 1;
          if (SELLER_ALIAS_STOPWORDS.has(token) && !isLastToken) {
            continue;
          }

          score += isLastToken ? 5 : SELLER_ALIAS_STOPWORDS.has(token) ? 3 : 2;
        }

        if (score === 0) {
          return null;
        }

        return {
          seller_name: sellerName,
          score
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || right.seller_name.length - left.seller_name.length || left.seller_name.localeCompare(right.seller_name));
  }

  detectSellerName(question) {
    const candidates = this.detectSellerCandidates(question);
    if (candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0].seller_name;
    }
    return candidates[0].score > candidates[1].score
      ? candidates[0].seller_name
      : null;
  }
}
