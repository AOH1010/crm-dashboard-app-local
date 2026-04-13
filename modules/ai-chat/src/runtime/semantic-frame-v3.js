import { foldText } from "../tooling/common.js";

const PRIMARY_TOPIC_MAP = {
  seller_revenue_month: "seller_performance",
  top_sellers_period: "seller_performance",
  seller_activity_definition: "seller_activity",
  active_sellers_list: "seller_activity",
  kpi_overview: "kpi_overview",
  period_comparison: "period_comparison",
  renew_summary: "renewal",
  operations_summary: "operations",
  conversion_source_summary: "conversion_source",
  team_revenue_summary: "team_performance",
  revenue_trend_analysis: "revenue_trend",
  customer_revenue_ranking: "customer_performance",
  recent_orders_list: "orders",
  lead_geography: "lead_geography",
  source_revenue_drilldown: "source_revenue",
  orders_filtered_list: "orders",
  inactive_sellers_recent: "seller_activity",
  forecast_request: "forecast",
  customer_lookup: "customer",
  cohort_summary: "cohort",
  custom_analytical_query: "custom_analysis",
  injection_attempt: "validation",
  out_of_domain_request: "validation",
  unknown: "unknown"
};

const PRIMARY_SEMANTIC_INTENT_MAP = {
  seller_revenue_month: "metric_lookup",
  top_sellers_period: "ranking",
  seller_activity_definition: "metric_lookup",
  active_sellers_list: "breakdown",
  kpi_overview: "metric_lookup",
  period_comparison: "comparison",
  renew_summary: "metric_lookup",
  operations_summary: "breakdown",
  conversion_source_summary: "breakdown",
  team_revenue_summary: "metric_lookup",
  revenue_trend_analysis: "trend",
  customer_revenue_ranking: "ranking",
  recent_orders_list: "breakdown",
  lead_geography: "ranking",
  source_revenue_drilldown: "metric_lookup",
  orders_filtered_list: "breakdown",
  inactive_sellers_recent: "breakdown",
  forecast_request: "forecast",
  customer_lookup: "metric_lookup",
  cohort_summary: "trend",
  custom_analytical_query: "diagnostic",
  injection_attempt: "unsupported",
  out_of_domain_request: "unsupported",
  unknown: "unsupported"
};

const FAMILY_MAP = {
  seller_revenue_month: ["seller_metrics"],
  top_sellers_period: ["seller_metrics", "ranking"],
  seller_activity_definition: ["seller_activity"],
  active_sellers_list: ["seller_activity"],
  kpi_overview: ["kpi_metrics"],
  period_comparison: ["period_comparison"],
  renew_summary: ["renewal_metrics"],
  operations_summary: ["operations_metrics"],
  conversion_source_summary: ["source_conversion"],
  team_revenue_summary: ["team_metrics"],
  revenue_trend_analysis: ["trend_analysis"],
  customer_revenue_ranking: ["customer_metrics", "ranking"],
  recent_orders_list: ["order_metrics"],
  lead_geography: ["lead_metrics", "ranking"],
  source_revenue_drilldown: ["source_revenue"],
  orders_filtered_list: ["order_metrics"],
  inactive_sellers_recent: ["seller_activity"],
  forecast_request: ["forecasting"]
};

function extractEntity(entities, type) {
  return (entities || []).find((entity) => entity.type === type)?.value || null;
}

function parseTimeRange(intent) {
  const type = String(intent?.time_window?.type || "unknown");
  const value = String(intent?.time_window?.value || "unknown");
  const monthMatch = value.match(/\b(20\d{2})-(\d{2})\b/);
  if (monthMatch) {
    return {
      type: "month",
      month: Number.parseInt(monthMatch[2], 10),
      year: Number.parseInt(monthMatch[1], 10),
      from: null,
      to: null,
      raw: value,
      source: type
    };
  }
  return {
    type,
    month: null,
    year: null,
    from: null,
    to: null,
    raw: value,
    source: type
  };
}

function inferBroadness({ context, intent, semanticIntent }) {
  const foldedQuestion = foldText(context.latestQuestion || "");
  const domainCount = [
    /(doanh thu|doanh so|\bdt\b|revenue)/.test(foldedQuestion),
    /(seller|sale|nguoi ban|nhan vien)/.test(foldedQuestion),
    /(team|nhom|doi|phong ban)/.test(foldedQuestion),
    /(lead|conversion|nguon|source|kenh)/.test(foldedQuestion),
    /(renew|gia han|active|inactive|operations)/.test(foldedQuestion),
    /(customer|khach hang|account|don hang|order)/.test(foldedQuestion)
  ].filter(Boolean).length;

  if (intent?.ambiguity_reason === "multi_intent" || domainCount >= 3) {
    return "broad";
  }
  if (semanticIntent === "diagnostic" || /(tai sao|vi sao|nguyen nhan|buc tranh|toan canh)/.test(foldedQuestion)) {
    return "broad";
  }
  if (["ranking", "comparison", "breakdown", "trend"].includes(semanticIntent)) {
    return "medium";
  }
  return "narrow";
}

function inferFollowUp(context) {
  if (!Array.isArray(context.normalizedMessages) || context.normalizedMessages.length <= 1) {
    return false;
  }
  const foldedQuestion = foldText(context.latestQuestion || "");
  return /^(con|the|thang|quy|nam|so voi|thi sao|ra sao|vay)\b|(\bthi sao\b|\bra sao\b|\bso voi\b)/.test(foldedQuestion);
}

