import { MAX_HISTORY_MESSAGES } from "../contracts/chat-contracts.js";

export function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const normalized = messages
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: typeof item?.content === "string" ? item.content.trim() : ""
    }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);

  while (normalized.length > 0 && normalized[0].role !== "user") {
    normalized.shift();
  }

  return normalized;
}
