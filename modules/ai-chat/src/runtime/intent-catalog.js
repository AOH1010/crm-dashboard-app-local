export const INTENT_TYPES = [
  "seller_revenue_month",
  "top_sellers_period",
  "kpi_overview",
  "period_comparison",
  "renew_summary",
  "operations_summary",
  "conversion_source_summary",
  "team_revenue_summary",
  "customer_lookup",
  "lead_geography",
  "cohort_summary",
  "custom_analytical_query",
  "unknown"
];

export const ROUTABLE_SKILL_INTENTS = {
  seller_revenue_month: "seller-month-revenue",
  top_sellers_period: "top-sellers-period",
  kpi_overview: "kpi-overview",
  period_comparison: "compare-periods",
  renew_summary: "renew-due-summary",
  operations_summary: "operations-status-summary",
  conversion_source_summary: "conversion-source-summary",
  team_revenue_summary: "team-performance-summary"
};

export const CLASSIFIER_ROUTE_SKILL_THRESHOLD = 0.85;
export const CLASSIFIER_ROUTE_CLARIFY_THRESHOLD = 0.5;

export const ACTION_TYPES = [
  "rank",
  "summarize",
  "compare",
  "lookup",
  "filter",
  "list",
  "analyze",
  "unknown"
];

export const METRIC_TYPES = [
  "revenue",
  "orders",
  "conversion",
  "renew",
  "active_rate",
  "customer_count",
  "lead_count",
  "unknown"
];

export const DIMENSION_TYPES = [
  "seller",
  "team",
  "source",
  "customer",
  "province",
  "time",
  "category",
  "unknown"
];

export const OUTPUT_MODES = [
  "summary",
  "table",
  "comparison",
  "ranking",
  "unknown"
];
