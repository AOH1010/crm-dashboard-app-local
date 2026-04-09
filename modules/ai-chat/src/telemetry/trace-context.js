import crypto from "node:crypto";

export function createTraceContext() {
  return {
    traceId: crypto.randomUUID(),
    startedAt: Date.now()
  };
}

export function getLatencyMs(traceContext) {
  return Date.now() - traceContext.startedAt;
}
