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
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 6;
const DEFAULT_MAX_ROWS = 40;
const ABS_MAX_ROWS = 120;
const MAX_SQL_LENGTH = 4000;
const NVIDIA_CHAT_URL = process.env.NVIDIA_CHAT_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MAX_TOKENS = Number.parseInt(process.env.CRM_AGENT_MAX_TOKENS || "2048", 10);
const NVIDIA_TEMPERATURE = Number.parseFloat(process.env.CRM_AGENT_TEMPERATURE || "0.15");
const NVIDIA_TOP_P = Number.parseFloat(process.env.CRM_AGENT_TOP_P || "0.95");
const NVIDIA_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.CRM_AGENT_REQUEST_TIMEOUT_MS || "30000", 10);
const NVIDIA_ENABLE_THINKING = String(process.env.CRM_AGENT_ENABLE_THINKING || "false").trim().toLowerCase() === "true";
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

const NVIDIA_TOOL_DECLARATION = {
  type: "function",
  function: {
    name: QUERY_TOOL_DECLARATION.name,
    description: QUERY_TOOL_DECLARATION.description,
    parameters: QUERY_TOOL_DECLARATION.parametersJsonSchema,
  },
};

let aiClient = null;
let schemaCache = null;
let schemaCacheSignature = null;
let sellerNameCache = null;
let sellerNameCacheSignature = null;

function getDefaultProvider() {
  return String(process.env.CRM_AGENT_PROVIDER || "").trim().toLowerCase() || "gemini";
}

function getDefaultModel() {
  return process.env.CRM_AGENT_MODEL
    || (getDefaultProvider() === "nvidia" ? "google/gemma-4-31b-it" : "gemini-2.5-flash-lite");
}

function createEmptyUsage() {
  return {
    provider: getDefaultProvider(),
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    thoughts_tokens: 0,
    tool_use_prompt_tokens: 0,
  };
}

function accumulateUsage(target, usageMetadata) {
  if (!usageMetadata) {
    return target;
  }

  target.prompt_tokens += Number(usageMetadata.promptTokenCount || 0);
  target.completion_tokens += Number(usageMetadata.candidatesTokenCount || 0);
  target.total_tokens += Number(usageMetadata.totalTokenCount || 0);
  target.thoughts_tokens += Number(usageMetadata.thoughtsTokenCount || 0);
  target.tool_use_prompt_tokens += Number(usageMetadata.toolUsePromptTokenCount || 0);
  return target;
}

