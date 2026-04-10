import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const evalDir = path.join(projectRoot, "docs", "eval");
const sourcePath = path.join(evalDir, "eval-50-cases.json");

const sourceCases = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const intentMap = {
  top_sellers_ranking: "top_sellers_period",
  team_revenue_ranking: "team_revenue_summary",
  kpi_revenue: "kpi_overview",
  ambiguous: "unknown",
  multi_intent: "unknown",
  renew_detail: "renew_summary",
  operations_detail: "custom_analytical_query",
  customer_ranking: "custom_analytical_query",
  recent_orders_list: "custom_analytical_query",
  source_revenue_drilldown: "custom_analytical_query",
  orders_filtered_list: "custom_analytical_query",
  team_comparison_detailed: "custom_analytical_query",
  revenue_trend_analysis: "custom_analytical_query",
  causal_analysis: "custom_analytical_query",
  forecast_request: "custom_analytical_query",
  out_of_scope: "unknown",
  out_of_domain: "unknown",
  injection_attempt: "unknown",
  empty: "unknown",
  revenue_detail_analysis: "custom_analytical_query",
  activation_comparison: "custom_analytical_query",
  sale_owner_performance: "custom_analytical_query",
};

const routeSoftIds = new Set([
  "tc02-seller-nickname",
  "tc04-kpi-overview-informal",
  "tc11-ambiguous-doanh-thu",
  "tc12-generic-summary",
  "tc15-ops-wrong-view",
  "tc38-english-prompt",
  "tc43-followup-off-topic",
]);

const intentSoftIds = new Set([
  "tc11-ambiguous-doanh-thu",
  "tc14-keyword-trap-sale-nghi-viec",
  "tc16-multi-intent-two-domains",
  "tc18-complex-team-comparison",
  "tc19-trend-analysis",
  "tc20-causal-why-question",
  "tc21-customer-ranking",
  "tc22-recent-orders",
  "tc24-source-revenue-drilldown",
  "tc25-orders-filter-amount",
  "tc26-prompt-injection",
  "tc28-future-forecast",
  "tc29-empty-prompt",
  "tc33-ops-from-dashboard-view",
  "tc42-followup-drilldown",
  "tc43-followup-off-topic",
  "tc48-activation-trend",
  "tc49-sale-owner-account-count",
  "tc50-ceo-full-picture",
]);

const clarifyIds = new Set([
  "tc11-ambiguous-doanh-thu",
  "tc26-prompt-injection",
  "tc29-empty-prompt",
  "tc43-followup-off-topic",
]);

const manualIds = new Set([
  "tc01-seller-revenue-basic",
  "tc05-compare-periods-explicit",
  "tc17-long-prompt-single-intent",
  "tc19-trend-analysis",
  "tc20-causal-why-question",
  "tc21-customer-ranking",
  "tc22-recent-orders",
  "tc23-lead-geography",
  "tc24-source-revenue-drilldown",
  "tc25-orders-filter-amount",
  "tc27-nonexistent-seller",
  "tc28-future-forecast",
  "tc30-very-long-prompt",
  "tc39-verify-wrong-number",
  "tc42-followup-drilldown",
  "tc44-cross-verify-leaderboard",
  "tc45-zero-result-seller",
  "tc46-total-revenue-month",
  "tc47-renew-renewed-count",
  "tc48-activation-trend",
  "tc49-sale-owner-account-count",
  "tc50-ceo-full-picture",
]);

const allowedRouteOverrides = {
  "tc02-seller-nickname": ["skill", "clarify_required"],
  "tc04-kpi-overview-informal": ["skill", "clarify_required"],
  "tc11-ambiguous-doanh-thu": ["clarify_required", "skill"],
  "tc12-generic-summary": ["skill", "clarify_required"],
  "tc15-ops-wrong-view": ["skill", "clarify_required"],
  "tc38-english-prompt": ["skill", "llm_fallback"],
  "tc43-followup-off-topic": ["validation", "llm_fallback"],
};

