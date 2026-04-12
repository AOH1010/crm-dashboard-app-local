import { foldText } from "../tooling/common.js";
import { createUsage } from "../contracts/chat-contracts.js";
import { detectSourceGroupIntent, detectTeamEntities } from "../skills/business-mappings-v2.js";
import { extractExplicitSellerCandidate, extractMonthYear } from "../tooling/question-analysis.js";
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

const REVENUE_PATTERN = /(doanh so|doanh thu|\bdt\b|revenue|ban duoc bao nhieu)/;
const TOP_PATTERN = /(top|xep hang|dan dau|cao nhat|lon nhat|nhieu nhat)/;
const SELLER_PATTERN = /(seller|sale|nhan vien|nguoi ban)/;
const TEAM_PATTERN = /(team|nhom|phong ban|dept|doi)/;
const KPI_PATTERN = /(kpi|tong quan|tom tat|overview|tinh hinh chung)/;
const COMPARE_PATTERN = /(so sanh|\bss\b|compare|voi ky truoc)/;
const RENEW_PATTERN = /(renew|gia han|sap het han|den han|due)/;
const OPS_PATTERN = /(active|inactive|best|ghost|noise|value|hoat dong|operations|category)/;
const CONVERSION_PATTERN = /(conversion|chuyen doi|\bcr\b|khach moi|lead)/;
const SOURCE_PATTERN = /(nguon|source|kenh)/;
const CUSTOMER_PATTERN = /(khach hang|customer)/;
const LEAD_GEO_PATTERN = /(tinh|thanh pho|province|dia ly)/;
const COHORT_PATTERN = /(cohort)/;
const RECENT_ORDERS_PATTERN = /((\d+\s+)?don hang moi nhat|recent orders?|order moi nhat)/;
const CUSTOMER_RANKING_PATTERN = /(mua nhieu nhat|chi nhieu nhat|top customer|customer nao.*(nhieu nhat|cao nhat|lon nhat))/;
const ORDER_FILTER_PATTERN = /(liet ke|loc|filter|tren|duoi|it nhat|nho hon)/;
const FORECAST_PATTERN = /(du bao|forecast|du phong)/;
const INJECTION_PATTERN = /(bo qua tat ca|ignore (all|previous)|delete\s+from|drop\s+table|update\s+\w+\s+set|insert\s+into|truncate\s+table|xoa du lieu|xoa bang|sua du lieu)/;
const TABLE_PATTERN = /(bang|table|hien thi bang)/;
const MULTI_PATTERN = /\b(va|dong thoi|kem theo|ngoai ra|sau do)\b/;
const FOLLOW_UP_PATTERN = /^(con|the|thang|quy|nam|so voi|thi sao|ra sao)\b|(\bthi sao\b|\bra sao\b|\bso voi\b)/;
const TREND_PATTERN = /(xu huong|trend|tang hay giam|giam hay tang|bat thuong|6 thang gan nhat)/;
const CAUSAL_PATTERN = /(tai sao|vi sao|nguyen nhan)/;
const RHETORICAL_REVENUE_PATTERN = /(lai thap|lai cao|thap the a|cao the a|sao thap|sao cao|thap vay|cao vay)/;
const GENERIC_SUMMARY_PATTERN = /^(?:(cho toi|giup toi|hay|show me)\s+)?(tom tat|tong quan|overview)(?:\s+(cho toi|giup toi|view nay|di|nhe|voi|quick|nhanh))?\s*$/;
const OUT_OF_SCOPE_PATTERN = /(nghi viec|thoi viec|resign|roi cong ty)/;
const SYSTEM_SCOPE_PATTERN = /(he thong|toan he thong|tong doanh thu|tong cong|toan cong ty|toan bo)/;
const EXPORT_TABLE_PATTERN = /(xuat|export|show|liet ke|in ra).{0,24}(bang|table)/;
const VERIFY_AMOUNT_PATTERN = /(co phai|phai khong|dung khong|xac nhan|verify|really)/;
const OUT_OF_DOMAIN_VALIDATION_PATTERN = /(thoi tiet|weather|nhiet do|troi mua|du bao thoi tiet|tin tuc|news hom nay)/;
const FOLLOW_UP_DRILLDOWN_PATTERN = /(phan tich them|chi tiet hon|dao sau|them ve|noi ro hon|lam ro hon)/;
const SELLER_TOKEN_STOPWORDS = new Set([
  "con",
  "thi",
  "sao",
  "ai",
  "nao",
  "seller",
  "sale",
  "nguoi",
  "ban",
  "dang",
  "dan",
  "dau",
  "thang",
  "nam",
  "quy",
  "doanh",
  "thu",
  "dt",
  "revenue",
  "what",
  "whats",
  "the",
  "for",
  "top",
  "kpi",
  "phan",
  "tich",
  "them",
  "ve",
  "cho",
  "toi",
  "nua",
  "nay",
  "kia",
  "he",
  "thong",
  "system",
  "lai",
  "thap",
  "cao",
  "a"
]);

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
  if (foldedQuestion.length > 120) {
    return false;
  }
  return FOLLOW_UP_PATTERN.test(foldedQuestion) || FOLLOW_UP_DRILLDOWN_PATTERN.test(foldedQuestion);
}

