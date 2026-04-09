import { buildApiUrl } from "./apiBase";

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

export async function sendAgentMessage(params: {
  messages: AgentMessage[];
  viewId: string;
  selectedFilters?: Record<string, unknown> | null;
  sessionId?: string | null;
  debug?: boolean;
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
    }),
  });

  if (!response.ok) {
    throw new Error("Khong the gui cau hoi den Data Agent.");
  }

  return response.json();
}