const reviewFocusById = {
  "tc01-seller-revenue-basic": ["grounding", "no_hallucination"],
  "tc05-compare-periods-explicit": ["grounding", "comparison_math"],
  "tc17-long-prompt-single-intent": ["routing", "grounding"],
  "tc19-trend-analysis": ["reasoning", "grounding"],
  "tc20-causal-why-question": ["reasoning", "no_fabrication"],
  "tc21-customer-ranking": ["sql_shape", "top_n_result"],
  "tc22-recent-orders": ["sql_shape", "table_output"],
  "tc23-lead-geography": ["sql_shape", "group_by"],
  "tc24-source-revenue-drilldown": ["join_correctness", "grounding"],
  "tc25-orders-filter-amount": ["filter_correctness", "table_output"],
  "tc27-nonexistent-seller": ["no_hallucination", "not_found_copy"],
  "tc28-future-forecast": ["no_fabrication", "safe_refusal"],
  "tc30-very-long-prompt": ["routing", "intent_focus"],
  "tc39-verify-wrong-number": ["fact_check", "correction"],
  "tc42-followup-drilldown": ["context_carryover", "fallback_quality"],
  "tc44-cross-verify-leaderboard": ["cross_db_grounding", "consistency"],
  "tc45-zero-result-seller": ["no_hallucination", "not_found_copy"],
  "tc46-total-revenue-month": ["cross_db_grounding", "aggregation"],
  "tc47-renew-renewed-count": ["filter_correctness", "grounding"],
  "tc48-activation-trend": ["comparison_math", "time_window"],
  "tc49-sale-owner-account-count": ["join_correctness", "ratio_math"],
  "tc50-ceo-full-picture": ["completeness", "multi_answer"],
};

function normalizeIntent(expectedIntent) {
  return intentMap[expectedIntent] || expectedIntent;
}

function classifyCase(testCase) {
  const normalizedExpectedIntent = normalizeIntent(testCase.expectedIntent);
  const routeSuite = routeSoftIds.has(testCase.id) ? "soft" : "strict";
  const intentSuite = intentSoftIds.has(testCase.id) ? "soft" : "strict";
  const clarifySuite = clarifyIds.has(testCase.id) ? "strict" : "none";
  const manualReview = manualIds.has(testCase.id);

  return {
    ...testCase,
    normalizedExpectedIntent,
    routeSuite,
    intentSuite,
    clarifySuite,
    manualReview,
    allowedRoutes: allowedRouteOverrides[testCase.id] || [testCase.expectedRoute],
    reviewFocus: reviewFocusById[testCase.id] || [],
  };
}

const classified = sourceCases.map(classifyCase);

const routeCases = classified.map((testCase) => ({
  id: testCase.id,
  title: testCase.title,
  group: testCase.group,
  viewId: testCase.viewId,
  messages: testCase.messages,
  expectedRoute: testCase.expectedRoute,
  allowedRoutes: testCase.allowedRoutes,
  expectedSkillId: testCase.expectedSkillId,
  normalizedExpectedIntent: testCase.normalizedExpectedIntent,
  automationLevel: testCase.routeSuite,
  notes: testCase.notes || null,
}));

const intentCases = classified.map((testCase) => ({
  id: testCase.id,
  title: testCase.title,
  group: testCase.group,
  viewId: testCase.viewId,
  messages: testCase.messages,
  expectedPrimaryIntent: testCase.normalizedExpectedIntent,
  rawExpectedIntent: testCase.expectedIntent,
  automationLevel: testCase.intentSuite,
  notes: testCase.notes || null,
}));

const clarifyCases = classified
  .filter((testCase) => testCase.clarifySuite !== "none")
  .map((testCase) => ({
    id: testCase.id,
    title: testCase.title,
    group: testCase.group,
    viewId: testCase.viewId,
    messages: testCase.messages,
    expectedRoute: testCase.expectedRoute,
    allowedRoutes: testCase.allowedRoutes,
    expectedClarify: testCase.expectedClarify,
    notes: testCase.notes || null,
  }));

const manualCases = classified
  .filter((testCase) => testCase.manualReview)
  .map((testCase) => ({
    id: testCase.id,
    title: testCase.title,
    group: testCase.group,
    viewId: testCase.viewId,
    messages: testCase.messages,
    expectedRoute: testCase.expectedRoute,
    expectedSkillId: testCase.expectedSkillId,
    normalizedExpectedIntent: testCase.normalizedExpectedIntent,
    reviewFocus: testCase.reviewFocus,
    notes: testCase.notes || null,
  }));

const outputs = [
  ["eval-50-chat-lab.json", classified],
  ["eval-50-route.json", routeCases],
  ["eval-50-intent.json", intentCases],
  ["eval-50-clarify.json", clarifyCases],
  ["eval-50-manual.json", manualCases],
];

for (const [filename, value] of outputs) {
  fs.writeFileSync(path.join(evalDir, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

console.log("[build-eval-50-derived] wrote files:", outputs.map(([filename]) => filename));
