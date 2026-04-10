import { buildApiUrl } from "./apiBase";
import type { ChatLabScenario } from "./chatLabScenarios";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  usage?: {
    provider?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    thoughts_tokens?: number;
    tool_use_prompt_tokens?: number;
  };
}

export interface AgentChatResponse {
  reply: string;
  trace_id?: string;
  route?: string;
  skill_id?: string | null;
  confidence?: number | null;
  prompt_version?: string | null;
  latency_ms?: number | null;
  intent?: {
    primary_intent?: string;
    action?: string;
    metric?: string;
    dimension?: string;
    entities?: Array<{ type: string; value: string }>;
    time_window?: { type: string; value: string };
    output_mode?: string;
    ambiguity_flag?: boolean;
    ambiguity_reason?: string;
    clarification_question?: string;
    confidence?: number;
  } | null;
  intent_source?: string | null;
  intent_confidence?: number | null;
  ambiguity_flag?: boolean | null;
  clarification_question?: string | null;
  matched_skill_candidates?: string[] | null;
  fallback_reason?: string | null;
  formatter_source?: string | null;
  execution_timeline?: Array<{
    step: string;
    at: string;
    [key: string]: unknown;
  }> | null;
  usage?: {
    provider?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    thoughts_tokens?: number;
    tool_use_prompt_tokens?: number;
  };
  sql_logs?: Array<{
    name: string;
    sql: string;
    row_count: number;
    row_limit: number;
    error?: string;
  }>;
  error?: string;
}

export interface ChatLabExportResponse {
  ok: boolean;
  filename: string;
  relative_path: string;
  absolute_path: string;
  row_count: number;
}

export interface EvaluateTestResult {
  scenario_id: string;
  status: "pass" | "fail" | "needs_review";
  layer: "route" | "intent" | "clarify" | "formatter" | "grounding" | "unknown";
  summary: string;
  recommendation: string;
  should_review_manually: boolean;
  generated_at: string;
  knowledge_source: string;
  matched_know_how: Array<{
    id: string;
    title: string;
    rule_learned: string;
  }>;
  checks: {
    expected_route: string;
    expected_intent: string;
    expected_skill_id: string;
    expected_clarify: boolean | null;
    actual_route: string;
    actual_intent: string;
    actual_skill_id: string;
    actual_clarification: string;
    route_pass: boolean;
    intent_pass: boolean;
    clarify_pass: boolean;
  };
}

export async function sendAgentMessage(params: {
  messages: AgentMessage[];
  viewId: string;
  selectedFilters?: Record<string, unknown> | null;
  sessionId?: string | null;
  debug?: boolean;
  useIntentClassifier?: boolean;
  useSkillFormatter?: boolean;
}): Promise<AgentChatResponse> {
  const response = await fetch(buildApiUrl("/api/agent/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: params.messages,
      view_id: params.viewId,
      selected_filters: params.selectedFilters ?? undefined,
      session_id: params.sessionId ?? undefined,
      debug: params.debug ?? undefined,
      use_intent_classifier: params.useIntentClassifier ?? undefined,
      use_skill_formatter: params.useSkillFormatter ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error("Khong the gui cau hoi den Data Agent.");
  }

  return response.json();
}

export async function fetchChatLabScenarios(): Promise<ChatLabScenario[]> {
  const response = await fetch(buildApiUrl("/api/agent/chat-lab/scenarios"));

  if (!response.ok) {
    throw new Error("Khong the tai danh sach testcase cho Chat Lab.");
  }

  return response.json();
}

export async function exportChatLabCsvArtifact(params: {
  filename: string;
  rows: Record<string, unknown>[];
}): Promise<ChatLabExportResponse> {
  const response = await fetch(buildApiUrl("/api/agent/chat-lab/export"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: params.filename,
      rows: params.rows,
    }),
  });

  if (!response.ok) {
    throw new Error("Khong the luu CSV Chat Lab vao artifact.");
  }

  return response.json();
}

export async function evaluateChatLabResults(params: {
  items: Array<{
    scenario: ChatLabScenario;
    result: {
      scenarioId: string;
      response: AgentChatResponse | null;
      error: string | null;
      startedAt: string;
    };
  }>;
}): Promise<EvaluateTestResult[]> {
  const response = await fetch(buildApiUrl("/api/agent/chat-lab/evaluate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: params.items,
    }),
  });

  if (!response.ok) {
    throw new Error("Khong the chay Evaluate_test cho Chat Lab.");
  }

  const payload = await response.json();
  return Array.isArray(payload?.evaluations) ? payload.evaluations : [];
}
