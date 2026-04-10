import { foldText } from "../tooling/common.js";
import { createUsage } from "../contracts/chat-contracts.js";
import { detectTeamEntities } from "../skills/business-mappings.js";
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
  isIntentClassifierEnabled,
  usageFromMetadata
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
const FOLLOW_UP_PATTERN = /^(con|the|thang|quy|nam|so voi|thi sao|ra sao)\b|(\bthi sao\b|\bra sao\b|\bso voi\b)/;
const TREND_PATTERN = /(xu huong|trend|tang hay giam|giam hay tang|bat thuong|6 thang gan nhat)/;
const CAUSAL_PATTERN = /(tai sao|vi sao|nguyen nhan)/;
const GENERIC_SUMMARY_PATTERN = /^\s*(tom tat|tong quan|overview)(\s+(cho toi|giup toi|di|nhe|voi))?\s*$/;
const OUT_OF_SCOPE_PATTERN = /(nghi viec|thoi viec|resign|roi cong ty)/;

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

function isOperationsView(viewId) {
  return ["user-map", "active-map", "operations"].includes(String(viewId || ""));
}

function inferViewScopedOverviewIntent(context, result) {
  if (context.viewId === "dashboard") {
    result.primary_intent = "kpi_overview";
    result.action = "summarize";
    result.metric = "revenue";
    result.dimension = "time";
    result.confidence = 0.87;
    return result;
  }
  if (context.viewId === "renew") {
    result.primary_intent = "renew_summary";
    result.action = "summarize";
    result.metric = "renew";
    result.dimension = "time";
    result.confidence = 0.87;
    return result;
  }
  if (context.viewId === "team") {
    result.primary_intent = "team_revenue_summary";
    result.action = "summarize";
    result.metric = "revenue";
    result.dimension = "team";
    result.confidence = 0.86;
    return result;
  }
  if (context.viewId === "conversion") {
    result.primary_intent = "conversion_source_summary";
    result.action = "summarize";
    result.metric = "conversion";
    result.dimension = "source";
    result.confidence = 0.86;
    return result;
  }
  if (isOperationsView(context.viewId)) {
    result.primary_intent = "operations_summary";
    result.action = "summarize";
    result.metric = "active_rate";
    result.dimension = "category";
    result.confidence = 0.86;
    return result;
  }
  return null;
}

function shouldUseFollowUpInference(foldedQuestion, previousTopic) {
  if (!previousTopic || !foldedQuestion) {
    return false;
  }
  if (foldedQuestion.length > 40) {
    return false;
  }
  return FOLLOW_UP_PATTERN.test(foldedQuestion);
}

function buildRevenueClarification(result) {
  result.primary_intent = "unknown";
  result.action = "unknown";
  result.metric = "revenue";
  result.dimension = "unknown";
  result.ambiguity_flag = true;
  result.ambiguity_reason = "scope_unclear";
  result.clarification_question = "Bạn muốn xem doanh thu theo seller, team, nguồn hay tổng quan KPI?";
  result.confidence = 0.46;
  return result;
}