function accumulateNvidiaUsage(target, usage) {
  if (!usage) {
    return target;
  }

  target.prompt_tokens += Number(usage.prompt_tokens || 0);
  target.completion_tokens += Number(usage.completion_tokens || 0);
  target.total_tokens += Number(usage.total_tokens || 0);
  return target;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function foldText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[đĐ]/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 60000;
    `);
  } catch {
    // Ignore PRAGMA failures and continue with default settings.
  }
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

function buildSellerNameCache() {
  const crmMtime = fs.statSync(CRM_DB_PATH).mtimeMs;
  if (sellerNameCache && sellerNameCacheSignature === String(crmMtime)) {
    return sellerNameCache;
  }

  const db = openAgentDatabase();
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

    const canonicalNames = rows
      .map((row) => String(row.name || "").trim())
      .filter((value) => value.length > 0)
      .sort((left, right) => right.length - left.length || left.localeCompare(right));

    sellerNameCache = canonicalNames.map((name) => ({
      canonical: name,
      folded: foldText(name),
    }));
    sellerNameCacheSignature = String(crmMtime);
    return sellerNameCache;
  } finally {
    closeDatabase(db);
  }
}

function getLatestOrderYear() {
  const db = openAgentDatabase();
  try {
    const row = db.prepare(`
      SELECT MAX(SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 4)) AS latest_year
      FROM orders
      WHERE LENGTH(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10))) >= 10
    `).get();
    return Number.parseInt(String(row?.latest_year || ""), 10) || new Date().getFullYear();
  } finally {
    closeDatabase(db);
  }
}

function extractMonthYear(question) {
  const normalized = foldText(question);
  const monthMatch = normalized.match(/\bthang\s*(\d{1,2})\b/);
  if (!monthMatch) {
    return null;
  }

  const month = Number.parseInt(monthMatch[1], 10);
  if (month < 1 || month > 12) {
    return null;
  }

  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  return {
    month,
    year: yearMatch ? Number.parseInt(yearMatch[1], 10) : null,
  };
}

function detectSellerName(question) {
  const foldedQuestion = foldText(question);
  const sellerNames = buildSellerNameCache();
  return sellerNames.find((entry) => (
    entry.folded.length >= 6 && foldedQuestion.includes(entry.folded)
  ))?.canonical || null;
}

function isLikelySellerRevenueQuestion(question) {
  const foldedQuestion = foldText(question);
  if (/(doanh so|doanh thu|revenue|ban duoc bao nhieu)/.test(foldedQuestion)) {
    return true;
  }

  const monthInfo = extractMonthYear(question);
  const sellerName = detectSellerName(question);
  return Boolean(monthInfo && sellerName);
}

function maybeHandleDirectSellerRevenueQuestion(question) {
  if (!isLikelySellerRevenueQuestion(question)) {
    return null;
  }

  const sellerName = detectSellerName(question);
  const monthInfo = extractMonthYear(question);
  if (!sellerName || !monthInfo) {
    return null;
  }

  const assumedYear = monthInfo.year || getLatestOrderYear();
  const monthKey = `${assumedYear}-${String(monthInfo.month).padStart(2, "0")}`;
  const db = openAgentDatabase();

  try {
    const rows = db.prepare(`
      SELECT
        COALESCE(real_amount, 0) AS amount,
        TRIM(COALESCE(status_label, '')) AS status_label,
        COALESCE(NULLIF(TRIM(order_code), ''), 'N/A') AS order_code
      FROM orders
      WHERE TRIM(COALESCE(saler_name, '')) = ?
        AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) = ?
    `).all(sellerName, monthKey);

    const nonCancelledRows = rows.filter((row) => !foldText(row.status_label).includes("huy"));
    const totalRevenue = nonCancelledRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const orderCount = nonCancelledRows.length;

    if (orderCount === 0) {
      return {
        reply: `Khong tim thay doanh so cua ${sellerName} trong thang ${monthInfo.month}/${assumedYear}.`,
        sql_logs: [{
          name: "direct_seller_month_revenue",
          sql: `orders by saler_name='${sellerName}' and month='${monthKey}'`,
          row_count: 0,
          row_limit: 0,
        }],
      };
    }

    const assumptionText = monthInfo.year ? "" : ` (mac dinh nam ${assumedYear})`;
    return {
      reply: [
        `${sellerName} dat doanh so ${Math.round(totalRevenue).toLocaleString("vi-VN")} VND trong thang ${monthInfo.month}/${assumedYear}${assumptionText}.`,
        `- So don khong huy: ${orderCount}.`,
        `- Doanh thu binh quan/don: ${Math.round(totalRevenue / orderCount).toLocaleString("vi-VN")} VND.`,
      ].join("\n"),
      sql_logs: [{
        name: "direct_seller_month_revenue",
        sql: `orders by saler_name='${sellerName}' and month='${monthKey}'`,
        row_count: orderCount,
        row_limit: orderCount,
      }],
    };
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

function getNvidiaApiKey() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY in environment.");
  }
  return apiKey;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const normalized = messages
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: typeof item?.content === "string" ? item.content.trim() : "",
    }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);

  while (normalized.length > 0 && normalized[0].role !== "user") {
    normalized.shift();
  }

  return normalized;
}

function toGeminiContent(messages) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

function toNvidiaMessages(messages, systemInstruction) {
  return [
    { role: "system", content: systemInstruction },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
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

async function callNvidiaChatCompletion({ messages, tools }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NVIDIA_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(NVIDIA_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getNvidiaApiKey()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getDefaultModel(),
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: NVIDIA_MAX_TOKENS,
        temperature: NVIDIA_TEMPERATURE,
        top_p: NVIDIA_TOP_P,
        stream: false,
        chat_template_kwargs: {
          enable_thinking: NVIDIA_ENABLE_THINKING,
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`NVIDIA chat completion timed out after ${NVIDIA_REQUEST_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA chat completion failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  return response.json();
}

