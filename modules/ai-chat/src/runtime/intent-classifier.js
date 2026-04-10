import { foldText } from "../tooling/common.js";
import { createUsage } from "../contracts/chat-contracts.js";
import {
  ACTION_TYPES,
  CLASSIFIER_ROUTE_CLARIFY_THRESHOLD,
  CLASSIFIER_ROUTE_SKILL_THRESHOLD,
  DIMENSION_TYPES,
  INTENT_TYPES,
  METRIC_TYPES,
  OUTPUT_MODES
} from "./intent-catalog.js";
import {
  callJsonCompletion,
  getDefaultProvider,
  getIntentModel,
  getIntentTimeoutMs,
  hasConfiguredProviderKey,
  isIntentClassifierEnabled
} from "./model-runtime.js";

const REVENUE_PATTERN = /(doanh so|doanh thu|revenue|ban duoc bao nhieu)/;
const TOP_PATTERN = /(top|xep hang|dan dau|cao nhat|lon nhat|nhieu nhat)/;
const SELLER_PATTERN = /(seller|sale|nhan vien|nguoi ban)/;
const TEAM_PATTERN = /(team|nhom|phong ban|dept)/;
const KPI_PATTERN = /(kpi|tong quan|tom tat|overview|tinh hinh chung)/;
const COMPARE_PATTERN = /(so sanh|compare|voi ky truoc)/;
const RENEW_PATTERN = /(renew|gia han|sap het han|den han|due)/;
const OPS_PATTERN = /(active|inactive|best|ghost|noise|value|hoat dong|operations|category)/;
const CONVERSION_PATTERN = /(conversion|chuyen doi|khach moi|lead)/;
const SOURCE_PATTERN = /(nguon|source)/;
const CUSTOMER_PATTERN = /(khach hang|customer)/;
const LEAD_GEO_PATTERN = /(tinh|thanh pho|province|dia ly)/;
const COHORT_PATTERN = /(cohort)/;
const TABLE_PATTERN = /(bang|table|hien thi bang)/;
const MULTI_PATTERN = /\b(va|dong thoi|kem theo|ngoai ra|sau do)\b/;

