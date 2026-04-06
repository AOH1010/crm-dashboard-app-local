import { buildApiUrl } from "./apiBase";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentChatResponse {
  reply: string;
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
}): Promise<AgentChatResponse> {
  const response = await fetch(buildApiUrl("/api/agent/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: params.messages,
      view_id: params.viewId,
    }),
  });

  if (!response.ok) {
    throw new Error("Khong the gui cau hoi den Data Agent.");
  }

  return response.json();
}
