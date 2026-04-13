import {
  ROUTE_CLARIFY_REQUIRED,
  ROUTE_LLM_FALLBACK,
  ROUTE_SKILL,
  ROUTE_VALIDATION
} from "../contracts/chat-contracts.js";
import { ROUTABLE_SKILL_INTENTS } from "./intent-catalog.js";
import { buildSemanticFrameV3 } from "./semantic-frame-v3.js";
import { scoreSkillCapabilityV3 } from "./skill-capabilities-v3.js";

const SEMANTIC_SKILL_CONFIDENCE_MIN = 0.75;
const SEMANTIC_CLARIFY_CONFIDENCE_MIN = 0.5;
const CANDIDATE_SCORE_MIN = 0.8;
const CANDIDATE_SCORE_MARGIN_MIN = 0.12;

function buildResolvedContext(semantic) {
  const slots = semantic.slots || {};
  return {
    action: semantic.action || slots.action || "unknown",
    subject: semantic.subject || slots.subject || "unknown",
    state: semantic.state || slots.state || null,
    topic: slots.topic || "unknown",
    metric: slots.metric || "unknown",
    metric_modifier: slots.metric_modifier || null,
    entity_type: slots.entity_type || null,
    entity_value: slots.entity_value || null,
    time_range: slots.time_range || null,
    breakdown_by: slots.breakdown_by || null,
    comparison_target: slots.comparison_target || null,
    output_mode: slots.output_mode || "summary",
    output_shape: semantic.output_shape || slots.output_shape || "summary_snapshot"
  };
}

function routeDecision({
  decision,
  reasonCode,
  semantic,
  confidence,
  candidateExecutors = [],
  skill = null,
  fallbackReason = null
}) {
  return {
    version: "v3.route_policy.1",
    decision,
    resolved_route: decision,
    reason_code: reasonCode,
    fallback_reason: fallbackReason || reasonCode,
    confidence,
    skill,
    skill_id: skill?.id || null,
    resolved_context: buildResolvedContext(semantic),
    candidate_executors: candidateExecutors.map((candidate) => ({
      skill_id: candidate.skill?.id || null,
      family: candidate.family,
      score: candidate.score,
      missing_slots: candidate.missing_slots,
      reason_codes: candidate.reason_codes
    })),
    matched_skill_candidates: candidateExecutors
      .filter((candidate) => candidate.score >= 0.5)
      .map((candidate) => candidate.skill?.id)
      .filter(Boolean)
  };
}

function scoreAllSkills({ context, skillRegistry, semantic }) {
  return skillRegistry.list()
    .map((skill) => scoreSkillCapabilityV3({ skill, semantic, context }))
    .sort((left, right) => right.score - left.score || String(left.skill?.id || "").localeCompare(String(right.skill?.id || "")));
}

function hasClarificationQuestion(context) {
  return Boolean(context.intent?.clarification_question || context.clarificationQuestion);
}

function capabilitySupportsStrictShape(candidate, semantic) {
  const capability = candidate?.capability;
  if (!capability) return false;
  const outputShape = semantic.output_shape || semantic.slots?.output_shape || "summary_snapshot";
  const subject = semantic.subject || semantic.slots?.subject || "unknown";
  const state = semantic.state || semantic.slots?.state || null;

  const shapeSupported = !Array.isArray(capability.supportedOutputShapes)
    ? !["definition", "entity_list"].includes(outputShape)
    : capability.supportedOutputShapes.includes(outputShape);
  const subjectSupported = !Array.isArray(capability.supportedSubjects)
    || capability.supportedSubjects.includes(subject)
    || capability.supportedSubjects.includes("unknown");
  const stateSupported = !Array.isArray(capability.supportedStates)
    || capability.supportedStates.includes(state)
    || capability.supportedStates.includes(null)
    || capability.supportedStates.includes("any");

  return shapeSupported && subjectSupported && stateSupported;
}

function findBestStrictShapeCandidate(candidateExecutors, semantic) {
  return candidateExecutors.find((candidate) => capabilitySupportsStrictShape(candidate, semantic)) || null;
}