async function chatWithNvidiaAgent({
  normalizedMessages,
  viewId,
  usage,
}) {
  const schemaHint = buildSchemaHint();
  const systemInstruction = buildSkillPrompt({ viewId, schemaHint });
  const sqlLogs = [];
  const messages = toNvidiaMessages(normalizedMessages, systemInstruction);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await callNvidiaChatCompletion({
      messages,
      tools: [NVIDIA_TOOL_DECLARATION],
    });
    accumulateNvidiaUsage(usage, response.usage);

    const choice = response?.choices?.[0] || {};
    const assistantMessage = choice.message || {};
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];

    if (toolCalls.length === 0) {
      const textReply = String(
        assistantMessage.content
        || assistantMessage.reasoning_content
        || assistantMessage.reasoning
        || "",
      ).trim();

      return {
        reply: textReply.length > 0
          ? textReply
          : "Khong tim thay ket qua phu hop trong du lieu hien tai.",
        sql_logs: sqlLogs,
        usage,
      };
    }

    messages.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const functionName = toolCall?.function?.name || QUERY_FUNCTION_NAME;
      let args = {};

      try {
        args = JSON.parse(toolCall?.function?.arguments || "{}");
      } catch {
        args = {};
      }

      try {
        const result = executeSqlQuery({
          sql: args.sql,
          maxRows: args.max_rows,
        });

        sqlLogs.push({
          name: functionName,
          sql: result.sql,
          row_count: result.row_count,
          row_limit: result.row_limit,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown SQL execution error.";
        sqlLogs.push({
          name: functionName,
          sql: typeof args.sql === "string" ? args.sql : "",
          row_count: 0,
          row_limit: 0,
          error: errorMessage,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMessage }),
        });
      }
    }
  }

  return {
    reply: "Da vuot so lan truy van an toan. Vui long hoi lai voi pham vi nho hon.",
    sql_logs: [],
    usage,
  };
}

export async function chatWithCrmAgent({
  messages,
  viewId,
}) {
  ensureDashboardSalesDb();
  const usage = createEmptyUsage();

  const normalizedMessages = normalizeMessages(messages);
  if (normalizedMessages.length === 0) {
    return {
      reply: "Vui lòng gửi câu hỏi về dữ liệu CRM.",
      sql_logs: [],
      usage,
    };
  }

  const latestMessage = normalizedMessages[normalizedMessages.length - 1];
  if (latestMessage.role !== "user") {
    return {
      reply: "Vui lòng gửi câu hỏi mới từ người dùng.",
      sql_logs: [],
      usage,
    };
  }

  const directRevenueAnswer = maybeHandleDirectSellerRevenueQuestion(latestMessage.content);
  if (directRevenueAnswer) {
    return {
      ...directRevenueAnswer,
      usage,
    };
  }

  if (getDefaultProvider() === "nvidia") {
    return chatWithNvidiaAgent({
      normalizedMessages,
      viewId,
      usage,
    });
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
      model: getDefaultModel(),
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
    accumulateUsage(usage, response.usageMetadata);

    const functionCalls = response.functionCalls || [];
    if (functionCalls.length === 0) {
      const textReply = String(response.text || "").trim();
      return {
        reply: textReply.length > 0
          ? textReply
          : "Không tìm thấy kết quả phù hợp trong dữ liệu hiện tại.",
        sql_logs: sqlLogs,
        usage,
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
    usage,
  };
}
