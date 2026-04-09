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
  error = null
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
    latency_ms: latencyMs
  };
}
