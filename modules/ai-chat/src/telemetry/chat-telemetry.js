import { getLatencyMs } from "./trace-context.js";

export function buildTelemetryResponse({
  traceContext,
  route,
  skillId = null,
  confidence = null,
  promptVersion = null,
  usage,
  sqlLogs,
  reply,
  error = null,
  intent = null,
  intentSource = null,
  intentConfidence = null,
  ambiguityFlag = null,
  clarificationQuestion = null,
  matchedSkillCandidates = null,
  fallbackReason = null,
  formatterSource = null,
  debugTimeline = null
}) {
  const latencyMs = getLatencyMs(traceContext);
  return {
    reply,
    usage,
    sql_logs: sqlLogs,
    error,
    trace_id: traceContext.traceId,
    route,
    skill_id: skillId,
    confidence,
    prompt_version: promptVersion,
    latency_ms: latencyMs,
    intent,
    intent_source: intentSource,
    intent_confidence: intentConfidence,
    ambiguity_flag: ambiguityFlag,
    clarification_question: clarificationQuestion,
    matched_skill_candidates: matchedSkillCandidates,
    fallback_reason: fallbackReason,
    formatter_source: formatterSource,
    execution_timeline: debugTimeline
  };
}
