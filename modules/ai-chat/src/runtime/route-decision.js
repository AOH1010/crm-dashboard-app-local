import {
  ROUTE_CLARIFY_REQUIRED,
  ROUTE_LLM_FALLBACK,
  ROUTE_SKILL
} from "../contracts/chat-contracts.js";

export function createSkillRouteDecision(skill, confidence = 0.98) {
  return {
    route: ROUTE_SKILL,
    skillId: skill.id,
    confidence
  };
}

export function createFallbackRouteDecision(confidence = 0.45) {
  return {
    route: ROUTE_LLM_FALLBACK,
    skillId: null,
    confidence
  };
}

export function createClarifyRouteDecision(confidence = 0.7) {
  return {
    route: ROUTE_CLARIFY_REQUIRED,
    skillId: null,
    confidence
  };
}
