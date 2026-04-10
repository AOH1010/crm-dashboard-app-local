export const ROUTE_SKILL = "skill";
export const ROUTE_LLM_FALLBACK = "llm_fallback";
export const ROUTE_CLARIFY_REQUIRED = "clarify_required";
export const ROUTE_VALIDATION = "validation";

export const DEFAULT_VIEW_ID = "dashboard";
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_INTENT_TURNS = 6;

export const DEFAULT_USE_INTENT_CLASSIFIER = true;
export const DEFAULT_USE_SKILL_FORMATTER = true;

export function createUsage(provider = "skill") {
  return {
    provider,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    thoughts_tokens: 0,
    tool_use_prompt_tokens: 0
  };
}
