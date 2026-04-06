import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Minimize2, Send, Sparkles } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { sendAgentMessage, type AgentMessage } from "@/src/lib/agentApi";

interface CrmAgentWidgetProps {
  viewId: string;
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

const QUICK_PROMPTS: Record<string, string[]> = {
  dashboard: [
    "Tom tat KPI chinh hom nay.",
    "So sanh doanh thu thang nay voi thang truoc.",
    "Top 5 seller theo doanh thu hien tai la ai?",
  ],
  conversion: [
    "Ty le chuyen doi tong hien tai la bao nhieu?",
    "So sanh conversion theo source_group.",
    "Nhom nguon nao dang kem nhat can uu tien xu ly?",
  ],
  leads: [
    "Top tinh co nhieu lead nhat la gi?",
    "Nhom nganh nao co ty le chuyen doi cao nhat?",
    "Loc giup cac segment co conversion duoi 10%.",
  ],
  default: [
    "Tom tat nhanh so lieu quan trong trong view nay.",
    "So sanh 2 chi so noi bat nhat hien tai.",
    "Cho bang ngan cac diem can chu y.",
  ],
};

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
            <p key={`${block.type}-${index}`} className="whitespace-pre-wrap text-sm leading-relaxed text-[#1C1D21]">
              {block.value}
            </p>
          );
        }

        return (
          <div key={`${block.type}-${index}`} className="overflow-x-auto rounded-xl border border-gray-200">
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
                        {row[cellIndex] || "-"}
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

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[90%] rounded-2xl px-4 py-3 shadow-sm",
          isUser
            ? "bg-[#B8FF68] text-[#1C1D21]"
            : "border border-gray-200 bg-white text-[#1C1D21]",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="space-y-3">
            <AssistantContent content={message.content} />
            {estimatedCostVnd !== null ? (
              <div className="px-1 text-[11px] font-semibold text-gray-400">
                {message.usage?.provider === "nvidia"
                  ? "Free / 0d"
                  : `~${Math.round(estimatedCostVnd).toLocaleString("vi-VN")} d / call`}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrmAgentWidget({ viewId }: CrmAgentWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      role: "assistant",
      content: "Data Agent da san sang. Hay hoi so lieu, so sanh, hoac loc thong tin ban can.",
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const quickPrompts = QUICK_PROMPTS[viewId] || QUICK_PROMPTS.default;

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, open]);

  const submitQuestion = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) {
      return;
    }

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
      });
      const reply = String(payload.reply || "").trim();

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: reply.length > 0
            ? reply
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
          "fixed left-3 right-3 z-50 w-auto overflow-hidden rounded-3xl border border-gray-200 bg-[#F9F9FB] shadow-2xl transition-all duration-300 sm:left-auto sm:right-6 sm:w-[390px]",
          open
            ? "bottom-24 pointer-events-auto translate-y-0 opacity-100"
            : "bottom-20 pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1C1D21] text-[#B8FF68]">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1C1D21]">CRM Data Agent</p>
              <p className="text-[11px] text-gray-500">View: {viewId}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1C1D21]"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-[460px] flex-col">
          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}`} message={message} />
            ))}

            {isLoading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-500">
                  Dang truy van du lieu...
                </div>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          <div className="border-t border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {quickPrompts.slice(0, 2).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitQuestion(prompt)}
                  disabled={isLoading}
                  className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>

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
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[#B8FF68] disabled:bg-gray-100"
              />
              <button
                type="submit"
                disabled={isLoading || input.trim().length === 0}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1C1D21] text-[#B8FF68] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
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
        className="fixed bottom-6 right-6 z-50 rounded-2xl shadow-xl transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B8FF68]"
        aria-label="Toggle CRM Agent"
      >
        <div className="relative">
          <img
            src="/agent-trigger.svg"
            alt="CRM Agent trigger"
            className="h-14 w-14 rounded-2xl object-cover"
          />
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#B8FF68] text-[#1C1D21]">
            <Sparkles className="h-3 w-3" />
          </div>
        </div>
      </button>
    </>
  );
}