function inferCandidateFamilies(intent) {
  const primaryFamilies = FAMILY_MAP[intent?.primary_intent] || [];
  const dimension = intent?.dimension;
  const metric = intent?.metric;
  const derivedFamilies = [];

  if (dimension === "seller") derivedFamilies.push("seller_metrics");
  if (dimension === "team") derivedFamilies.push("team_metrics");
  if (dimension === "source") derivedFamilies.push("source_conversion", "source_revenue");
  if (dimension === "customer") derivedFamilies.push("customer_metrics");
  if (metric === "orders") derivedFamilies.push("order_metrics", "ranking");
  if (metric === "lead_count" || metric === "conversion") derivedFamilies.push("lead_metrics");

  return Array.from(new Set([...primaryFamilies, ...derivedFamilies]));
}

function inferSubject(intent, context) {
  const topic = PRIMARY_TOPIC_MAP[intent.primary_intent] || "unknown";
  const foldedQuestion = foldText(context.latestQuestion || "");

  if (topic === "seller_activity") return "seller";
  if (topic === "seller_performance") return "seller";
  if (topic === "team_performance") return "team";
  if (topic === "operations") return /\baccount\b/.test(foldedQuestion) ? "account" : "operations";
  if (topic === "conversion_source" || topic === "source_revenue") return "source";
  if (topic === "customer_performance" || topic === "customer") return "customer";
  if (topic === "orders") return "order";
  if (topic === "lead_geography") return "lead";
  if (topic === "kpi_overview" || topic === "period_comparison" || topic === "revenue_trend" || topic === "forecast") return "system";
  return intent.dimension && intent.dimension !== "unknown" ? intent.dimension : "unknown";
}

function inferState(intent, context) {
  const foldedQuestion = foldText(context.latestQuestion || "");
  if (/(inactive|khong hoat dong|khong active)/.test(foldedQuestion)) return "inactive";
  if (/(active|hoat dong)/.test(foldedQuestion)) return "active";
  if (/\bghost\b/.test(foldedQuestion)) return "ghost";
  if (/\bbest\b/.test(foldedQuestion)) return "best";
  if (/\bvalue\b/.test(foldedQuestion)) return "value";
  if (/\bnoise\b/.test(foldedQuestion)) return "noise";
  if (intent.primary_intent === "inactive_sellers_recent") return "inactive";
  return null;
}

function inferOutputShape(intent, context) {
  const action = intent.action || "unknown";
  const topic = PRIMARY_TOPIC_MAP[intent.primary_intent] || "unknown";
  const subject = inferSubject(intent, context);

  if (action === "define") return "definition";
  if (action === "compare" || intent.output_mode === "comparison") return "comparison_summary";
  if (action === "rank" || intent.output_mode === "ranking") return "ranking_table";
  if (action === "list" && subject === "seller" && topic === "seller_activity") return "entity_list";
  if (intent.output_mode === "table") return "aggregate_table";
  return "summary_snapshot";
}

function inferBreakdownBy(intent) {
  if (intent?.action === "rank") {
    return intent.dimension && intent.dimension !== "unknown" ? intent.dimension : null;
  }
  if (intent?.output_mode === "table") {
    return intent.dimension && intent.dimension !== "unknown" ? intent.dimension : null;
  }
  return null;
}

function inferLimit(context) {
  const foldedQuestion = foldText(context.latestQuestion || "");
  const topMatch = foldedQuestion.match(/\btop\s*(\d{1,2})\b/);
  if (topMatch?.[1]) {
    return Number.parseInt(topMatch[1], 10);
  }
  const countMatch = foldedQuestion.match(/\b(\d{1,2})\s+(?:seller|sale|don|order|khach)\b/);
  return countMatch?.[1] ? Number.parseInt(countMatch[1], 10) : null;
}

export function buildSemanticFrameV3(context) {
  const intent = context.intent || {};
  const semanticIntent = PRIMARY_SEMANTIC_INTENT_MAP[intent.primary_intent] || "unsupported";
  const entities = Array.isArray(intent.entities) ? intent.entities : [];
  const seller = extractEntity(entities, "seller");
  const team = extractEntity(entities, "team");
  const customer = extractEntity(entities, "customer");
  const source = extractEntity(entities, "source_group") || extractEntity(entities, "source_group_suggestion");
  const entityType = intent.dimension && intent.dimension !== "unknown" ? intent.dimension : entities[0]?.type || null;
  const entityValue = entityType ? extractEntity(entities, entityType) : entities[0]?.value || null;
  const subject = inferSubject(intent, context);
  const state = inferState(intent, context);
  const outputShape = inferOutputShape(intent, context);

  return {
    version: "v3.semantic.1",
    intent: semanticIntent,
    primary_intent: intent.primary_intent || "unknown",
    action: intent.action || "unknown",
    subject,
    state,
    output_mode: intent.output_mode || "summary",
    output_shape: outputShape,
    confidence: Number(intent.confidence ?? context.intentConfidence ?? 0),
    broadness: inferBroadness({ context, intent, semanticIntent }),
    multi_intent_flag: intent.ambiguity_reason === "multi_intent",
    follow_up_flag: inferFollowUp(context),
    needs_clarification: Boolean(intent.ambiguity_flag),
    clarification_reason: intent.ambiguity_reason || null,
    slots: {
      topic: PRIMARY_TOPIC_MAP[intent.primary_intent] || "unknown",
      metric: intent.metric || "unknown",
      metric_modifier: intent.metric === "revenue" ? "actual" : null,
      action: intent.action || "unknown",
      subject,
      state,
      entity_type: entityType,
      entity_value: entityValue,
      seller,
      team,
      customer,
      source,
      time_range: parseTimeRange(intent),
      breakdown_by: inferBreakdownBy(intent),
      comparison_target: null,
      limit: inferLimit(context),
      output_mode: intent.output_mode || "summary",
      output_shape: outputShape
    },
    candidate_skill_families: inferCandidateFamilies(intent)
  };
}
