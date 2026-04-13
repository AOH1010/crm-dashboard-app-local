import {
  ROUTE_CLARIFY_REQUIRED,
  ROUTE_LLM_FALLBACK,
  ROUTE_SKILL
} from "../contracts/chat-contracts.js";
import { foldText } from "../tooling/common.js";
import { getSkillCapabilityV3 } from "./skill-capabilities-v3.js";

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function objectHasNumberKey(value, keyPattern) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => objectHasNumberKey(item, keyPattern));
  }
  return Object.entries(value).some(([key, nestedValue]) => (
    keyPattern.test(key) && hasNumber(nestedValue)
  ) || objectHasNumberKey(nestedValue, keyPattern));
}

function findSellerFact(skillResult) {
  return skillResult?.summary_facts?.seller_name
    || skillResult?.summary_facts?.leader?.seller_name
    || skillResult?.summary_facts?.top_seller?.seller_name
    || null;
}

function hasOrderFacts(skillResult) {
  const facts = skillResult?.summary_facts || {};
  if (hasNumber(facts.order_count)) return true;
  if (hasNumber(facts.leader?.order_count)) return true;
  if (Array.isArray(skillResult?.data?.ranking) && skillResult.data.ranking.some((row) => hasNumber(row.order_count))) return true;
  if (Array.isArray(skillResult?.data?.teams) && skillResult.data.teams.some((row) => hasNumber(row.order_count))) return true;
  if (objectHasNumberKey(skillResult?.summary_facts, /order_count|orders/i)) return true;
  if (objectHasNumberKey(skillResult?.data, /order_count|orders/i)) return true;
  return false;
}

function hasRevenueFacts(skillResult) {
  const facts = skillResult?.summary_facts || {};
  if (hasNumber(facts.total_revenue)) return true;
  if (hasNumber(facts.leader?.revenue_amount)) return true;
  if (hasNumber(facts.top_team?.revenue_amount)) return true;
  if (hasNumber(facts.top_seller?.revenue_amount)) return true;
  if (Array.isArray(skillResult?.data?.ranking) && skillResult.data.ranking.some((row) => hasNumber(row.revenue_amount))) return true;
  if (Array.isArray(skillResult?.data?.teams) && skillResult.data.teams.some((row) => hasNumber(row.revenue_amount))) return true;
  if (objectHasNumberKey(skillResult?.summary_facts, /revenue|amount/i)) return true;
  if (objectHasNumberKey(skillResult?.data, /revenue|amount/i)) return true;
  return false;
}

function hasSellerRows(skillResult) {
  return Array.isArray(skillResult?.data?.sellers)
    && skillResult.data.sellers.some((row) => String(row?.seller_name || "").trim().length > 0);
}

function validateActionShape(context, skillResult) {
  const expectedAction = context.intent?.action || "unknown";
  const expectedShape = context.semantic?.output_shape || context.semantic?.slots?.output_shape || "summary_snapshot";
  if (expectedAction === "define") {
    if (skillResult?.summary_facts?.definition_key || skillResult?.format_hint === "definition") {
      return null;
    }
    return {
      ok: false,
      route: ROUTE_LLM_FALLBACK,
      reason_code: "skill_output_missing_definition_facts"
    };
  }

  if (expectedAction === "list" && expectedShape === "entity_list" && !hasSellerRows(skillResult)) {
    return {
      ok: false,
      route: ROUTE_LLM_FALLBACK,
      reason_code: "skill_output_missing_entity_list"
    };
  }

  return null;
}

function validateSellerEntity(context, skill, skillResult) {
  if (skill.id !== "seller-month-revenue") {
    return null;
  }
  const expectedSeller = context.semantic?.slots?.seller || context.intent?.entities?.find((entity) => entity.type === "seller")?.value || null;
  if (!expectedSeller) {
    return null;
  }
  const actualSeller = findSellerFact(skillResult);
  if (!actualSeller) {
    return {
      ok: false,
      route: ROUTE_LLM_FALLBACK,
      reason_code: "skill_output_missing_entity"
    };
  }
  if (foldText(actualSeller) !== foldText(expectedSeller)) {
    return {
      ok: false,
      route: ROUTE_LLM_FALLBACK,
      reason_code: "skill_output_entity_mismatch"
    };
  }
  return null;
}

function validateMetric(context, skill, skillResult) {
  const expectedMetric = context.semantic?.slots?.metric || context.intent?.metric || "unknown";
  if (!expectedMetric || expectedMetric === "unknown") {
    return null;
  }

  if (skill.id === "top-sellers-period") {
    const rankingMetric = skillResult?.summary_facts?.ranking_metric || "revenue";
    if (expectedMetric === "orders" && rankingMetric !== "orders") {
      return {
        ok: false,
        route: ROUTE_LLM_FALLBACK,
        reason_code: "skill_output_metric_mismatch"
      };
    }
    if (expectedMetric === "revenue" && rankingMetric !== "revenue") {
      return {
        ok: false,
        route: ROUTE_LLM_FALLBACK,
        reason_code: "skill_output_metric_mismatch"
      };
    }
  }

  if (expectedMetric === "orders" && !hasOrderFacts(skillResult)) {
    return {
      ok: false,
      route: ROUTE_LLM_FALLBACK,
      reason_code: "skill_output_missing_order_facts"
    };
  }

  if (expectedMetric === "revenue" && !hasRevenueFacts(skillResult)) {
    return {
      ok: false,
      route: ROUTE_LLM_FALLBACK,
      reason_code: "skill_output_missing_revenue_facts"
    };
  }

  return null;
}

export function validateSkillOutputV3({ context, skill, skillResult }) {
  if (!skillResult) {
    return {
      ok: false,
      route: context.clarificationQuestion ? ROUTE_CLARIFY_REQUIRED : ROUTE_LLM_FALLBACK,
      reason_code: "skill_returned_null"
    };
  }

  if (skillResult.format_hint === "no_data") {
    return {
      ok: true,
      route: ROUTE_SKILL,
      reason_code: "no_data_valid"
    };
  }

  const capability = getSkillCapabilityV3(skill.id);
  if (!capability) {
    return {
      ok: false,
      route: ROUTE_LLM_FALLBACK,
      reason_code: "missing_capability_metadata"
    };
  }

  const metricResult = validateMetric(context, skill, skillResult);
  if (metricResult) {
    return metricResult;
  }

  const entityResult = validateSellerEntity(context, skill, skillResult);
  if (entityResult) {
    return entityResult;
  }

  const actionResult = validateActionShape(context, skillResult);
  if (actionResult) {
    return actionResult;
  }

  return {
    ok: true,
    route: ROUTE_SKILL,
    reason_code: "skill_output_valid"
  };
}