function createIntentSkeleton() {
  return {
    primary_intent: "unknown",
    action: "unknown",
    metric: "unknown",
    dimension: "unknown",
    entities: [],
    time_window: {
      type: "unknown",
      value: "unknown"
    },
    output_mode: "summary",
    ambiguity_flag: false,
    ambiguity_reason: "",
    clarification_question: "",
    confidence: 0.2
  };
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || "").trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeIntentResult(rawResult) {
  const base = createIntentSkeleton();
  const result = {
    ...base,
    ...rawResult
  };
  result.primary_intent = normalizeEnum(result.primary_intent, INTENT_TYPES, "unknown");
  result.action = normalizeEnum(result.action, ACTION_TYPES, "unknown");
  result.metric = normalizeEnum(result.metric, METRIC_TYPES, "unknown");
  result.dimension = normalizeEnum(result.dimension, DIMENSION_TYPES, "unknown");
  result.output_mode = normalizeEnum(result.output_mode, OUTPUT_MODES, "unknown");
  result.entities = Array.isArray(result.entities)
    ? result.entities
      .map((entity) => ({
        type: String(entity?.type || "unknown"),
        value: String(entity?.value || "").trim()
      }))
      .filter((entity) => entity.value.length > 0)
    : [];
  result.time_window = typeof result.time_window === "object" && result.time_window
    ? {
      type: String(result.time_window.type || "unknown"),
      value: String(result.time_window.value || "unknown")
    }
    : base.time_window;
  result.ambiguity_flag = result.ambiguity_flag === true;
  result.ambiguity_reason = String(result.ambiguity_reason || "").trim();
  result.clarification_question = String(result.clarification_question || "").trim();
  const confidence = Number(result.confidence);
  result.confidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : base.confidence;
  return result;
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function inferIntentFromQuestion(question, context) {
  const result = createIntentSkeleton();
  const foldedQuestion = foldText(question);
  const sellerName = context.connector.detectSellerName(question);
  const previousTopic = context.recentTurnsForIntent
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "user");
  const foldedPreviousTopic = foldText(previousTopic?.content || "");

  const teamMatch = TEAM_PATTERN.test(foldedQuestion);
  const sellerMatch = SELLER_PATTERN.test(foldedQuestion) || Boolean(sellerName);
  const revenueMatch = REVENUE_PATTERN.test(foldedQuestion);
  const compareMatch = COMPARE_PATTERN.test(foldedQuestion);
  const topMatch = TOP_PATTERN.test(foldedQuestion);
  const renewMatch = RENEW_PATTERN.test(foldedQuestion);
  const opsMatch = OPS_PATTERN.test(foldedQuestion);
  const conversionMatch = CONVERSION_PATTERN.test(foldedQuestion);
  const sourceMatch = SOURCE_PATTERN.test(foldedQuestion);
  const kpiMatch = KPI_PATTERN.test(foldedQuestion);
  const customerMatch = CUSTOMER_PATTERN.test(foldedQuestion);
  const leadGeoMatch = LEAD_GEO_PATTERN.test(foldedQuestion);
  const cohortMatch = COHORT_PATTERN.test(foldedQuestion);
  const multiMatch = MULTI_PATTERN.test(foldedQuestion);

  result.output_mode = TABLE_PATTERN.test(foldedQuestion)
    ? "table"
    : topMatch
      ? "ranking"
      : compareMatch
        ? "comparison"
        : "summary";

  if (sellerName) {
    result.entities.push({
      type: "seller",
      value: sellerName
    });
  }

  if (renewMatch) {
    result.primary_intent = "renew_summary";
    result.action = "summarize";
    result.metric = "renew";
    result.dimension = "time";
    result.confidence = 0.91;
    return result;
  }

  if (multiMatch && ((teamMatch && sourceMatch) || (revenueMatch && conversionMatch))) {
    result.primary_intent = "unknown";
    result.ambiguity_flag = true;
    result.ambiguity_reason = "multi_intent";
    result.clarification_question = "Ban muon uu tien xem team doanh thu hay nhom nguon conversion truoc?";
    result.confidence = 0.78;
    return result;
  }

  if (opsMatch && !conversionMatch) {
    result.primary_intent = "operations_summary";
    result.action = "summarize";
    result.metric = "active_rate";
    result.dimension = "category";
    result.confidence = 0.9;
    return result;
  }

  if (conversionMatch && sourceMatch) {
    result.primary_intent = "conversion_source_summary";
    result.action = topMatch ? "rank" : "summarize";
    result.metric = "conversion";
    result.dimension = "source";
    result.confidence = 0.92;
    return result;
  }

  if (teamMatch && revenueMatch) {
    result.primary_intent = "team_revenue_summary";
    result.action = compareMatch ? "compare" : topMatch ? "rank" : "summarize";
    result.metric = "revenue";
    result.dimension = "team";
    result.confidence = 0.92;
    return result;
  }

  if (compareMatch && !teamMatch) {
    result.primary_intent = "period_comparison";
    result.action = "compare";
    result.metric = revenueMatch ? "revenue" : "unknown";
    result.dimension = "time";
    result.confidence = 0.88;
    return result;
  }

  if (sellerName && revenueMatch) {
    result.primary_intent = "seller_revenue_month";
    result.action = "lookup";
    result.metric = "revenue";
    result.dimension = "seller";
    result.confidence = 0.94;
    return result;
  }

  if (topMatch && SELLER_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "top_sellers_period";
    result.action = "rank";
    result.metric = "revenue";
    result.dimension = "seller";
    result.confidence = 0.9;
    return result;
  }

  if (/tinh hinh chung/.test(foldedQuestion) || (!foldedQuestion && foldedPreviousTopic)) {
    result.primary_intent = "unknown";
    result.ambiguity_flag = true;
    result.ambiguity_reason = "scope_unclear";
    result.clarification_question = "Ban muon xem tong quan KPI, team, renew hay operations?";
    result.confidence = 0.4;
    return result;
  }

  if (kpiMatch && (context.viewId === "dashboard" || !teamMatch)) {
    result.primary_intent = "kpi_overview";
    result.action = "summarize";
    result.metric = "revenue";
    result.dimension = "time";
    result.confidence = 0.87;
    return result;
  }

  if (customerMatch) {
    result.primary_intent = "customer_lookup";
    result.action = "lookup";
    result.metric = "customer_count";
    result.dimension = "customer";
    result.confidence = 0.65;
    return result;
  }

  if (leadGeoMatch && CONVERSION_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "lead_geography";
    result.action = "rank";
    result.metric = "lead_count";
    result.dimension = "province";
    result.confidence = 0.65;
    return result;
  }

  if (cohortMatch) {
    result.primary_intent = "cohort_summary";
    result.action = "summarize";
    result.metric = "active_rate";
    result.dimension = "time";
    result.confidence = 0.62;
    return result;
  }

  if (foldedQuestion.length <= 18 && previousTopic && /thang\s*\d{1,2}/.test(foldedQuestion)) {
    const inferred = inferIntentFromQuestion(previousTopic.content, {
      ...context,
      recentTurnsForIntent: context.recentTurnsForIntent.slice(0, -1)
    });
    inferred.time_window = {
      type: "explicit",
      value: foldedQuestion
    };
    inferred.confidence = Math.max(inferred.confidence, 0.86);
    return inferred;
  }

  result.primary_intent = "custom_analytical_query";
  result.action = "analyze";
  result.metric = revenueMatch ? "revenue" : conversionMatch ? "conversion" : "unknown";
  result.dimension = teamMatch ? "team" : sourceMatch ? "source" : customerMatch ? "customer" : "unknown";
  result.confidence = 0.42;
  return result;
}

