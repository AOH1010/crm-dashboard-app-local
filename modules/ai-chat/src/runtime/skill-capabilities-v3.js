import { ROUTABLE_SKILL_INTENTS } from "./intent-catalog.js";

export const SKILL_CAPABILITIES_V3 = {
  "seller-month-revenue": {
    family: "seller_metrics",
    supportedSemanticIntents: ["metric_lookup"],
    supportedActions: ["lookup"],
    supportedMetrics: ["revenue"],
    supportedEntityTypes: ["seller"],
    supportedSubjects: ["seller"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["summary_snapshot"],
    supportedTimeTypes: ["month", "explicit", "carry_over", "relative", "filter_based", "unknown"],
    requiredSlots: ["metric", "entity_type", "entity_value"],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "top-sellers-period": {
    family: "ranking",
    supportedSemanticIntents: ["ranking", "breakdown"],
    supportedActions: ["rank", "list", "summarize"],
    supportedMetrics: ["revenue", "orders"],
    supportedEntityTypes: ["seller", null],
    supportedSubjects: ["seller"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["ranking_table", "aggregate_table", "summary_snapshot"],
    supportedTimeTypes: ["month", "explicit", "carry_over", "relative", "filter_based", "unknown", "range"],
    requiredSlots: ["metric", "entity_type"],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "seller-activity-definition": {
    family: "seller_activity",
    supportedSemanticIntents: ["metric_lookup"],
    supportedActions: ["define", "summarize"],
    supportedMetrics: ["active_rate", "unknown"],
    supportedEntityTypes: ["seller", null, "unknown"],
    supportedSubjects: ["seller"],
    supportedStates: ["active", "inactive", null, "any"],
    supportedOutputShapes: ["definition"],
    supportedTimeTypes: ["month", "explicit", "carry_over", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "active-sellers-list": {
    family: "seller_activity",
    supportedSemanticIntents: ["breakdown", "metric_lookup"],
    supportedActions: ["list", "summarize"],
    supportedMetrics: ["active_rate", "unknown"],
    supportedEntityTypes: ["seller", null, "unknown"],
    supportedSubjects: ["seller"],
    supportedStates: ["active", null],
    supportedOutputShapes: ["entity_list", "summary_snapshot"],
    supportedTimeTypes: ["month", "explicit", "carry_over", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "kpi-overview": {
    family: "kpi_metrics",
    supportedSemanticIntents: ["metric_lookup", "breakdown"],
    supportedActions: ["summarize", "lookup", "analyze"],
    supportedMetrics: ["revenue", "orders", "conversion", "lead_count", "customer_count", "unknown"],
    supportedEntityTypes: ["time", null, "unknown"],
    supportedSubjects: ["system"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["summary_snapshot", "aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "carry_over", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "compare-periods": {
    family: "period_comparison",
    supportedSemanticIntents: ["comparison"],
    supportedActions: ["compare"],
    supportedMetrics: ["revenue", "orders", "unknown"],
    supportedEntityTypes: ["time", null, "unknown"],
    supportedSubjects: ["system", "time"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["comparison_summary"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "renew-due-summary": {
    family: "renewal_metrics",
    supportedSemanticIntents: ["metric_lookup", "breakdown"],
    supportedActions: ["summarize", "lookup", "list"],
    supportedMetrics: ["renew", "unknown"],
    supportedEntityTypes: ["time", null, "unknown"],
    supportedSubjects: ["system"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["summary_snapshot", "aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "operations-status-summary": {
    family: "operations_metrics",
    supportedSemanticIntents: ["breakdown", "metric_lookup"],
    supportedActions: ["summarize", "list", "analyze"],
    supportedMetrics: ["active_rate", "customer_count", "unknown"],
    supportedEntityTypes: ["category", "customer", null, "unknown"],
    supportedSubjects: ["account", "operations"],
    supportedStates: ["active", "inactive", "ghost", "best", "value", "noise", null, "any"],
    supportedOutputShapes: ["summary_snapshot", "aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "conversion-source-summary": {
    family: "source_conversion",
    supportedSemanticIntents: ["breakdown", "ranking", "metric_lookup"],
    supportedActions: ["summarize", "rank", "analyze"],
    supportedMetrics: ["conversion", "lead_count", "customer_count", "unknown"],
    supportedEntityTypes: ["source", null, "unknown"],
    supportedSubjects: ["source"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["summary_snapshot", "ranking_table", "aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "carry_over", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "team-performance-summary": {
    family: "team_metrics",
    supportedSemanticIntents: ["metric_lookup", "ranking", "comparison", "breakdown"],
    supportedActions: ["summarize", "rank", "compare", "analyze"],
    supportedMetrics: ["revenue", "orders", "active_rate", "unknown"],
    supportedEntityTypes: ["team", null, "unknown"],
    supportedSubjects: ["team"],
    supportedStates: ["active", null, "any"],
    supportedOutputShapes: ["summary_snapshot", "ranking_table", "comparison_summary", "aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "carry_over", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "revenue-trend-analysis": {
    family: "trend_analysis",
    supportedSemanticIntents: ["trend", "diagnostic", "comparison"],
    supportedActions: ["analyze", "compare"],
    supportedMetrics: ["revenue", "orders", "unknown"],
    supportedEntityTypes: ["time", "team", null, "unknown"],
    supportedSubjects: ["system", "team"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["summary_snapshot", "comparison_summary"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "customer-revenue-ranking": {
    family: "customer_metrics",
    supportedSemanticIntents: ["ranking"],
    supportedActions: ["rank"],
    supportedMetrics: ["revenue"],
    supportedEntityTypes: ["customer", null, "unknown"],
    supportedSubjects: ["customer"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["ranking_table"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: ["metric"],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "recent-orders-list": {
    family: "order_metrics",
    supportedSemanticIntents: ["breakdown"],
    supportedActions: ["list"],
    supportedMetrics: ["orders", "unknown"],
    supportedEntityTypes: ["time", null, "unknown"],
    supportedSubjects: ["order"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "lead-geography": {
    family: "lead_metrics",
    supportedSemanticIntents: ["ranking", "breakdown"],
    supportedActions: ["rank", "summarize"],
    supportedMetrics: ["lead_count", "unknown"],
    supportedEntityTypes: ["province", null, "unknown"],
    supportedSubjects: ["lead"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["ranking_table", "aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "source-revenue-drilldown": {
    family: "source_revenue",
    supportedSemanticIntents: ["metric_lookup", "breakdown"],
    supportedActions: ["lookup", "summarize"],
    supportedMetrics: ["revenue"],
    supportedEntityTypes: ["source", "source_group", "source_group_suggestion", null, "unknown"],
    supportedSubjects: ["source"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["summary_snapshot", "aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: ["metric"],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "orders-filtered-list": {
    family: "order_metrics",
    supportedSemanticIntents: ["breakdown"],
    supportedActions: ["filter", "list"],
    supportedMetrics: ["orders", "unknown"],
    supportedEntityTypes: ["time", null, "unknown"],
    supportedSubjects: ["order"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["aggregate_table"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "inactive-sellers-summary": {
    family: "seller_activity",
    supportedSemanticIntents: ["breakdown", "metric_lookup"],
    supportedActions: ["list", "summarize"],
    supportedMetrics: ["revenue", "active_rate", "unknown"],
    supportedEntityTypes: ["seller", null, "unknown"],
    supportedSubjects: ["seller"],
    supportedStates: ["inactive", null],
    supportedOutputShapes: ["entity_list", "summary_snapshot"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: [],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  },
  "revenue-forecast": {
    family: "forecasting",
    supportedSemanticIntents: ["forecast"],
    supportedActions: ["analyze", "lookup", "summarize"],
    supportedMetrics: ["revenue"],
    supportedEntityTypes: ["time", null, "unknown"],
    supportedSubjects: ["system", "time"],
    supportedStates: [null, "any"],
    supportedOutputShapes: ["summary_snapshot"],
    supportedTimeTypes: ["month", "explicit", "relative", "filter_based", "unknown", "range"],
    requiredSlots: ["metric"],
    defaultableSlots: ["time_range"],
    certifiedBackends: ["sqlite", "supabase"]
  }
};

function getConnectorKind(connector) {
  const name = String(connector?.constructor?.name || "").toLowerCase();
  if (name.includes("supabase")) return "supabase";
  if (name.includes("sqlite")) return "sqlite";
  return "unknown";
}

function getPrimaryIntentForSkill(skillId) {
  return Object.entries(ROUTABLE_SKILL_INTENTS)
    .find(([, mappedSkillId]) => mappedSkillId === skillId)?.[0] || null;
}

function slotValueFor(semantic, slot) {
  const slots = semantic?.slots || {};
  if (slot === "metric") return slots.metric && slots.metric !== "unknown" ? slots.metric : null;
  if (slot === "entity_type") return slots.entity_type && slots.entity_type !== "unknown" ? slots.entity_type : null;
  if (slot === "entity_value") return slots.entity_value || null;
  if (slot === "time_range") return slots.time_range?.type && slots.time_range.type !== "unknown" ? slots.time_range : null;
  if (slot === "subject") return semantic?.subject || slots.subject || null;
  if (slot === "state") return semantic?.state || slots.state || null;
  if (slot === "output_shape") return semantic?.output_shape || slots.output_shape || null;
  return slots[slot] || null;
}

function isSupported(value, supportedValues) {
  if (!supportedValues || supportedValues.length === 0) return true;
  if (value === null || value === undefined || value === "unknown") {
    return supportedValues.includes(value) || supportedValues.includes(null) || supportedValues.includes("unknown");
  }
  return supportedValues.includes(value);
}

function collectMissingSlots(semantic, capability) {
  return (capability.requiredSlots || [])
    .filter((slot) => !slotValueFor(semantic, slot) && !(capability.defaultableSlots || []).includes(slot));
}

export function getSkillCapabilityV3(skillId) {
  return SKILL_CAPABILITIES_V3[skillId] || null;
}

export function scoreSkillCapabilityV3({ skill, semantic, context }) {
  const capability = getSkillCapabilityV3(skill?.id);
  if (!capability) {
    return {
      skill,
      family: null,
      score: 0,
      missing_slots: [],
      reason_codes: ["missing_capability_metadata"],
      capability: null
    };
  }

  const reasonCodes = [];
  const primaryIntentForSkill = getPrimaryIntentForSkill(skill.id);
  const directIntentMatch = primaryIntentForSkill === semantic.primary_intent;
  const familyHintMatch = (semantic.candidate_skill_families || []).includes(capability.family);
  const metric = semantic.slots?.metric || "unknown";
  const entityType = semantic.slots?.entity_type || null;
  const timeType = semantic.slots?.time_range?.type || "unknown";
  const subject = semantic.subject || semantic.slots?.subject || "unknown";
  const state = semantic.state || semantic.slots?.state || null;
  const outputShape = semantic.output_shape || semantic.slots?.output_shape || "summary_snapshot";
  const action = context.intent?.action || "unknown";
  const connectorKind = getConnectorKind(context.connector);
  const missingSlots = collectMissingSlots(semantic, capability);

  let score = 0.2;
  if (directIntentMatch) score += 0.32;
  if (familyHintMatch) score += 0.18;
  if (capability.supportedSemanticIntents.includes(semantic.intent)) score += 0.12;
  if (capability.supportedActions.includes(action) || action === "unknown") score += 0.08;

  if (capability.supportedMetrics.includes(metric) || metric === "unknown" && capability.supportedMetrics.includes("unknown")) {
    score += 0.12;
  } else {
    reasonCodes.push("unsupported_metric");
    score -= 0.2;
  }

  if (isSupported(entityType, capability.supportedEntityTypes)) {
    score += 0.08;
  } else {
    reasonCodes.push("unsupported_entity_type");
    score -= 0.16;
  }

  if (!capability.supportedSubjects || isSupported(subject, capability.supportedSubjects)) {
    score += 0.05;
  } else {
    reasonCodes.push("unsupported_subject");
    score -= 0.18;
  }

  if (!capability.supportedStates || isSupported(state, capability.supportedStates)) {
    score += 0.04;
  } else {
    reasonCodes.push("unsupported_state");
    score -= 0.12;
  }

  if (!capability.supportedOutputShapes || isSupported(outputShape, capability.supportedOutputShapes)) {
    score += 0.05;
  } else {
    reasonCodes.push("unsupported_output_shape");
    score -= 0.22;
  }

  if (isSupported(timeType, capability.supportedTimeTypes)) {
    score += 0.04;
  } else {
    reasonCodes.push("unsupported_time_type");
  }

  if (missingSlots.length === 0) {
    score += 0.08;
  } else {
    reasonCodes.push("missing_required_slot");
    score -= 0.2;
  }

  if (capability.certifiedBackends.includes(connectorKind)) {
    score += 0.04;
  } else {
    reasonCodes.push("backend_not_certified");
    score -= 0.08;
  }

  if (semantic.broadness === "broad" && !["trend_analysis", "forecasting"].includes(capability.family)) {
    reasonCodes.push("query_too_broad_for_skill");
    score -= 0.2;
  }

  return {
    skill,
    family: capability.family,
    score: Math.max(0, Math.min(1, Number(score.toFixed(3)))),
    missing_slots: missingSlots,
    reason_codes: reasonCodes.length > 0 ? reasonCodes : ["capability_match"],
    capability
  };
}
