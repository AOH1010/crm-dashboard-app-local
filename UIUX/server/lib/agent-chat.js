import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  createPartFromFunctionResponse,
  FunctionCallingConfigMode,
  GoogleGenAI,
} from "@google/genai";
import { buildSkillPrompt } from "./agent-skill.js";
import {
  CRM_DB_PATH,
  DASHBOARD_DB_PATH,
  ensureDashboardSalesDb,
} from "./dashboard-sales-db.js";

const QUERY_FUNCTION_NAME = "query_crm_data";
const DEFAULT_MODEL = process.env.CRM_AGENT_MODEL || "gemini-2.5-flash";
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 6;
const DEFAULT_MAX_ROWS = 40;
const ABS_MAX_ROWS = 120;
const MAX_SQL_LENGTH = 4000;
const VALID_SQL_START = /^\s*(select|with)\b/i;
const FORBIDDEN_SQL_KEYWORDS = /\b(insert|update|delete|drop|alter|create|replace|truncate|pragma|attach|detach|vacuum|reindex|analyze|begin|commit|rollback)\b/i;
const TABLE_REFERENCE_PATTERN = /\b(?:from|join)\s+([a-zA-Z0-9_.`"[\]]+)/gi;
const CTE_NAME_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*\(/gi;

const ALLOWED_TABLES = new Set([
  "customers",
  "orders",
  "staffs",
  "dashboard_kpis_daily",
  "dashboard_revenue_series",
  "dashboard_sales_leaderboard_monthly",
  "dashboard_recent_orders",
  "dashboard_meta",
]);

const QUERY_TOOL_DECLARATION = {
  name: QUERY_FUNCTION_NAME,
  description: "Run a read-only SQL query on internal CRM data and return rows.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "SQLite SELECT query using customers/orders/staffs and dashboard.* tables.",
      },
      max_rows: {
        type: "number",
        description: "Max rows required for this query (1-120).",
      },
    },
    required: ["sql"],
    additionalProperties: false,
  },
};

let aiClient = null;
let schemaCache = null;
let schemaCacheSignature = null;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function toJsonSafe(value) {
  if (typeof value === "bigint") {
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : String(value);
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  return value;
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

function assertSafeSql(rawSql) {
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
  if (sqlText.includes("?")) {
    throw new Error("SQL placeholders are not supported.");
  }

  const referencedTables = extractReferencedTables(sqlText);
  const cteNames = extractCteNames(sqlText);
  const invalidTable = referencedTables.find((tableName) => (
    tableName
    && !ALLOWED_TABLES.has(tableName)
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

function addSafeLimit(sqlText, maxRows) {
  const safeRows = clamp(Number(maxRows) || DEFAULT_MAX_ROWS, 1, ABS_MAX_ROWS);
  return {
    sql: `SELECT * FROM (${sqlText}) AS __crm_agent_result LIMIT ${safeRows}`,
    rowLimit: safeRows,
  };
}

function closeDatabase(db) {
  try {
    db.close();
  } catch {
    // Ignore close errors.
  }
}

function openAgentDatabase() {
  const db = new DatabaseSync(CRM_DB_PATH);
  const escapedDashboardPath = DASHBOARD_DB_PATH.replace(/'/g, "''");
  db.exec(`ATTACH DATABASE '${escapedDashboardPath}' AS dashboard`);
  return db;
}

function buildSchemaHint() {
  const crmMtime = fs.statSync(CRM_DB_PATH).mtimeMs;
  const dashboardMtime = fs.existsSync(DASHBOARD_DB_PATH)
    ? fs.statSync(DASHBOARD_DB_PATH).mtimeMs
    : 0;
  const nextSignature = `${crmMtime}|${dashboardMtime}`;

  if (schemaCache && schemaCacheSignature === nextSignature) {
    return schemaCache;
  }

  const tableSpecs = [
    { dbName: "main", tableName: "customers" },
    { dbName: "main", tableName: "orders" },
    { dbName: "main", tableName: "staffs" },
    { dbName: "dashboard", tableName: "dashboard_kpis_daily" },
    { dbName: "dashboard", tableName: "dashboard_revenue_series" },
    { dbName: "dashboard", tableName: "dashboard_sales_leaderboard_monthly" },
    { dbName: "dashboard", tableName: "dashboard_recent_orders" },
    { dbName: "dashboard", tableName: "dashboard_meta" },
  ];

  const db = openAgentDatabase();
  try {
    const lines = tableSpecs.map(({ dbName, tableName }) => {
      const rows = db.prepare(`PRAGMA ${dbName}.table_info(${tableName})`).all();
      const columns = rows.map((row) => (
        `${row.name}:${String(row.type || "TEXT").toUpperCase()}`
      ));
      return `- ${dbName}.${tableName}(${columns.join(", ")})`;
    });

    schemaCache = lines.join("\n");
    schemaCacheSignature = nextSignature;
    return schemaCache;
  } finally {
    closeDatabase(db);
  }
}

function getAiClient() {
  if (aiClient) {
    return aiClient;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }
  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: typeof item?.content === "string" ? item.content.trim() : "",
    }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

function toGeminiContent(messages) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

function executeSqlQuery({ sql, maxRows }) {
  const safeSql = assertSafeSql(sql);
  const { sql: limitedSql, rowLimit } = addSafeLimit(safeSql, maxRows);
  const db = openAgentDatabase();

  try {
    const rows = db.prepare(limitedSql).all();
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
      rows: safeRows,
    };
  } finally {
    closeDatabase(db);
  }
}

export async function chatWithCrmAgent({
  messages,
  viewId,
}) {
  ensureDashboardSalesDb();

  const normalizedMessages = normalizeMessages(messages);
  if (normalizedMessages.length === 0) {
    return {
      reply: "Vui lòng gửi câu hỏi về dữ liệu CRM.",
      sql_logs: [],
    };
  }

  const latestMessage = normalizedMessages[normalizedMessages.length - 1];
  if (latestMessage.role !== "user") {
    return {
      reply: "Vui lòng gửi câu hỏi mới từ người dùng.",
      sql_logs: [],
    };
  }

  const ai = getAiClient();
  const schemaHint = buildSchemaHint();
  const systemInstruction = buildSkillPrompt({ viewId, schemaHint });
  const sqlLogs = [];
  const contents = toGeminiContent(normalizedMessages);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const functionCallingConfig = round === 0
      ? {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames: [QUERY_FUNCTION_NAME],
      }
      : {
        mode: FunctionCallingConfigMode.AUTO,
      };

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents,
      config: {
        temperature: 0.15,
        systemInstruction,
        tools: [{ functionDeclarations: [QUERY_TOOL_DECLARATION] }],
        toolConfig: {
          functionCallingConfig,
        },
      },
    });

    const functionCalls = response.functionCalls || [];
    if (functionCalls.length === 0) {
      const textReply = String(response.text || "").trim();
      return {
        reply: textReply.length > 0
          ? textReply
          : "Không tìm thấy kết quả phù hợp trong dữ liệu hiện tại.",
        sql_logs: sqlLogs,
      };
    }

    if (response.candidates?.[0]?.content) {
      contents.push(response.candidates[0].content);
    }

    const functionParts = functionCalls.map((call, index) => {
      const args = call.args || {};

      try {
        const result = executeSqlQuery({
          sql: args.sql,
          maxRows: args.max_rows,
        });

        sqlLogs.push({
          name: call.name || QUERY_FUNCTION_NAME,
          sql: result.sql,
          row_count: result.row_count,
          row_limit: result.row_limit,
        });

        return createPartFromFunctionResponse(
          call.id || `call_${Date.now()}_${index}`,
          call.name || QUERY_FUNCTION_NAME,
          { output: result },
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown SQL execution error.";
        sqlLogs.push({
          name: call.name || QUERY_FUNCTION_NAME,
          sql: typeof args.sql === "string" ? args.sql : "",
          row_count: 0,
          row_limit: 0,
          error: errorMessage,
        });

        return createPartFromFunctionResponse(
          call.id || `call_${Date.now()}_${index}`,
          call.name || QUERY_FUNCTION_NAME,
          { error: errorMessage },
        );
      }
    });

    contents.push({
      role: "user",
      parts: functionParts,
    });
  }

  return {
    reply: "Đã vượt số lần truy vấn an toàn. Vui lòng hỏi lại với phạm vi nhỏ hơn.",
    sql_logs: sqlLogs,
  };
}