function extractMeaningfulTokens(text) {
  return foldText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !SELLER_TOKEN_STOPWORDS.has(token));
}

function looksLikeEntityOnlyFollowUp(foldedQuestion) {
  if (!foldedQuestion) {
    return false;
  }

  if (/(doanh thu|doanh so|top|kpi|renew|operations|source|nguon|lead|team|tom tat|tong quan|so sanh|compare)/.test(foldedQuestion)) {
    return false;
  }

  const tokens = foldedQuestion.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.length <= 8;
}

function hasAnalyticalFocusCue(foldedQuestion) {
  return /(doanh thu|doanh so|\bdt\b|revenue|lead|khach moi|khach hang moi|conversion|\bcr\b|nguon|source|kenh|don hang|so don|seller|sale)/.test(foldedQuestion);
}

function isSellerVerificationFollowUp(foldedQuestion) {
  return /(check lai|xac nhan lai|so nay|van khop|co khop|khop khong|neu lech|dang ra hoi khac|bang xep hang|bang top seller)/.test(foldedQuestion);
}

function isSaleOwnerAccountPerformanceAsk(foldedQuestion) {
  return (/(quan ly|phu trach)/.test(foldedQuestion) && /\baccount\b/.test(foldedQuestion) && /(sale|owner|nhan vien sale)/.test(foldedQuestion))
    || (/\baccount\b/.test(foldedQuestion) && /(ty le active|active the nao|active ratio)/.test(foldedQuestion) && /(sale|owner|nhan vien sale)/.test(foldedQuestion));
}

function isExecutiveMultiDomainAsk({
  foldedQuestion,
  multiMatch,
  revenueMatch,
  topMatch,
  renewMatch,
  opsMatch,
  conversionMatch,
  sourceMatch,
  teamMatch,
}) {
  const domainCount = [
    revenueMatch,
    topMatch,
    renewMatch,
    opsMatch || /\bactivate|kich hoat|active\b/.test(foldedQuestion),
    conversionMatch || sourceMatch,
  ].filter(Boolean).length;

  if (domainCount < 3) {
    return false;
  }

  if (teamMatch && /(so sanh|hieu suat|seller active|so don)/.test(foldedQuestion)) {
    return false;
  }

  return multiMatch || /(buc tranh toan canh|full picture|toan canh|ceo)/.test(foldedQuestion);
}

