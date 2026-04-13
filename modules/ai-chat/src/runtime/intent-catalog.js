export const INTENT_TYPES = [
  "seller_revenue_month",
  "top_sellers_period",
  "seller_activity_definition",
  "active_sellers_list",
  "kpi_overview",
  "period_comparison",
  "renew_summary",
  "operations_summary",
  "conversion_source_summary",
  "team_revenue_summary",
  "revenue_trend_analysis",
  "customer_revenue_ranking",
  "recent_orders_list",
  "customer_lookup",
  "lead_geography",
  "source_revenue_drilldown",
  "orders_filtered_list",
  "inactive_sellers_recent",
  "forecast_request",
  "injection_attempt",
  "out_of_domain_request",
  "cohort_summary",
  "custom_analytical_query",
  "unknown"
];

export const ROUTABLE_SKILL_INTENTS = {
  seller_revenue_month: "seller-month-revenue",
  top_sellers_period: "top-sellers-period",
  seller_activity_definition: "seller-activity-definition",
  active_sellers_list: "active-sellers-list",
  kpi_overview: "kpi-overview",
  period_comparison: "compare-periods",
  renew_summary: "renew-due-summary",
  operations_summary: "operations-status-summary",
  conversion_source_summary: "conversion-source-summary",
  team_revenue_summary: "team-performance-summary",
  revenue_trend_analysis: "revenue-trend-analysis",
  customer_revenue_ranking: "customer-revenue-ranking",
  recent_orders_list: "recent-orders-list",
  lead_geography: "lead-geography",
  source_revenue_drilldown: "source-revenue-drilldown",
  orders_filtered_list: "orders-filtered-list",
  inactive_sellers_recent: "inactive-sellers-summary",
  forecast_request: "revenue-forecast"
};

export const CLASSIFIER_ROUTE_SKILL_THRESHOLD = 0.85;
export const CLASSIFIER_ROUTE_CLARIFY_THRESHOLD = 0.5;

export const ACTION_TYPES = [
  "define",
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