export function classifyIntentLegacy(context) {
  const latestQuestion = context.latestUserMessage?.content || context.latestQuestion || "";
  const legacyIntent = inferIntentFromQuestion(latestQuestion, context);
  return {
    intent: normalizeIntentResult(legacyIntent),
    source: "legacy_rules",
    usage: createUsage("legacy_rules"),
    debugReason: null
  };
}

export async function classifyIntent({
  context,
  promptRegistry,
  useIntentClassifier = true
}) {
  if (!useIntentClassifier || !isIntentClassifierEnabled() || !hasConfiguredProviderKey(getDefaultProvider())) {
    return classifyIntentLegacy(context);
  }

  const prompt = promptRegistry.buildIntentClassifierPrompt({
    viewId: context.viewId,
    requestContext: context
  });

  try {
    const completion = await callJsonCompletion({
      messages: context.recentTurnsForIntent,
      prompt,
      model: getIntentModel(),
      provider: getDefaultProvider(),
      timeoutMs: getIntentTimeoutMs(),
      maxOutputTokens: 200
    });
    const parsed = parseJsonPayload(completion.text);
    if (!parsed) {
      return {
        ...classifyIntentLegacy(context),
        debugReason: "intent_classifier_invalid_json"
      };
    }
    const intent = normalizeIntentResult(parsed);
    if (intent.primary_intent === "unknown" && !intent.ambiguity_flag && intent.confidence < CLASSIFIER_ROUTE_CLARIFY_THRESHOLD) {
      intent.ambiguity_flag = true;
      intent.ambiguity_reason = "unknown_intent";
      intent.clarification_question = intent.clarification_question || "Ban co the noi ro hon ban muon xem chi so nao khong?";
    }
    return {
      intent,
      source: "classifier",
      usage: createUsage("intent_classifier"),
      debugReason: null
    };
  } catch {
    return {
      ...classifyIntentLegacy(context),
      debugReason: "intent_classifier_failed"
    };
  }
}

export function resolveRouteFromIntent(intent) {
  if (!intent) {
    return "llm_fallback";
  }
  if (intent.primary_intent === "custom_analytical_query") {
    return "llm_fallback";
  }
  if (intent.primary_intent === "unknown" && intent.ambiguity_flag) {
    return "clarify_required";
  }
  if (intent.ambiguity_flag) {
    return "clarify_required";
  }
  if (intent.confidence >= CLASSIFIER_ROUTE_SKILL_THRESHOLD) {
    return "skill";
  }
  if (intent.confidence >= CLASSIFIER_ROUTE_CLARIFY_THRESHOLD) {
    return "clarify_required";
  }
  return "llm_fallback";
}
