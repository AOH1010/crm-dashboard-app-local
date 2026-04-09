import { ROUTE_LLM_FALLBACK, ROUTE_SKILL } from "../contracts/chat-contracts.js";

export function createSkillRouteDecision(skill) {
  return {
    route: ROUTE_SKILL,
    skillId: skill.id,
    confidence: 0.98
  };
}

export function createFallbackRouteDecision() {
  return {
    route: ROUTE_LLM_FALLBACK,
    skillId: null,
    confidence: 0.7
  };
}