function inferIntentFromQuestion(question, context, options = {}) {
  const result = createIntentSkeleton();
  const foldedQuestion = foldText(question);
  const sellerName = context.connector.detectSellerName(question);
  const teamEntities = detectTeamEntities(question);
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
  const viewScopedOverviewIntent = KPI_PATTERN.test(foldedQuestion) ? inferViewScopedOverviewIntent(context, createIntentSkeleton()) : null;

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
  for (const team of teamEntities) {
    result.entities.push({
      type: "team",
      value: team.label
    });
  }

  if (GENERIC_SUMMARY_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "unknown";
    result.action = "unknown";
    result.metric = "unknown";
    result.dimension = "unknown";
    result.ambiguity_flag = true;
    result.ambiguity_reason = "summary_scope_unclear";
    result.clarification_question = "Bạn muốn tôi tóm tắt phần nào: nội dung hội thoại, KPI dashboard, team, renew hay operations?";
    result.confidence = 0.44;
    return result;
  }

  if (OUT_OF_SCOPE_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "unknown";
    result.action = "unknown";
    result.metric = "unknown";
    result.dimension = "unknown";
    result.ambiguity_flag = false;
    result.ambiguity_reason = "out_of_scope";
    result.clarification_question = "";
    result.confidence = 0.32;
    return result;
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
    result.clarification_question = "";
    result.confidence = 0.48;
    return result;
  }

  if ((TREND_PATTERN.test(foldedQuestion) || CAUSAL_PATTERN.test(foldedQuestion)) && revenueMatch) {
    result.primary_intent = "revenue_trend_analysis";
    result.action = "analyze";
    result.metric = "revenue";
    result.dimension = teamMatch ? "team" : "time";
    result.confidence = 0.89;
    return result;
  }

  if (compareMatch && teamEntities.length >= 2) {
    result.primary_intent = "team_revenue_summary";
    result.action = "compare";
    result.metric = revenueMatch ? "revenue" : /don/.test(foldedQuestion) ? "orders" : "revenue";
    result.dimension = "team";
    result.confidence = 0.9;
    return result;
  }

  if (revenueMatch && !sellerName && !teamMatch && !sourceMatch && !topMatch && !compareMatch && !renewMatch && !opsMatch && !conversionMatch) {
    return buildRevenueClarification(result);
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

  if (topMatch && (SELLER_PATTERN.test(foldedQuestion) || (revenueMatch && !teamMatch))) {
    result.primary_intent = "top_sellers_period";
    result.action = "rank";
    result.metric = "revenue";
    result.dimension = "seller";
    result.confidence = 0.9;
    return result;
  }

  if (/tinh hinh chung/.test(foldedQuestion)) {
    const scopedIntent = inferViewScopedOverviewIntent(context, result);
    if (scopedIntent) {
      return scopedIntent;
    }
    result.primary_intent = "unknown";
    result.ambiguity_flag = true;
    result.ambiguity_reason = "scope_unclear";
    result.clarification_question = "Bạn muốn xem tổng quan KPI, team, renew hay operations?";
    result.confidence = 0.4;
    return result;
  }

  if (!foldedQuestion && foldedPreviousTopic) {
    result.primary_intent = "unknown";
    result.ambiguity_flag = true;
    result.ambiguity_reason = "scope_unclear";
    result.clarification_question = "Bạn muốn xem tổng quan KPI, team, renew hay operations?";
    result.confidence = 0.4;
    return result;
  }

  if (viewScopedOverviewIntent) {
    return viewScopedOverviewIntent;
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

  if (!options.skipFollowUpInference && shouldUseFollowUpInference(foldedQuestion, previousTopic)) {
    const inferred = inferIntentFromQuestion(previousTopic.content, {
      ...context,
      recentTurnsForIntent: context.recentTurnsForIntent.slice(0, -1)
    }, {
      skipFollowUpInference: true
    });
    const currentSellerName = context.connector.detectSellerName(question);
    const currentTeamEntities = detectTeamEntities(question);
    if (currentSellerName) {
      inferred.entities = [{
        type: "seller",
        value: currentSellerName
      }];
      inferred.primary_intent = inferred.primary_intent === "unknown"
        ? "seller_revenue_month"
        : inferred.primary_intent;
      inferred.action = inferred.action === "unknown" ? "lookup" : inferred.action;
      inferred.metric = inferred.metric === "unknown" ? "revenue" : inferred.metric;
      inferred.dimension = "seller";
    }
    if (currentTeamEntities.length > 0) {
      inferred.entities = [
        ...inferred.entities.filter((entity) => entity.type !== "team"),
        ...currentTeamEntities.map((team) => ({
          type: "team",
          value: team.label
        }))
      ];
      inferred.dimension = "team";
    }
    if (/thang\s*\d{1,2}|\bquy\s*\d\b|\bnam\s*20\d{2}\b|\bthang nay\b|\bthang truoc\b|\bso voi\b/.test(foldedQuestion)) {
      inferred.time_window = {
        type: "explicit",
        value: foldedQuestion
      };
    }
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
      intent.clarification_question = intent.clarification_question || "Bạn có thể nói rõ hơn bạn muốn xem chỉ số nào không?";
    }
    return {
      intent,
      source: "classifier",
      usage: usageFromMetadata("intent_classifier", completion.usageMetadata, getDefaultProvider()),
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
  if (intent.ambiguity_reason === "multi_intent") {
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