export function buildRoutePolicyV3({ context, skillRegistry }) {
  const semantic = context.semantic || buildSemanticFrameV3(context);
  const intent = context.intent || {};
  const candidateExecutors = scoreAllSkills({
    context,
    skillRegistry,
    semantic
  });
  const topCandidate = candidateExecutors[0] || null;
  const secondCandidate = candidateExecutors[1] || null;
  const directSkillId = ROUTABLE_SKILL_INTENTS[intent.primary_intent] || null;
  const directCandidate = directSkillId
    ? candidateExecutors.find((candidate) => candidate.skill?.id === directSkillId) || null
    : null;
  const topCandidateIsDirect = Boolean(directSkillId && topCandidate?.skill?.id === directSkillId);
  const candidateMargin = topCandidate && secondCandidate
    ? topCandidate.score - secondCandidate.score
    : 1;
  const confidence = Number(semantic.confidence || intent.confidence || context.intentConfidence || 0);
  const strictShapeCandidate = findBestStrictShapeCandidate(candidateExecutors, semantic);

  if (intent.primary_intent === "injection_attempt" || intent.primary_intent === "out_of_domain_request") {
    return routeDecision({
      decision: ROUTE_VALIDATION,
      reasonCode: "unsafe_or_invalid_input",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (semantic.multi_intent_flag || intent.ambiguity_reason === "multi_intent") {
    return routeDecision({
      decision: ROUTE_LLM_FALLBACK,
      reasonCode: "multi_intent_out_of_scope",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (intent.primary_intent === "custom_analytical_query") {
    return routeDecision({
      decision: ROUTE_LLM_FALLBACK,
      reasonCode: "broad_analytic_query",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (intent.primary_intent === "unknown" && semantic.needs_clarification) {
    return routeDecision({
      decision: ROUTE_CLARIFY_REQUIRED,
      reasonCode: semantic.clarification_reason || "slots_incomplete",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (semantic.needs_clarification) {
    return routeDecision({
      decision: ROUTE_CLARIFY_REQUIRED,
      reasonCode: semantic.clarification_reason || "slots_incomplete",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (intent.primary_intent === "unknown") {
    return routeDecision({
      decision: hasClarificationQuestion(context) ? ROUTE_CLARIFY_REQUIRED : ROUTE_LLM_FALLBACK,
      reasonCode: hasClarificationQuestion(context) ? "unknown_intent_clarify" : "unknown_intent_fallback",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (confidence < SEMANTIC_CLARIFY_CONFIDENCE_MIN) {
    return routeDecision({
      decision: ROUTE_LLM_FALLBACK,
      reasonCode: "semantic_confidence_too_low",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (confidence < SEMANTIC_SKILL_CONFIDENCE_MIN) {
    return routeDecision({
      decision: ROUTE_CLARIFY_REQUIRED,
      reasonCode: "semantic_confidence_needs_clarification",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (["define", "list"].includes(semantic.action || "unknown")
    && ["definition", "entity_list"].includes(semantic.output_shape || "summary_snapshot")) {
    if (!strictShapeCandidate || strictShapeCandidate.score < CANDIDATE_SCORE_MIN) {
      return routeDecision({
        decision: hasClarificationQuestion(context) ? ROUTE_CLARIFY_REQUIRED : ROUTE_LLM_FALLBACK,
        reasonCode: "no_shape_matched_skill",
        semantic,
        confidence,
        candidateExecutors,
        skill: null
      });
    }

    return routeDecision({
      decision: ROUTE_SKILL,
      reasonCode: "matched_shape_safe_skill",
      semantic,
      confidence,
      candidateExecutors,
      skill: strictShapeCandidate.skill
    });
  }

  if (!topCandidate || topCandidate.score < CANDIDATE_SCORE_MIN) {
    const reasonCode = topCandidate?.reason_codes?.[0] || "candidate_score_too_low";
    const missingRequiredSlot = topCandidate?.reason_codes?.includes("missing_required_slot");
    return routeDecision({
      decision: missingRequiredSlot && hasClarificationQuestion(context) ? ROUTE_CLARIFY_REQUIRED : ROUTE_LLM_FALLBACK,
      reasonCode,
      semantic,
      confidence,
      candidateExecutors
    });
  }

  if (directCandidate
    && directCandidate.score >= CANDIDATE_SCORE_MIN
    && directCandidate.score >= (topCandidate?.score ?? 0)
    && capabilitySupportsStrictShape(directCandidate, semantic)) {
    return routeDecision({
      decision: ROUTE_SKILL,
      reasonCode: "matched_direct_intent_skill",
      semantic,
      confidence,
      candidateExecutors,
      skill: directCandidate.skill
    });
  }

  if (!topCandidateIsDirect && candidateMargin < CANDIDATE_SCORE_MARGIN_MIN && secondCandidate?.score >= CANDIDATE_SCORE_MIN) {
    return routeDecision({
      decision: ROUTE_CLARIFY_REQUIRED,
      reasonCode: "candidate_margin_too_small",
      semantic,
      confidence,
      candidateExecutors,
      skill: null
    });
  }

  if (semantic.broadness === "broad" && !topCandidateIsDirect && !["trend_analysis", "forecasting"].includes(topCandidate.family)) {
    return routeDecision({
      decision: ROUTE_LLM_FALLBACK,
      reasonCode: "broad_analytic_query",
      semantic,
      confidence,
      candidateExecutors
    });
  }

  return routeDecision({
    decision: ROUTE_SKILL,
    reasonCode: "matched_certified_skill_family",
    semantic,
    confidence,
    candidateExecutors,
    skill: topCandidate.skill
  });
}
