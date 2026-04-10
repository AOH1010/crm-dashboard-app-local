import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { clamp, foldText, toJsonSafe } from "../tooling/common.js";
import { compareDateKeys, getSystemTodayDateKey } from "../tooling/date-utils.js";
import { CRM_DB_PATH, DASHBOARD_DB_PATH, ensureDashboardSalesDb } from "../../../../apps/backend/src/lib/dashboard-sales-db.js";
import { OPERATIONS_DB_PATH } from "../../../../apps/backend/src/lib/operations-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleRoot = path.resolve(__dirname, "..", "..");
const schemaRegistryPath = path.join(moduleRoot, "config", "schema-registry.json");

const VALID_SQL_START = /^\s*(select|with)\b/i;
const FORBIDDEN_SQL_KEYWORDS = /\b(insert|update|delete|drop|alter|create(?!\s+temp\s+view)|replace|truncate|pragma|attach|detach|vacuum|reindex|analyze|begin|commit|rollback)\b/i;
const TABLE_REFERENCE_PATTERN = /\b(?:from|join)\s+([a-zA-Z0-9_.`"[\]]+)/gi;
const CTE_NAME_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*\(/gi;
const DEFAULT_MAX_ROWS = 40;
const ABS_MAX_ROWS = 120;
const MAX_SQL_LENGTH = 5000;
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
let dashboardReady = false;

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

function closeDatabase(db) {
  try {
    db.close();
  } catch {
    // Ignore close errors.
  }
}

export class SQLiteConnector {
  constructor() {
    this.schemaRegistry = readSchemaRegistry();
    this.tableEntries = this.schemaRegistry.tables;
    this.allowedCanonicalTables = new Set(Object.keys(this.tableEntries));
    this.allowedActualTables = new Set(
      Object.values(this.tableEntries).map((entry) => normalizeTableToken(entry.actual))
    );
  }

  ensureReady() {
    if (dashboardReady) {
      return;
    }
    ensureDashboardSalesDb();
    dashboardReady = true;
  }

  openDatabase() {
    this.ensureReady();
    const db = new DatabaseSync(CRM_DB_PATH);
    try {
      db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 60000;
      `);
    } catch {
      // Ignore PRAGMA failures.
    }

    if (fs.existsSync(DASHBOARD_DB_PATH)) {
      const escapedDashboardPath = DASHBOARD_DB_PATH.replace(/'/g, "''");
      db.exec(`ATTACH DATABASE '${escapedDashboardPath}' AS dashboard`);
    }
    if (fs.existsSync(OPERATIONS_DB_PATH)) {
      const escapedOperationsPath = OPERATIONS_DB_PATH.replace(/'/g, "''");
      db.exec(`ATTACH DATABASE '${escapedOperationsPath}' AS operations`);
    }

    for (const [canonicalName, entry] of Object.entries(this.tableEntries)) {
      if (normalizeTableToken(entry.actual) === canonicalName) {
        continue;
      }
      db.exec(`CREATE TEMP VIEW IF NOT EXISTS ${canonicalName} AS SELECT * FROM ${entry.actual}`);
    }

    return db;
  }

  resolveTable(canonicalName) {
    return this.tableEntries[canonicalName]?.actual || null;
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
    return this.schemaRegistry.viewDomains[viewId] || ["dashboard", "sales"];
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
      throw new Error("SQL placeholders are not supported in fallback queries.");
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

  runReadQuery({ sql, maxRows = DEFAULT_MAX_ROWS, params = [], allowPlaceholders = params.length > 0 }) {
    const safeSql = this.assertSafeSql(sql, { allowPlaceholders });
    const rowLimit = clamp(Number(maxRows) || DEFAULT_MAX_ROWS, 1, ABS_MAX_ROWS);
    const db = this.openDatabase();

    try {
      const rows = db.prepare(`SELECT * FROM (${safeSql}) AS __crm_agent_result LIMIT ${rowLimit}`).all(...params);
      const safeRows = rows.map((row) => {
        const safeRow = {};
        for (const [key, value] of Object.entries(row || {})) {
          safeRow[key] = toJsonSafe(value);
        }
        return safeRow;
      });

      return {
        sql: safeSql,
        row_limit: rowLimit,
        row_count: safeRows.length,
        columns: safeRows.length > 0 ? Object.keys(safeRows[0]) : [],
        rows: safeRows
      };
    } finally {
      closeDatabase(db);
    }
  }

  healthCheck() {
    return {
      ok: fs.existsSync(CRM_DB_PATH),
      crm_db_path: CRM_DB_PATH,
      has_dashboard_db: fs.existsSync(DASHBOARD_DB_PATH),
      has_operations_db: fs.existsSync(OPERATIONS_DB_PATH)
    };
  }

  getLatestOrderDateKey() {
    const db = this.openDatabase();
    try {
      const row = db.prepare(`
        SELECT MAX(SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10)) AS latest_day
        FROM orders
        WHERE LENGTH(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10))) >= 10
      `).get();
      return row?.latest_day || getSystemTodayDateKey();
    } finally {
      closeDatabase(db);
    }
  }

  getLatestOrderYear() {
    return Number.parseInt(this.getLatestOrderDateKey().slice(0, 4), 10) || new Date().getFullYear();
  }

  getLatestMonthKey() {
    return this.getLatestOrderDateKey().slice(0, 7);
  }

  getSellerNames() {
    const db = this.openDatabase();
    try {
      const rows = db.prepare(`
        SELECT DISTINCT TRIM(COALESCE(name, '')) AS name
        FROM (
          SELECT saler_name AS name FROM orders
          UNION ALL
          SELECT contact_name AS name FROM staffs
        )
        WHERE LENGTH(TRIM(COALESCE(name, ''))) > 0
      `).all();
      return rows
        .map((row) => String(row.name || "").trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length || left.localeCompare(right));
    } finally {
      closeDatabase(db);
    }
  }

  detectSellerName(question) {
    const foldedQuestion = foldText(question);
    const questionTokens = new Set(foldedQuestion.split(/\s+/).filter(Boolean));
    const sellerNames = this.getSellerNames();
    const exactMatch = sellerNames.find((sellerName) => (
      foldText(sellerName).length >= 6 && foldedQuestion.includes(foldText(sellerName))
    ));
    if (exactMatch) {
      return exactMatch;
    }

    const tokenMatches = sellerNames.filter((sellerName) => {
      const foldedName = foldText(sellerName);
      const tokens = foldedName
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !SELLER_ALIAS_STOPWORDS.has(token));
      if (tokens.length === 0) {
        return false;
      }
      return tokens.some((token) => questionTokens.has(token));
    });

    if (tokenMatches.length === 1) {
      return tokenMatches[0];
    }

    return null;
  }

  getLatestOperationsMonthEndKey() {
    const db = this.openDatabase();
    try {
      const row = db.prepare(`
        SELECT COALESCE(MAX(value), '') AS latest_status_month
        FROM operations_meta
        WHERE key = 'latest_status_month'
      `).get();
      const latest = String(row?.latest_status_month || "");
      if (latest && compareDateKeys(latest, "2000-01-01") > 0) {
        return latest;
      }
      const fallback = db.prepare(`
        SELECT MAX(month_end_key) AS latest_month
        FROM monthly_status
      `).get();
      return fallback?.latest_month || null;
    } finally {
      closeDatabase(db);
    }
  }
}