function getSellerCandidates(question, context) {
  const directCandidates = typeof context.connector?.detectSellerCandidates === "function"
    ? context.connector.detectSellerCandidates(question)
    : [];

  if (directCandidates.length > 0) {
    return directCandidates;
  }

  const historyMessages = Array.isArray(context.fullConversationMessages) && context.fullConversationMessages.length > 0
    ? context.fullConversationMessages
    : context.recentTurnsForIntent;
  if (!Array.isArray(historyMessages) || historyMessages.length <= 1) {
    return [];
  }

  const foldedQuestion = foldText(question);
  if (!looksLikeEntityOnlyFollowUp(foldedQuestion) && !FOLLOW_UP_PATTERN.test(foldedQuestion)) {
    return [];
  }

  const questionTokens = extractMeaningfulTokens(question);
  if (questionTokens.length === 0) {
    return [];
  }

  const sellerNames = context.connector.getSellerNames();
  const priorText = historyMessages.slice(0, -1).map((message) => foldText(message?.content || "")).join("\n");

  return sellerNames
    .map((sellerName) => {
      const sellerTokens = foldText(sellerName).split(/\s+/).filter((token) => token.length >= 3);
      const matchedTokens = sellerTokens.filter((token) => questionTokens.includes(token));
      if (matchedTokens.length === 0) {
        return null;
      }

      const score = matchedTokens.reduce((sum, token, index) => {
        const tokenIndex = sellerTokens.indexOf(token);
        return sum + (tokenIndex === sellerTokens.length - 1 ? 5 : 2);
      }, 0) + (priorText.includes(foldText(sellerName)) ? 2 : 0);

      return {
        seller_name: sellerName,
        score
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || right.seller_name.length - left.seller_name.length || left.seller_name.localeCompare(right.seller_name));
}

function resolveSellerFromConversation(question, context) {
  const directSellerName = context.connector.detectSellerName(question) || extractExplicitSellerCandidate(question);
  if (directSellerName) {
    return directSellerName;
  }

  const sellerCandidates = getSellerCandidates(question, context);
  if (sellerCandidates.length === 0) {
    return null;
  }
  if (sellerCandidates.length === 1) {
    return sellerCandidates[0].seller_name;
  }
  return sellerCandidates[0].score > sellerCandidates[1].score
    ? sellerCandidates[0].seller_name
    : null;
}

export function findFollowUpAnchor(context) {
  const historyMessages = Array.isArray(context.fullConversationMessages) && context.fullConversationMessages.length > 0
    ? context.fullConversationMessages
    : context.recentTurnsForIntent;

  for (let index = historyMessages.length - 2; index >= 0; index -= 1) {
    const candidate = historyMessages[index];
    if (candidate?.role !== "user") {
      continue;
    }

    const candidateIntent = inferIntentFromQuestion(candidate.content, {
      ...context,
      recentTurnsForIntent: historyMessages.slice(0, index + 1),
      fullConversationMessages: historyMessages.slice(0, index + 1)
    }, {
      skipFollowUpInference: true
    });

    if (candidateIntent.primary_intent !== "custom_analytical_query" && candidateIntent.primary_intent !== "unknown") {
      return {
        message: candidate,
        intent: candidateIntent
      };
    }
  }

  const fallbackMessage = historyMessages
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "user");
  return fallbackMessage ? { message: fallbackMessage, intent: null } : null;
}

function buildRevenueClarification(result) {
  result.primary_intent = "unknown";
  result.action = "unknown";
  result.metric = "revenue";
  result.dimension = "unknown";
  result.ambiguity_flag = true;
  result.ambiguity_reason = "scope_unclear";
  result.clarification_question = "Câu hỏi này còn mơ hồ. Bạn muốn xem doanh thu theo seller, team, nguồn hay tổng quan KPI?";
  result.confidence = 0.46;
  return result;
}

function isCrossViewSystemRevenueAsk({
  foldedQuestion,
  revenueMatch,
  teamMatch,
  sourceMatch,
  compareMatch,
  renewMatch,
  opsMatch,
  conversionMatch,
  sellerName,
  topMatch
}) {
  if (!revenueMatch) {
    return false;
  }
  if (sellerName || teamMatch || sourceMatch || topMatch || compareMatch || renewMatch || conversionMatch) {
    return false;
  }
  if (SYSTEM_SCOPE_PATTERN.test(foldedQuestion)) {
    return true;
  }
  if (/doanh thu/.test(foldedQuestion) && /(hien tai|hom nay|thang nay|tong quan|tinh hinh)/.test(foldedQuestion) && !opsMatch) {
    return true;
  }
  return false;
}

function inferIntentFromQuestion(question, context, options = {}) {
  const result = createIntentSkeleton();
  const foldedQuestion = foldText(question);
  const sellerName = resolveSellerFromConversation(question, context);
  const explicitSellerCandidate = sellerName ? null : extractExplicitSellerCandidate(question);
  const explicitMonth = extractMonthYear(question);
  let sellerEntityValue = sellerName || explicitSellerCandidate;
  if (sellerEntityValue && SYSTEM_SCOPE_PATTERN.test(foldedQuestion) && !explicitSellerCandidate) {
    sellerEntityValue = null;
  }
  const sourceGroupIntent = detectSourceGroupIntent(question);
  const teamEntities = detectTeamEntities(question);
  const followUpAnchor = findFollowUpAnchor(context);
  const previousTopic = followUpAnchor?.message || null;
  const foldedPreviousTopic = foldText(previousTopic?.content || "");

  const teamMatch = TEAM_PATTERN.test(foldedQuestion);
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
  const viewScopedOverviewIntent = KPI_PATTERN.test(foldedQuestion)
    ? inferViewScopedOverviewIntent(context, createIntentSkeleton())
    : null;

  result.output_mode = TABLE_PATTERN.test(foldedQuestion)
    ? "table"
    : topMatch
      ? "ranking"
      : compareMatch
        ? "comparison"
        : "summary";

  if (sellerEntityValue) {
    result.entities.push({
      type: "seller",
      value: sellerEntityValue
    });
  }
  for (const team of teamEntities) {
    result.entities.push({
      type: "team",
      value: team.label
    });
  }
  if (sourceGroupIntent?.group) {
    result.entities.push({
      type: sourceGroupIntent.mode === "exact" ? "source_group" : "source_group_suggestion",
      value: sourceGroupIntent.group
    });
  }

  if (INJECTION_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "injection_attempt";
    result.confidence = 0.99;
    return result;
  }

  if (OUT_OF_DOMAIN_VALIDATION_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "out_of_domain_request";
    result.action = "unknown";
    result.metric = "unknown";
    result.dimension = "unknown";
    result.confidence = 0.99;
    return result;
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

  if (OUT_OF_SCOPE_PATTERN.test(foldedQuestion) && /(sale|seller|sale owner|nhan vien sale)/.test(foldedQuestion)) {
    result.primary_intent = "inactive_sellers_recent";
    result.action = "list";
    result.metric = "revenue";
    result.dimension = "seller";
    result.confidence = 0.88;
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

  if (FORECAST_PATTERN.test(foldedQuestion) && revenueMatch) {
    result.primary_intent = "forecast_request";
    result.action = "analyze";
    result.metric = "revenue";
    result.dimension = "time";
    result.confidence = 0.86;
    return result;
  }

  if (isExecutiveMultiDomainAsk({
    foldedQuestion,
    multiMatch,
    revenueMatch,
    topMatch,
    renewMatch,
    opsMatch,
    conversionMatch,
    sourceMatch,
    teamMatch,
  })) {
    result.primary_intent = "unknown";
    result.action = "unknown";
    result.metric = "unknown";
    result.dimension = "unknown";
    result.ambiguity_flag = true;
    result.ambiguity_reason = "multi_intent";
    result.clarification_question = "";
    result.confidence = 0.48;
    return result;
  }

  if (isSaleOwnerAccountPerformanceAsk(foldedQuestion)) {
    result.primary_intent = "custom_analytical_query";
    result.action = "analyze";
    result.metric = "active_rate";
    result.dimension = "unknown";
    result.confidence = 0.44;
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

  if (RECENT_ORDERS_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "recent_orders_list";
    result.action = "list";
    result.metric = "orders";
    result.dimension = "time";
    result.output_mode = "table";
    result.confidence = 0.93;
    return result;
  }

  if (ORDER_FILTER_PATTERN.test(foldedQuestion) && /(don hang|order)/.test(foldedQuestion)) {
    result.primary_intent = "orders_filtered_list";
    result.action = "filter";
    result.metric = "orders";
    result.dimension = "time";
    result.output_mode = "table";
    result.confidence = 0.9;
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

  if (explicitMonth && RHETORICAL_REVENUE_PATTERN.test(foldedQuestion) && !sellerEntityValue && !teamMatch && !sourceMatch) {
    result.primary_intent = "revenue_trend_analysis";
    result.action = "analyze";
    result.metric = "revenue";
    result.dimension = "time";
    result.confidence = 0.87;
    return result;
  }

  if (CUSTOMER_RANKING_PATTERN.test(foldedQuestion) && customerMatch) {
    result.primary_intent = "customer_revenue_ranking";
    result.action = "rank";
    result.metric = "revenue";
    result.dimension = "customer";
    result.confidence = 0.9;
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

  if (EXPORT_TABLE_PATTERN.test(foldedQuestion) && SELLER_PATTERN.test(foldedQuestion)) {
    result.primary_intent = "top_sellers_period";
    result.action = "list";
    result.metric = "revenue";
    result.dimension = "seller";
    result.output_mode = "table";
    result.confidence = 0.9;
    return result;
  }

  if (isCrossViewSystemRevenueAsk({
    foldedQuestion,
    revenueMatch,
    teamMatch,
    sourceMatch,
    compareMatch,
    renewMatch,
    opsMatch,
    conversionMatch,
    sellerName: sellerEntityValue,
    topMatch
  })) {
    result.primary_intent = "kpi_overview";
    result.action = "summarize";
    result.metric = "revenue";
    result.dimension = "time";
    result.confidence = 0.88;
    return result;
  }

  const followUpSellerCandidates = getSellerCandidates(question, context);
  const allowEntityOnlyFollowUp = Boolean(sellerEntityValue)
    || (followUpSellerCandidates.length > 0)
    || looksLikeEntityOnlyFollowUp(foldedQuestion);
  const allowKpiFocusFollowUp = previousTopic
    && ["kpi_overview", "conversion_source_summary"].includes(followUpAnchor?.intent?.primary_intent)
    && foldedQuestion.length <= 120
    && hasAnalyticalFocusCue(foldedQuestion);

  if (previousTopic && !options.skipFollowUpInference && (shouldUseFollowUpInference(foldedQuestion, previousTopic) || allowEntityOnlyFollowUp || allowKpiFocusFollowUp)) {
    const inferred = followUpAnchor?.intent || inferIntentFromQuestion(previousTopic.content, {
      ...context,
      recentTurnsForIntent: context.recentTurnsForIntent.slice(0, -1)
    }, {
      skipFollowUpInference: true
    });
    const anchoredSellerName = followUpAnchor?.intent?.entities?.find((entity) => entity.type === "seller")?.value || null;
    const currentSellerName = (
      !extractExplicitSellerCandidate(question)
      && inferred.primary_intent === "seller_revenue_month"
      && anchoredSellerName
      && isSellerVerificationFollowUp(foldedQuestion)
    )
      ? anchoredSellerName
      : (resolveSellerFromConversation(question, context) || extractExplicitSellerCandidate(question));
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
    } else if (previousTopic?.content && extractMonthYear(previousTopic.content)) {
      inferred.time_window = {
        type: "carry_over",
        value: previousTopic.content
      };
    }

    if (inferred.primary_intent === "kpi_overview"
      && sourceMatch
      && (conversionMatch || /\blead\b|khach moi|khach hang moi/.test(foldedQuestion))) {
      inferred.primary_intent = "conversion_source_summary";
      inferred.action = topMatch ? "rank" : "summarize";
      inferred.metric = "conversion";
      inferred.dimension = "source";
    } else if (inferred.primary_intent === "conversion_source_summary"
      && !sourceMatch
      && /\blead\b|khach moi|khach hang moi|conversion|\bcr\b/.test(foldedQuestion)) {
      inferred.primary_intent = "kpi_overview";
      inferred.action = "summarize";
      inferred.metric = "revenue";
      inferred.dimension = "time";
    }

    const unresolvedEntityOnlyFollowUp = inferred.primary_intent === "seller_revenue_month"
      && !currentSellerName
      && currentTeamEntities.length === 0
      && !extractMonthYear(question)
      && extractMeaningfulTokens(question).length > 0;
    if (unresolvedEntityOnlyFollowUp) {
      const topScore = followUpSellerCandidates[0]?.score || 0;
      const topCandidates = followUpSellerCandidates
        .filter((candidate) => candidate.score === topScore)
        .map((candidate) => candidate.seller_name)
        .slice(0, 3);
      inferred.ambiguity_flag = true;
      inferred.ambiguity_reason = "seller_unclear";
      inferred.entities = inferred.entities.filter((entity) => entity.type !== "seller");
      inferred.clarification_question = topCandidates.length >= 2
        ? `Có nhiều seller khớp với cách gọi này: ${topCandidates.join(", ")}. Bạn muốn hỏi ai?`
        : "Bạn muốn hỏi seller nào cụ thể?";
      inferred.confidence = 0.58;
      return inferred;
    }

    inferred.ambiguity_flag = false;
    inferred.ambiguity_reason = "";
    inferred.clarification_question = "";
    inferred.confidence = Math.max(inferred.confidence, 0.86);
    return inferred;
  }

  if (revenueMatch && explicitMonth && !sellerEntityValue && !teamMatch && !sourceMatch && !topMatch && !compareMatch && !renewMatch && !opsMatch && !conversionMatch) {
    result.primary_intent = "kpi_overview";
    result.action = "summarize";
    result.metric = "revenue";
    result.dimension = "time";
    result.confidence = 0.88;
    return result;
  }

  if (revenueMatch && !sellerEntityValue && !teamMatch && !sourceMatch && !topMatch && !compareMatch && !renewMatch && !opsMatch && !conversionMatch) {
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

  if (sourceMatch && revenueMatch) {
    result.primary_intent = "source_revenue_drilldown";
    result.action = "lookup";
    result.metric = "revenue";
    result.dimension = "source";
    result.confidence = 0.88;
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

  if (sellerEntityValue && (revenueMatch || (VERIFY_AMOUNT_PATTERN.test(foldedQuestion) && /(\d+(?:[.,]\d+)?)\s*(trieu|ty|vnd)/.test(foldedQuestion)))) {
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

  if (leadGeoMatch && /\blead\b|khach moi/.test(foldedQuestion)) {
    result.primary_intent = "lead_geography";
    result.action = "rank";
    result.metric = "lead_count";
    result.dimension = "province";
    result.confidence = 0.88;
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

  if (cohortMatch) {
    result.primary_intent = "cohort_summary";
    result.action = "summarize";
    result.metric = "active_rate";
    result.dimension = "time";
    result.confidence = 0.62;
    return result;
  }

  result.primary_intent = "custom_analytical_query";
  result.action = "analyze";
  result.metric = revenueMatch ? "revenue" : conversionMatch ? "conversion" : "unknown";
  result.dimension = teamMatch ? "team" : sourceMatch ? "source" : customerMatch ? "customer" : "unknown";
  result.confidence = 0.42;
  return result;
}

export function classifyIntentLegacy(context) {
  const latestQuestion = context.routingQuestion || context.latestUserMessage?.content || context.latestQuestion || "";
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
  const deterministicIntent = classifyIntentLegacy(context);
  if (deterministicIntent.intent.primary_intent === "injection_attempt") {
    return deterministicIntent;
  }

  if (!useIntentClassifier || !isIntentClassifierEnabled() || !hasConfiguredProviderKey(getDefaultProvider())) {
    return deterministicIntent;
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
        ...deterministicIntent,
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
      ...deterministicIntent,
      debugReason: "intent_classifier_failed"
    };
  }
}

export function resolveRouteFromIntent(intent) {
  if (!intent) {
    return "llm_fallback";
  }
  if (intent.primary_intent === "injection_attempt" || intent.primary_intent === "out_of_domain_request") {
    return "validation";
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
