import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Minimize2, Send, Sparkles } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { sendAgentMessage, type AgentMessage } from "@/src/lib/agentApi";

interface CrmAgentWidgetProps {
  viewId: string;
  selectedFilters?: Record<string, unknown> | null;
}

interface MarkdownTableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

interface MarkdownTextBlock {
  type: "text";
  value: string;
}

type MarkdownBlock = MarkdownTableBlock | MarkdownTextBlock;

const USD_TO_VND = 26500;
const INPUT_COST_PER_MILLION_TOKENS_USD = 0.3;
const OUTPUT_COST_PER_MILLION_TOKENS_USD = 2.5;
const AGENT_SESSION_STORAGE_KEY = "crm-agent-session-id";

const VIEW_CACHE_PREFIXES: Record<string, string[]> = {
  dashboard: ["crm_cache_dashboard:"],
  team: ["crm_cache_team:"],
  conversion: ["crm_cache_conversion:"],
  renew: ["crm_cache_ops_renew:"],
  "user-map": ["crm_cache_ops_user_map:"],
  "active-map": ["crm_cache_ops_active_map:"],
  "cohort-active": ["crm_cache_ops_cohort:"],
  leads: ["crm_cache_leads"],
};

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function createLocalSessionId() {
  return `crm-agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStableSessionId() {
  if (typeof window === "undefined") {
    return createLocalSessionId();
  }

  const existing = window.localStorage.getItem(AGENT_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const created = createLocalSessionId();
  window.localStorage.setItem(AGENT_SESSION_STORAGE_KEY, created);
  return created;
}

function normalizeCachedFilters(viewId: string, cacheKey: string, data: Record<string, unknown> | null | undefined) {
  const appliedFilters = data?.applied_filters;
  if (appliedFilters && typeof appliedFilters === "object" && !Array.isArray(appliedFilters)) {
    return { ...appliedFilters } as Record<string, unknown>;
  }

  if (viewId === "dashboard" || viewId === "team") {
    const parts = cacheKey.split(":");
    if (parts.length >= 3) {
      const [from, to, extra] = parts.slice(-3);
      return viewId === "dashboard"
        ? { from, to, grain: extra }
        : { from: parts[1], to: parts[2] };
    }
  }

  if (viewId === "conversion") {
    const parts = cacheKey.split(":");
    if (parts.length >= 5) {
      const sourceToken = parts.slice(4).join(":");
      return {
        from: parts[1],
        to: parts[2],
        cohort_grain: parts[3],
        source_mode: sourceToken === "all" ? "all" : "custom",
        source_groups: sourceToken === "all" || sourceToken === "none"
          ? []
          : sourceToken.split("|").filter(Boolean),
      };
    }
  }

  return null;
}

function inferSelectedFiltersFromViewCache(viewId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const prefixes = VIEW_CACHE_PREFIXES[viewId] || [];
  if (prefixes.length === 0) {
    return null;
  }

  let latestMatch: { key: string; savedAt: string; data: Record<string, unknown> | null } | null = null;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !prefixes.some((prefix) => key.startsWith(prefix))) {
      continue;
    }

    const raw = window.localStorage.getItem(key);
    if (!raw) {
      continue;
    }

    const parsed = safeParseJson<{ savedAt?: string; data?: Record<string, unknown> }>(raw);
    const savedAt = String(parsed?.savedAt || "");
    if (!savedAt) {
      continue;
    }

    if (!latestMatch || savedAt > latestMatch.savedAt) {
      latestMatch = {
        key,
        savedAt,
        data: parsed?.data || null,
      };
    }
  }

  if (!latestMatch) {
    return null;
  }

  return normalizeCachedFilters(viewId, latestMatch.key, latestMatch.data);
}

function isPotentialTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.replace(/\|/g, "").trim().length > 0;
}

function isTableDivider(line: string) {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line);
}

function splitTableCells(line: string) {
  let normalized = line.trim();
  if (normalized.startsWith("|")) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith("|")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.split("|").map((cell) => cell.trim());
}

function looksLikePlainNumber(value: string) {
  const normalized = String(value || "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return false;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return false;
  }
  return true;
}

function formatTableCellValue(header: string, value: string) {
  const rawValue = String(value || "").trim();
  if (!looksLikePlainNumber(rawValue)) {
    return rawValue || "-";
  }

  const numericValue = Number(rawValue);
  const normalizedHeader = header.trim().toLowerCase();
  const isCurrencyColumn = /(doanh thu|revenue|amount|gia tri|gmv)/.test(normalizedHeader);
  const isIntegerLike = Number.isInteger(numericValue);

  if (isCurrencyColumn) {
    return Math.round(numericValue).toLocaleString("vi-VN");
  }

  return numericValue.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: isIntegerLike ? 0 : 2,
  });
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = String(content || "").split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const currentLine = lines[cursor];
    const nextLine = lines[cursor + 1] || "";

    if (isPotentialTableRow(currentLine) && isTableDivider(nextLine)) {
      const headers = splitTableCells(currentLine);
      const rows: string[][] = [];
      cursor += 2;

      while (cursor < lines.length && isPotentialTableRow(lines[cursor])) {
        const cells = splitTableCells(lines[cursor]);
        rows.push(cells);
        cursor += 1;
      }

      if (headers.length > 0) {
        blocks.push({
          type: "table",
          headers,
          rows,
        });
      }
      continue;
    }

    const textLines = [currentLine];
    cursor += 1;

    while (cursor < lines.length) {
      const line = lines[cursor];
      const lineAfter = lines[cursor + 1] || "";
      if (isPotentialTableRow(line) && isTableDivider(lineAfter)) {
        break;
      }
      textLines.push(line);
      cursor += 1;
    }

    const textValue = textLines.join("\n").trim();
    if (textValue.length > 0) {
      blocks.push({
        type: "text",
        value: textValue,
      });
    }
  }

  return blocks;
}

function AssistantContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <p key={`${block.type}-${index}`} className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {block.value}
            </p>
          );
        }

        return (
          <div key={`${block.type}-${index}`} className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {block.headers.map((header) => (
                    <th key={header} className="px-3 py-2 font-bold text-gray-600">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${rowIndex}-${row.join("-")}`} className="border-t border-gray-100">
                    {block.headers.map((_, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 text-gray-700">
                        {formatTableCellValue(block.headers[cellIndex] || "", row[cellIndex] || "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function estimateMessageCostVnd(message: AgentMessage) {
  if (!message.usage) {
    return null;
  }

  if (message.usage.provider === "nvidia") {
    return 0;
  }

  const promptCostVnd = (message.usage.prompt_tokens / 1_000_000) * INPUT_COST_PER_MILLION_TOKENS_USD * USD_TO_VND;
  const outputBillableTokens = (message.usage.completion_tokens || 0) + (message.usage.thoughts_tokens || 0);
  const outputCostVnd = (outputBillableTokens / 1_000_000) * OUTPUT_COST_PER_MILLION_TOKENS_USD * USD_TO_VND;
  return promptCostVnd + outputCostVnd;
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";
  const estimatedCostVnd = estimateMessageCostVnd(message);
  const totalTokens = Number(message.usage?.total_tokens || 0);

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[90%] rounded-2xl px-4 py-3 shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="space-y-3">
            <AssistantContent content={message.content} />
            {estimatedCostVnd !== null ? (
              <div className="px-1 text-[11px] font-semibold text-gray-400">
                [{totalTokens.toLocaleString("vi-VN")} token | ~{Math.round(estimatedCostVnd).toLocaleString("vi-VN")} đ]
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrmAgentWidget({ viewId, selectedFilters = null }: CrmAgentWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      role: "assistant",
      content: "Data Agent da san sang. Hay hoi so lieu, so sanh, hoac loc thong tin ban can.",
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const inferredSelectedFilters = useMemo(() => inferSelectedFiltersFromViewCache(viewId), [viewId]);
  const effectiveSelectedFilters = selectedFilters ?? inferredSelectedFilters;
  const sessionId = useMemo(() => getStableSessionId(), []);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, open]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncDebugFlag = () => {
      setDebugEnabled(window.localStorage.getItem("crmAgentDebug") === "true");
    };

    syncDebugFlag();
    window.addEventListener("storage", syncDebugFlag);
    window.addEventListener("focus", syncDebugFlag);

    return () => {
      window.removeEventListener("storage", syncDebugFlag);
      window.removeEventListener("focus", syncDebugFlag);
    };
  }, []);

  const submitQuestion = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const runtimeDebugEnabled = typeof window !== "undefined"
      ? window.localStorage.getItem("crmAgentDebug") === "true"
      : debugEnabled;
    setDebugEnabled(runtimeDebugEnabled);

    const nextMessages: AgentMessage[] = [
      ...messages,
      {
        role: "user",
        content: trimmed,
      },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const payload = await sendAgentMessage({
        viewId,
        messages: nextMessages,
        selectedFilters: effectiveSelectedFilters,
        sessionId,
        debug: runtimeDebugEnabled,
      });
      const reply = String(payload.reply || "").trim();
      const debugSuffix = runtimeDebugEnabled
        ? `\n\n[debug] route=${payload.route || "-"} skill=${payload.skill_id || "-"} latency=${payload.latency_ms || 0}ms`
        : "";

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: reply.length > 0
            ? `${reply}${debugSuffix}`
            : "Khong tim thay du lieu phu hop voi cau hoi nay.",
          usage: payload.usage,
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "Khong the truy van agent luc nay. Vui long thu lai sau.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "fixed left-3 right-3 z-50 w-auto overflow-hidden rounded-3xl border border-border bg-background shadow-2xl transition-all duration-300 sm:left-auto sm:right-6 sm:w-[460px]",
          open
            ? "bottom-24 pointer-events-auto translate-y-0 opacity-100"
            : "bottom-20 pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">CRM Data Agent</p>
              <p className="text-[11px] text-muted-foreground">View: {viewId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-[540px] flex-col">
          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}`} message={message} />
            ))}

            {isLoading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
                  Dang truy van du lieu...
                </div>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          <div className="border-t border-border bg-card p-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitQuestion(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Hoi du lieu ngay..."
                disabled={isLoading}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:bg-gray-100"
              />
              <button
                type="submit"
                disabled={isLoading || input.trim().length === 0}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-muted-foreground"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-6 right-6 z-50 rounded-2xl shadow-xl transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[currentColor]"
        aria-label="Toggle CRM Agent"
      >
        <div className="relative">
          <img
            src="/agent-trigger.svg"
            alt="CRM Agent trigger"
            className="h-14 w-14 rounded-2xl object-cover"
          />
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-3 w-3" />
          </div>
        </div>
      </button>
    </>
  );
}
