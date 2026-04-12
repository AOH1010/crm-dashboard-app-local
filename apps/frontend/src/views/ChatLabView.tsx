import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Bot, FlaskConical, Play, Rows4, Search, Send, SplitSquareHorizontal, TimerReset } from "lucide-react";
import { CHAT_LAB_FALLBACK_SCENARIOS, type ChatLabScenario } from "@/src/lib/chatLabScenarios";
import {
  exportChatLabCsvArtifact,
  fetchChatLabScenarios,
  sendAgentMessage,
  type AgentChatResponse,
  type AgentMessage,
} from "@/src/lib/agentApi";
import { cn } from "@/src/lib/utils";

type RunResult = { scenarioId: string; response: AgentChatResponse | null; error: string | null; startedAt: string };
type LabTab = "overview" | "reasoning" | "sql" | "conversation";
type ManualReviewStatus = "pending" | "pass" | "fail";
type ManualReviewDecision = { status: ManualReviewStatus; reason: string; updatedAt: string };
type SessionTurnRecord = { id: string; scriptedIndex: number | null; userMessage: string; referenceAssistant: string | null; response: AgentChatResponse | null; error: string | null; startedAt: string };
type ScriptedUserTurn = { index: number; userMessage: string; referenceAssistant: string | null; isFinal: boolean };
type TurnAssessment = { tone: "ok" | "bad" | "neutral"; label: string; detail: string };

const STORAGE_KEYS = {
  currentResult: "chat-lab-current-result",
  batchResults: "chat-lab-batch-results",
  manualReviews: "chat-lab-manual-reviews",
} as const;
const CHAT_LAB_ARTIFACT_DIR = "artifacts/chat-lab-exports";

function getScoreSummary(
  scenario: ChatLabScenario,
  response: AgentChatResponse | null,
  manualDecision?: ManualReviewDecision | null
) {
  const allowedRoutes = scenario.allowedRoutes?.length ? scenario.allowedRoutes : [scenario.expectedRoute];
  const expectedIntent = scenario.normalizedExpectedIntent || scenario.expectedIntent;
  const routePass = allowedRoutes.includes(response?.route || "");
  const intentPass = (response?.intent?.primary_intent || "unknown") === expectedIntent;
  const clarifyPass = scenario.expectedClarify === undefined ? true : Boolean(response?.clarification_question) === scenario.expectedClarify;
  const autoPass = routePass && intentPass && clarifyPass;
  const requiresManualReview = Boolean(scenario.manualReview);
  const manualStatus = manualDecision?.status || (requiresManualReview ? "pending" : null);
  const manualPass = manualStatus === "fail" ? false : manualStatus === "pass" ? true : !requiresManualReview;
  const pass = manualStatus === "fail"
    ? false
    : manualStatus === "pass"
      ? true
      : requiresManualReview
        ? false
        : autoPass && manualPass;
  return {
    routePass,
    intentPass,
    clarifyPass,
    autoPass,
    requiresManualReview,
    manualStatus,
    manualPass,
    pass
  };
}

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

function createChatLabSessionId() {
  return `chat-lab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildScriptedTurns(scenario: ChatLabScenario | null): ScriptedUserTurn[] {
  if (!scenario) return [];
  const turns: ScriptedUserTurn[] = [];
  for (let index = 0; index < scenario.messages.length; index += 1) {
    const message = scenario.messages[index];
    if (message.role !== "user") continue;
    turns.push({
      index: turns.length,
      userMessage: message.content,
      referenceAssistant: scenario.messages[index + 1]?.role === "assistant" ? scenario.messages[index + 1].content : null,
      isFinal: false,
    });
  }
  return turns.map((turn, index) => ({ ...turn, isFinal: index === turns.length - 1 }));
}

function formatConversationModeLabel(mode?: string | null) {
  switch (mode) {
    case "new_topic":
      return "Topic mới";
    case "continued_topic":
      return "Giữ topic";
    case "follow_up_patch":
      return "Patch follow-up";
    case "topic_reset":
      return "Reset topic";
    default:
      return "Chưa rõ";
  }
}

function getConversationModeTone(mode?: string | null): "ok" | "bad" | "neutral" {
  switch (mode) {
    case "continued_topic":
    case "follow_up_patch":
    case "topic_reset":
      return "ok";
    case "new_topic":
      return "neutral";
    default:
      return "neutral";
  }
}

function serializeConversationEntities(response: AgentChatResponse | null) {
  return response?.conversation_state?.entities?.map((entity) => `${entity.type}:${entity.value}`).join(" | ") || "";
}

function serializeConversationFocuses(response: AgentChatResponse | null) {
  return response?.conversation_state?.focuses?.join(" | ") || "";
}

function serializeConversationPatchedFields(response: AgentChatResponse | null) {
  return response?.conversation_state?.patched_fields?.join(" | ") || "";
}

function getConversationTurnAssessment({
  turn,
  scenario,
  scriptedTurnCount,
  manualDecision,
}: {
  turn: SessionTurnRecord;
  scenario: ChatLabScenario | null;
  scriptedTurnCount: number;
  manualDecision?: ManualReviewDecision | null;
}): TurnAssessment {
  if (turn.error) {
    return {
      tone: "bad",
      label: "Lỗi turn",
      detail: turn.error,
    };
  }

  const response = turn.response;
  if (!response) {
    return {
      tone: "bad",
      label: "Thiếu phản hồi",
      detail: "Turn không trả về response hợp lệ.",
    };
  }

  const isFinalScriptedTurn = turn.scriptedIndex !== null && turn.scriptedIndex === scriptedTurnCount - 1;
  if (isFinalScriptedTurn && scenario) {
    const score = getScoreSummary(scenario, response, manualDecision);
    if (score.requiresManualReview && score.manualStatus === "pending" && score.autoPass) {
      return {
        tone: "neutral",
        label: "Chờ review",
        detail: "Turn cuối đã pass tự động nhưng vẫn cần bạn xác nhận bằng review tay.",
      };
    }
    return {
      tone: score.pass ? "ok" : "bad",
      label: score.pass ? "Pass cuối" : "Fail cuối",
      detail: `Route=${score.routePass ? "ok" : "fail"}, intent=${score.intentPass ? "ok" : "fail"}, clarify=${score.clarifyPass ? "ok" : "fail"}.`,
    };
  }

  if (response.intent?.primary_intent === "out_of_domain_request" && response.route === "validation") {
    return {
      tone: "ok",
      label: "Reset topic",
      detail: "Turn ngoài phạm vi đã bị chặn sớm thay vì rơi vào fallback tốn token.",
    };
  }

  if (response.route === "llm_fallback") {
    return {
      tone: "bad",
      label: "Rơi fallback",
      detail: "Carry-over hoặc định tuyến chưa đủ chắc nên đã bật fallback rộng.",
    };
  }

  const continuityMode = response.conversation_state?.continuity_mode || null;
  if (turn.scriptedIndex === 0 && continuityMode === "new_topic") {
    return {
      tone: "ok",
      label: "Anchor tốt",
      detail: "Turn đầu đã mở topic rõ ràng để các turn sau bám tiếp.",
    };
  }

  if (continuityMode === "follow_up_patch") {
    const patchedFields = response.conversation_state?.patched_fields?.join(", ") || "ngữ cảnh";
    return {
      tone: "ok",
      label: "Patch đúng",
      detail: `Runtime giữ topic và chỉ vá ${patchedFields}.`,
    };
  }

  if (continuityMode === "continued_topic") {
    return {
      tone: "ok",
      label: "Giữ topic",
      detail: "Turn này vẫn bám đúng chủ đề đang mở trong session.",
    };
  }

  if (continuityMode === "topic_reset") {
    return {
      tone: "ok",
      label: "Topic mới",
      detail: "Turn này đã tách khỏi chủ đề cũ một cách có kiểm soát.",
    };
  }

  if (continuityMode === "new_topic") {
    return {
      tone: "neutral",
      label: "Topic mới",
      detail: "Turn này đang mở một chủ đề mới, không phải follow-up của topic trước.",
    };
  }

  return {
    tone: "neutral",
    label: "Cần soi",
    detail: "Turn đã chạy nhưng chưa có tín hiệu continuity đủ rõ để chấm tự động.",
  };
}

function Badge({ tone, label }: { tone: "ok" | "bad" | "neutral"; label: string }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", tone === "ok" ? "bg-primary text-primary-foreground" : tone === "bad" ? "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]")}>{label}</span>;
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl border border-border bg-card p-4 shadow-sm md:p-5", className)}><div className="mb-4 flex items-center gap-2"><div className="rounded-xl bg-[hsl(var(--primary) / 0.1)] p-2 text-foreground"><FlaskConical className="h-4 w-4" /></div><h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2></div>{children}</section>;
}

export default function ChatLabView() {
  const [scenarios, setScenarios] = useState<ChatLabScenario[]>(CHAT_LAB_FALLBACK_SCENARIOS);
  const [selectedScenarioId, setSelectedScenarioId] = useState(CHAT_LAB_FALLBACK_SCENARIOS[0]?.id || "");
  const [currentResult, setCurrentResult] = useState<RunResult | null>(null);
  const [batchResults, setBatchResults] = useState<RunResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [useIntentClassifier, setUseIntentClassifier] = useState(true);
  const [useSkillFormatter, setUseSkillFormatter] = useState(true);
  const [isRunningSession, setIsRunningSession] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<LabTab>("overview");
  const [manualReviews, setManualReviews] = useState<Record<string, ManualReviewDecision>>({});
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(() => createChatLabSessionId());
  const [sessionMessages, setSessionMessages] = useState<AgentMessage[]>([]);
  const [sessionTurns, setSessionTurns] = useState<SessionTurnRecord[]>([]);
  const [sessionCursor, setSessionCursor] = useState(0);
  const [sessionDraft, setSessionDraft] = useState("");
  const [sessionFeedback, setSessionFeedback] = useState<string | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    try {
      const storedCurrent = localStorage.getItem(STORAGE_KEYS.currentResult);
      const storedBatch = localStorage.getItem(STORAGE_KEYS.batchResults);
      const storedManualReviews = localStorage.getItem(STORAGE_KEYS.manualReviews);
      if (storedCurrent) {
        setCurrentResult(JSON.parse(storedCurrent));
      }
      if (storedBatch) {
        setBatchResults(JSON.parse(storedBatch));
      }
      if (storedManualReviews) {
        setManualReviews(JSON.parse(storedManualReviews));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEYS.currentResult);
      localStorage.removeItem(STORAGE_KEYS.batchResults);
      localStorage.removeItem(STORAGE_KEYS.manualReviews);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payload = await fetchChatLabScenarios();
        if (!alive || payload.length === 0) return;
        startTransition(() => {
          setScenarios(payload);
          setSelectedScenarioId((current) => current || payload[0].id);
          setScenariosError(null);
        });
      } catch (error) {
        if (alive) setScenariosError(error instanceof Error ? error.message : "Không thể tải test case từ eval-50.");
      } finally {
        if (alive) setIsLoadingScenarios(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (currentResult) {
      localStorage.setItem(STORAGE_KEYS.currentResult, JSON.stringify(currentResult));
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.currentResult);
  }, [currentResult]);

  useEffect(() => {
    if (batchResults.length > 0) {
      localStorage.setItem(STORAGE_KEYS.batchResults, JSON.stringify(batchResults));
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.batchResults);
  }, [batchResults]);

  useEffect(() => {
    if (Object.keys(manualReviews).length > 0) {
      localStorage.setItem(STORAGE_KEYS.manualReviews, JSON.stringify(manualReviews));
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.manualReviews);
  }, [manualReviews]);

  const groups = useMemo(() => ["all", ...Array.from(new Set(scenarios.map((scenario) => scenario.group))).sort()], [scenarios]);

  const filteredScenarios = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();
    return scenarios.filter((scenario) => {
      const matchesGroup = selectedGroup === "all" || scenario.group === selectedGroup;
      const haystack = [scenario.id, scenario.title, scenario.expectedIntent, scenario.expectedRoute, scenario.expectedSkillId || "", scenario.notes || "", ...(scenario.reviewFocus || []), ...scenario.messages.map((message) => message.content)].join(" ").toLowerCase();
      return matchesGroup && (keyword.length === 0 || haystack.includes(keyword));
    });
  }, [deferredSearchTerm, scenarios, selectedGroup]);

  useEffect(() => {
    if (filteredScenarios.length > 0 && !filteredScenarios.some((scenario) => scenario.id === selectedScenarioId)) setSelectedScenarioId(filteredScenarios[0].id);
  }, [filteredScenarios, selectedScenarioId]);

  const selectedScenario = useMemo(() => filteredScenarios.find((scenario) => scenario.id === selectedScenarioId) || scenarios.find((scenario) => scenario.id === selectedScenarioId) || filteredScenarios[0] || scenarios[0] || null, [filteredScenarios, scenarios, selectedScenarioId]);
  const scriptedTurns = useMemo(() => buildScriptedTurns(selectedScenario), [selectedScenario]);
  useEffect(() => {
    setSessionId(createChatLabSessionId());
    setSessionMessages([]);
    setSessionTurns([]);
    setSessionCursor(0);
    setSessionDraft("");
    setSessionFeedback(null);
  }, [selectedScenarioId]);
  const selectedManualReview = useMemo(() => selectedScenario ? manualReviews[selectedScenario.id] || null : null, [manualReviews, selectedScenario]);
  const currentScore = useMemo(() => selectedScenario && currentResult?.response ? getScoreSummary(selectedScenario, currentResult.response, selectedManualReview) : null, [currentResult, selectedManualReview, selectedScenario]);
  const selectedResponse = currentResult?.response || null;
  const batchSummary = useMemo(() => {
    let passed = 0;
    let pendingManual = 0;
    for (const result of batchResults) {
      const scenario = scenarios.find((item) => item.id === result.scenarioId);
      const score = scenario ? getScoreSummary(scenario, result.response, manualReviews[result.scenarioId]) : null;
      if (score?.pass) {
        passed += 1;
      }
      if (score?.requiresManualReview && score.manualStatus === "pending") {
        pendingManual += 1;
      }
    }
    return { total: batchResults.length, passed, pendingManual };
  }, [batchResults, manualReviews, scenarios]);
  const sessionTokenTotal = useMemo(() => sessionTurns.reduce((sum, turn) => sum + Number(turn.response?.usage?.total_tokens || 0), 0), [sessionTurns]);
  const finalScriptedTurn = useMemo(() => [...sessionTurns].reverse().find((turn) => turn.scriptedIndex === scriptedTurns.length - 1) || null, [sessionTurns, scriptedTurns.length]);
  const latestConversationState = useMemo(() => sessionTurns.length > 0 ? sessionTurns[sessionTurns.length - 1].response?.conversation_state || null : null, [sessionTurns]);
  const canExportConversation = activeTab === "conversation" && sessionTurns.length > 0;
  const canExportResults = batchResults.length > 0 || Boolean(currentResult);
  const canExportCsv = canExportConversation || canExportResults;

  const upsertManualReview = (scenarioId: string, status: ManualReviewStatus, reason: string) => {
    setManualReviews((current) => ({
      ...current,
      [scenarioId]: {
        status,
        reason,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const clearManualReview = (scenarioId: string) => {
    setManualReviews((current) => {
      const next = { ...current };
      delete next[scenarioId];
      return next;
    });
  };

  const getManualReviewButtonClass = (variant: "pass" | "fail" | "clear", active: boolean) => cn(
    "rounded-2xl px-4 py-2 text-sm font-bold transition-colors",
    variant === "pass" && (active
      ? "bg-card text-card-foreground text-primary"
      : "border border-border bg-card text-foreground hover:bg-[hsl(var(--card))]"),
    variant === "fail" && (active
      ? "border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive-foreground))] "
      : "border border-border bg-card text-foreground hover:bg-[hsl(var(--destructive) / 0.1)]"),
    variant === "clear" && (active
      ? "border border-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted-foreground))] "
      : "border border-border bg-card text-foreground hover:bg-gray-100")
  );

  const focusScenario = (scenarioId: string, options?: { preserveFilters?: boolean }) => {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;
    startTransition(() => {
      if (!options?.preserveFilters) {
        setSelectedGroup(scenario.group);
        setSearchTerm("");
      }
      setSelectedScenarioId(scenarioId);
      setActiveTab("overview");
    });
  };

  const resetConversationSession = (message?: string) => {
    setSessionId(createChatLabSessionId());
    setSessionMessages([]);
    setSessionTurns([]);
    setSessionCursor(0);
    setSessionDraft("");
    setSessionFeedback(message || null);
  };

  const seedConversationFromScenarioTranscript = () => {
    if (!selectedScenario) return;
    setSessionId(createChatLabSessionId());
    setSessionMessages(selectedScenario.messages.map((message) => ({ role: message.role, content: message.content })));
    setSessionTurns([]);
    setSessionCursor(scriptedTurns.length);
    setSessionDraft("");
    setSessionFeedback("Đã nạp transcript gốc. Bạn có thể hỏi tiếp trong cùng session để stress-test carry-over.");
    setActiveTab("conversation");
  };

  const executeConversationTurn = async ({
    baseMessages,
    userMessage,
    scriptedIndex,
    referenceAssistant,
  }: {
    baseMessages: AgentMessage[];
    userMessage: string;
    scriptedIndex: number | null;
    referenceAssistant: string | null;
  }) => {
    const startedAt = new Date().toISOString();
    const requestMessages: AgentMessage[] = [...baseMessages, { role: "user", content: userMessage }];
    try {
      const response = await sendAgentMessage({
        messages: requestMessages,
        viewId: selectedScenario?.viewId || "dashboard",
        selectedFilters: selectedScenario?.selectedFilters ?? null,
        sessionId,
        debug: true,
        useIntentClassifier,
        useSkillFormatter,
      });
      const nextMessages: AgentMessage[] = [...requestMessages, { role: "assistant", content: response.reply || "", usage: response.usage }];
      return {
        nextMessages,
        turnRecord: {
          id: `${sessionId}-${startedAt}`,
          scriptedIndex,
          userMessage,
          referenceAssistant,
          response,
          error: null,
          startedAt,
        } satisfies SessionTurnRecord,
      };
    } catch (error) {
      return {
        nextMessages: requestMessages,
        turnRecord: {
          id: `${sessionId}-${startedAt}`,
          scriptedIndex,
          userMessage,
          referenceAssistant,
          response: null,
          error: error instanceof Error ? error.message : "Unknown chat lab error.",
          startedAt,
        } satisfies SessionTurnRecord,
      };
    }
  };

  const runNextScriptedTurn = async () => {
    if (!selectedScenario || sessionCursor >= scriptedTurns.length || isRunningSession) return;
    setIsRunningSession(true);
    setSessionFeedback(null);
    const nextTurn = scriptedTurns[sessionCursor];
    const { nextMessages, turnRecord } = await executeConversationTurn({
      baseMessages: sessionMessages,
      userMessage: nextTurn.userMessage,
      scriptedIndex: nextTurn.index,
      referenceAssistant: nextTurn.referenceAssistant,
    });
    startTransition(() => {
      setSessionMessages(nextMessages);
      setSessionTurns((current) => [...current, turnRecord]);
      setSessionCursor((current) => current + 1);
      setActiveTab("conversation");
    });
    setSessionFeedback(nextTurn.isFinal ? "Đã chạy xong turn cuối của testcase trong cùng session." : `Đã chạy turn ${nextTurn.index + 1}/${scriptedTurns.length}.`);
    setIsRunningSession(false);
  };

  const runAllScriptedTurns = async () => {
    if (!selectedScenario || sessionCursor >= scriptedTurns.length || isRunningSession) return;
    setIsRunningSession(true);
    setSessionFeedback("Đang replay testcase theo từng turn trong cùng session...");
    let workingMessages = [...sessionMessages];
    const nextTurnRecords = [...sessionTurns];
    let cursor = sessionCursor;
    while (cursor < scriptedTurns.length) {
      const turn = scriptedTurns[cursor];
      const { nextMessages, turnRecord } = await executeConversationTurn({
        baseMessages: workingMessages,
        userMessage: turn.userMessage,
        scriptedIndex: turn.index,
        referenceAssistant: turn.referenceAssistant,
      });
      workingMessages = nextMessages;
      nextTurnRecords.push(turnRecord);
      cursor += 1;
    }
    startTransition(() => {
      setSessionMessages(workingMessages);
      setSessionTurns(nextTurnRecords);
      setSessionCursor(cursor);
      setActiveTab("conversation");
    });
    setSessionFeedback(`Đã replay ${scriptedTurns.length} user turn trong cùng session.`);
    setIsRunningSession(false);
  };

  const sendCustomConversationTurn = async () => {
    const trimmedDraft = sessionDraft.trim();
    if (!trimmedDraft || isRunningSession) return;
    setIsRunningSession(true);
    setSessionFeedback(null);
    const { nextMessages, turnRecord } = await executeConversationTurn({
      baseMessages: sessionMessages,
      userMessage: trimmedDraft,
      scriptedIndex: null,
      referenceAssistant: null,
    });
    startTransition(() => {
      setSessionMessages(nextMessages);
      setSessionTurns((current) => [...current, turnRecord]);
      setSessionDraft("");
      setActiveTab("conversation");
    });
    setSessionFeedback("Đã gửi thêm một turn vào cùng session để stress-test.");
    setIsRunningSession(false);
  };

  const exportResultsToCsv = async () => {
    let rows: Array<Record<string, unknown>> = [];
    let filename = "";

    if (canExportConversation && selectedScenario) {
      rows = sessionTurns.map((turn, index) => {
        const response = turn.response;
        const turnAssessment = getConversationTurnAssessment({
          turn,
          scenario: selectedScenario,
          scriptedTurnCount: scriptedTurns.length,
          manualDecision: manualReviews[selectedScenario.id] || null,
        });
        const isFinalScriptedTurn = turn.scriptedIndex !== null && turn.scriptedIndex === scriptedTurns.length - 1;
        const finalScore = isFinalScriptedTurn && response
          ? getScoreSummary(selectedScenario, response, manualReviews[selectedScenario.id] || null)
          : null;

        return {
          export_scope: "conversation",
          session_id: sessionId,
          scenario_id: selectedScenario.id,
          title: selectedScenario.title,
          group: selectedScenario.group,
          view_id: selectedScenario.viewId,
          turn_number: index + 1,
          turn_type: turn.scriptedIndex === null ? "custom" : "scripted",
          scripted_index: turn.scriptedIndex === null ? "" : turn.scriptedIndex + 1,
          is_final_scripted_turn: String(Boolean(isFinalScriptedTurn)),
          expected_route: isFinalScriptedTurn ? selectedScenario.expectedRoute : "",
          expected_skill_id: isFinalScriptedTurn ? selectedScenario.expectedSkillId || "" : "",
          expected_intent: isFinalScriptedTurn ? selectedScenario.expectedIntent : "",
          expected_clarify: isFinalScriptedTurn && selectedScenario.expectedClarify !== undefined ? String(selectedScenario.expectedClarify) : "",
          user_message: turn.userMessage,
          reference_assistant: turn.referenceAssistant || "",
          actual_reply: turn.error || response?.reply || "",
          actual_route: response?.route || "",
          actual_skill_id: response?.skill_id || "",
          actual_intent: response?.intent?.primary_intent || "",
          actual_intent_source: response?.intent_source || "",
          actual_intent_confidence: response?.intent_confidence ?? response?.confidence ?? "",
          actual_formatter_source: response?.formatter_source || "",
          fallback_reason: response?.fallback_reason || "",
          clarification_question: response?.clarification_question || "",
          turn_health: turnAssessment.label,
          turn_health_detail: turnAssessment.detail,
          conversation_topic_id: response?.conversation_state?.active_topic_id || "",
          conversation_label: response?.conversation_state?.label || "",
          conversation_continuity_mode: response?.conversation_state?.continuity_mode || "",
          conversation_focuses: serializeConversationFocuses(response),
          conversation_entities: serializeConversationEntities(response),
          conversation_time_reference: response?.conversation_state?.time_reference || "",
          conversation_patched_fields: serializeConversationPatchedFields(response),
          conversation_user_turn_count: response?.conversation_state?.user_turn_count ?? "",
          conversation_anchor_question: response?.conversation_state?.anchor_question || "",
          conversation_anchor_intent: response?.conversation_state?.anchor_intent || "",
          conversation_state_confidence: response?.conversation_state?.state_confidence ?? "",
          route_pass: finalScore ? String(finalScore.routePass) : "",
          intent_pass: finalScore ? String(finalScore.intentPass) : "",
          clarify_pass: finalScore ? String(finalScore.clarifyPass) : "",
          auto_pass: finalScore ? String(finalScore.autoPass) : "",
          manual_review_required: isFinalScriptedTurn ? String(Boolean(selectedScenario.manualReview)) : "",
          manual_review_available: isFinalScriptedTurn ? "true" : "",
          manual_review_status: finalScore?.manualStatus || "",
          manual_review_reason: isFinalScriptedTurn ? manualReviews[selectedScenario.id]?.reason || "" : "",
          manual_review_updated_at: isFinalScriptedTurn ? manualReviews[selectedScenario.id]?.updatedAt || "" : "",
          pass: finalScore ? String(finalScore.pass) : "",
          latency_ms: response?.latency_ms ?? "",
          total_tokens: response?.usage?.total_tokens ?? "",
          started_at: turn.startedAt,
          error: turn.error || "",
        };
      });
      filename = `chat-lab-conversation-${selectedScenario.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    } else {
      const resultsToExport = batchResults.length > 0 ? batchResults : currentResult ? [currentResult] : [];
      rows = resultsToExport
        .map((result) => {
          const scenario = scenarios.find((item) => item.id === result.scenarioId);
          if (!scenario) return null;
          const manualReview = manualReviews[result.scenarioId] || null;
          const score = getScoreSummary(scenario, result.response, manualReview);
          const response = result.response;
          return {
            export_scope: batchResults.length > 0 ? "batch" : "single",
            scenario_id: scenario.id,
            title: scenario.title,
            group: scenario.group,
            view_id: scenario.viewId,
            expected_route: scenario.expectedRoute,
            expected_skill_id: scenario.expectedSkillId || "",
            expected_intent: scenario.expectedIntent,
            expected_clarify: scenario.expectedClarify === undefined ? "" : String(scenario.expectedClarify),
            actual_route: response?.route || "",
            actual_skill_id: response?.skill_id || "",
            actual_intent: response?.intent?.primary_intent || "",
            actual_intent_source: response?.intent_source || "",
            actual_intent_confidence: response?.intent_confidence ?? response?.confidence ?? "",
            actual_formatter_source: response?.formatter_source || "",
            fallback_reason: response?.fallback_reason || "",
            clarification_question: response?.clarification_question || "",
            conversation_topic_id: response?.conversation_state?.active_topic_id || "",
            conversation_label: response?.conversation_state?.label || "",
            conversation_continuity_mode: response?.conversation_state?.continuity_mode || "",
            conversation_focuses: serializeConversationFocuses(response),
            conversation_entities: serializeConversationEntities(response),
            conversation_time_reference: response?.conversation_state?.time_reference || "",
            conversation_patched_fields: serializeConversationPatchedFields(response),
            conversation_user_turn_count: response?.conversation_state?.user_turn_count ?? "",
            conversation_anchor_question: response?.conversation_state?.anchor_question || "",
            conversation_anchor_intent: response?.conversation_state?.anchor_intent || "",
            conversation_state_confidence: response?.conversation_state?.state_confidence ?? "",
            route_pass: String(score.routePass),
            intent_pass: String(score.intentPass),
            clarify_pass: String(score.clarifyPass),
            auto_pass: String(score.autoPass),
            manual_review_required: String(Boolean(scenario.manualReview)),
            manual_review_available: "true",
            manual_review_status: score.manualStatus || "",
            manual_review_reason: manualReview?.reason || "",
            manual_review_updated_at: manualReview?.updatedAt || "",
            pass: String(score.pass),
            latency_ms: response?.latency_ms ?? "",
            total_tokens: response?.usage?.total_tokens ?? "",
            started_at: result.startedAt,
            error: result.error || "",
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;
      const exportStamp = new Date().toISOString().replace(/[:.]/g, "-");
      const scope = batchResults.length > 0 ? "batch" : "single";
      filename = `chat-lab-results-${scope}-${exportStamp}.csv`;
    }

    if (rows.length === 0) return;
    setExportFeedback(`Đang lưu CSV vào ${CHAT_LAB_ARTIFACT_DIR}...`);
    try {
      const result = await exportChatLabCsvArtifact({
        filename,
        rows,
      });
      setExportFeedback(`Đã lưu ${result.row_count} dòng vào ${result.relative_path}`);
    } catch (error) {
      setExportFeedback(error instanceof Error ? error.message : "Không thể lưu CSV Chat Lab.");
    }
  };

  const runScenario = async (scenario: ChatLabScenario) => {
    const startedAt = new Date().toISOString();
    try {
      const response = await sendAgentMessage({ messages: scenario.messages, viewId: scenario.viewId, selectedFilters: scenario.selectedFilters ?? null, debug: true, useIntentClassifier, useSkillFormatter });
      return { scenarioId: scenario.id, response, error: null, startedAt };
    } catch (error) {
      return { scenarioId: scenario.id, response: null, error: error instanceof Error ? error.message : "Unknown chat lab error.", startedAt };
    }
  };

  const handleRunSingle = async () => {
    if (!selectedScenario || isRunning) return;
    setIsRunning(true);
    const result = await runScenario(selectedScenario);
    startTransition(() => {
      setCurrentResult(result);
      setBatchResults((current) => [result, ...current.filter((item) => item.scenarioId !== result.scenarioId)]);
      setActiveTab("overview");
    });
    setIsRunning(false);
  };

  const handleRunBatch = async () => {
    if (isRunning || filteredScenarios.length === 0) return;
    setIsRunning(true);
    const nextResults = [...batchResults];
    for (const scenario of filteredScenarios) {
      const result = await runScenario(scenario);
      const existingIndex = nextResults.findIndex((item) => item.scenarioId === result.scenarioId);
      if (existingIndex >= 0) {
        nextResults.splice(existingIndex, 1, result);
      } else {
        nextResults.push(result);
      }
      if (scenario.id === selectedScenario?.id) startTransition(() => setCurrentResult(result));
    }
    startTransition(() => { setBatchResults(nextResults); setActiveTab("overview"); });
    setIsRunning(false);
  };
  const statusCards = (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-2xl border border-border bg-[hsl(var(--card))] px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Số case</div><div className="mt-1 text-base font-black text-foreground">{scenarios.length}</div></div>
      <div className="rounded-2xl border border-border bg-[hsl(var(--card))] px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Đang lọc</div><div className="mt-1 text-base font-black text-foreground">{filteredScenarios.length}</div></div>
      <div className="rounded-2xl border border-border bg-[hsl(var(--card))] px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">KQ batch</div><div className="mt-1 text-base font-black text-foreground">{batchResults.length}</div></div>
    </div>
  );

  const batchResultsPanel = batchResults.length > 0 ? (
    <Panel title="Batch Đã Chạy" className="h-fit">
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-[hsl(var(--card))] px-3.5 py-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tập chạy</div><div className="mt-1.5 text-sm font-bold text-foreground">{filteredScenarios.length} test case</div></div>
        <div className="rounded-2xl bg-[hsl(var(--card))] px-3.5 py-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Đạt hoàn chỉnh</div><div className="mt-1.5 text-sm font-bold text-foreground">{batchSummary.passed}/{batchSummary.total}</div></div>
        <div className="rounded-2xl bg-[hsl(var(--card))] px-3.5 py-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Chờ review tay</div><div className="mt-1.5 text-sm font-bold text-foreground">{batchSummary.pendingManual}</div></div>
      </div>
      <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
        {batchResults.map((result) => {
          const scenario = scenarios.find((item) => item.id === result.scenarioId);
          if (!scenario) return null;
          const score = getScoreSummary(scenario, result.response, manualReviews[result.scenarioId]);
          const isActive = selectedScenarioId === result.scenarioId || currentResult?.scenarioId === result.scenarioId;
          return (
            <button key={result.scenarioId} type="button" onClick={() => { setCurrentResult(result); focusScenario(result.scenarioId); }} className={cn("w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200", isActive ? "border-primary/45 bg-[hsl(var(--card))] shadow-[inset_3px_0_0_0_hsl(var(--primary)),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-primary/10" : "border-border bg-[hsl(var(--card))] hover:border-[hsl(var(--primary) / 0.18)] hover:bg-[hsl(var(--primary) / 0.05)]")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-foreground">{scenario.id + " · " + scenario.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">luồng={result.response?.route || "error"} ý định={result.response?.intent?.primary_intent || "-"}</div>
                </div>
                <Badge tone={score.pass ? "ok" : score.requiresManualReview && score.manualStatus === "pending" && score.autoPass ? "neutral" : "bad"} label={score.requiresManualReview ? score.manualStatus === "pass" ? "Đạt sau review" : score.manualStatus === "fail" ? "Trượt sau review" : "Chờ review" : score.manualStatus === "pass" ? "Đạt có review" : score.manualStatus === "fail" ? "Trượt do review" : score.pass ? "Đạt tự động" : "Trượt"} />
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  ) : null;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.25rem] border border-[hsl(var(--primary) / 0.2)] bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary) / 0.1),_hsl(var(--background))_60%)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-[hsl(var(--primary) / 0.3)] bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Chat Lab</div>
            <h1 className="max-w-3xl text-[1.65rem] font-black leading-tight tracking-tight text-foreground lg:text-[1.9rem]">Chat Lab</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">Màn này dùng để soi từng bước classifier, router, skill, SQL log và câu trả lời cuối thay vì chỉ nhìn đáp án.</p>
            <p className="mt-1 max-w-2xl text-[12px] leading-6 text-muted-foreground">CSV export được lưu vào <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{CHAT_LAB_ARTIFACT_DIR}</code> để tiếp tục review và handoff.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={handleRunSingle} disabled={isRunning || !selectedScenario} className="inline-flex items-center gap-2 rounded-2xl bg-card text-card-foreground px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-muted-foreground"><Play className="h-4 w-4" />Chạy test case</button>
            <button type="button" onClick={handleRunBatch} disabled={isRunning} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"><Rows4 className="h-4 w-4" />Chạy batch</button>
            <button type="button" onClick={exportResultsToCsv} disabled={isRunning || isRunningSession || !canExportCsv} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">{canExportConversation ? "Xuất CSV hội thoại" : "Xuất CSV"}</button>
          </div>
        </div>
        {exportFeedback ? <div className="mt-3 rounded-2xl border border-[hsl(var(--primary) / 0.2)] bg-muted px-4 py-3 text-sm text-foreground">{exportFeedback}</div> : null}

      </section>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Bảng Điều Khiển" className="h-fit xl:sticky xl:top-5">
          <div className="space-y-3">
            {statusCards}
            {selectedScenario ? (<div className="overflow-hidden rounded-2xl border border-dashed border-border bg-[#FCFCFE] p-3.5">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tóm tắt case</p>
                  <div className="rounded-full bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {selectedScenario.id}
                  </div>
                </div>
                <p className="text-[15px] font-bold leading-6 text-foreground">{selectedScenario.title}</p>
                <p className="text-sm text-muted-foreground">Nhóm {selectedScenario.group} · View: {selectedScenario.viewId}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"><span className="rounded-full bg-card px-2.5 py-1">Luồng {selectedScenario.expectedRoute}</span><span className="rounded-full bg-card px-2.5 py-1">Ý định {selectedScenario.expectedIntent}</span>{selectedScenario.expectedSkillId ? <span className="rounded-full bg-card px-2.5 py-1">Skill {selectedScenario.expectedSkillId}</span> : null}{selectedScenario.manualReview ? <span className="rounded-full bg-card px-2.5 py-1">Cần xem tay</span> : null}</div>{selectedScenario.notes ? <div className="mt-3 max-h-28 overflow-y-auto rounded-2xl bg-card px-3 py-2.5 text-sm leading-6 text-foreground whitespace-pre-wrap">{selectedScenario.notes}</div> : null}<div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">{selectedScenario.messages.slice(0, 3).map((message, index) => (<div key={message.role + "-" + index} className="rounded-2xl border border-border bg-card px-3 py-2.5"><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{message.role === "user" ? "Người dùng" : "Trợ lý"}</div><div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">{message.content || "(trống)"}</div></div>))}</div>{selectedScenario.messages.length > 3 ? <div className="mt-2 text-[11px] text-muted-foreground">Hiển thị 3 message đầu để panel gọn hơn. Toàn bộ transcript vẫn xem ở phần chi tiết.</div> : null}</div>) : null}
            <label className="block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tìm test case</span><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="tc01, seller, follow-up..." className="w-full rounded-2xl border border-border bg-[hsl(var(--card))] py-2.5 pl-10 pr-3.5 text-sm font-medium outline-none transition-colors focus:border-primary" /></div></label>
            <label className="block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nhóm / Bảng</span><select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} className="w-full rounded-2xl border border-border bg-[hsl(var(--card))] px-3.5 py-2.5 text-sm font-medium outline-none transition-colors focus:border-primary">{groups.map((group) => (<option key={group} value={group}>{group === "all" ? "Tất cả nhóm" : "Nhóm " + group}</option>))}</select></label>
            <label className="block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Test case</span><select value={selectedScenarioId} onChange={(event) => focusScenario(event.target.value, { preserveFilters: true })} className="w-full rounded-2xl border border-border bg-[hsl(var(--card))] px-3.5 py-2.5 text-sm font-medium outline-none transition-colors focus:border-primary">{filteredScenarios.map((scenario) => (<option key={scenario.id} value={scenario.id}>{scenario.id + " · " + scenario.title}</option>))}</select></label>
            <div className="grid gap-2"><label className="flex items-center justify-between rounded-2xl border border-border bg-[hsl(var(--card))] px-3.5 py-2.5 text-sm font-medium"><span>Bật intent classifier</span><input type="checkbox" checked={useIntentClassifier} onChange={(event) => setUseIntentClassifier(event.target.checked)} /></label><label className="flex items-center justify-between rounded-2xl border border-border bg-[hsl(var(--card))] px-3.5 py-2.5 text-sm font-medium"><span>Bật skill formatter</span><input type="checkbox" checked={useSkillFormatter} onChange={(event) => setUseSkillFormatter(event.target.checked)} /></label></div>
            {scenariosError ? (<div className="rounded-2xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive) / 0.1)] p-3 text-sm leading-6 text-[hsl(var(--destructive-foreground))]">Đang dùng fallback scenarios. Chi tiết: {scenariosError}</div>) : null}
          </div>
        </Panel>

        <div className="space-y-4">
          <div className="sticky top-5 z-10 rounded-3xl border border-border bg-muted p-3 shadow-sm backdrop-blur"><div className="flex flex-wrap gap-2">{[{ id: "overview", label: "Tổng quan", icon: <SplitSquareHorizontal className="h-4 w-4" /> }, { id: "reasoning", label: "Suy luận", icon: <FlaskConical className="h-4 w-4" /> }, { id: "sql", label: "SQL", icon: <FlaskConical className="h-4 w-4" /> }, { id: "conversation", label: "Conversation", icon: <Bot className="h-4 w-4" /> }].map((tab) => (<button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as LabTab)} className={cn("inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors", activeTab === tab.id ? "bg-card text-card-foreground text-primary" : "bg-[hsl(var(--muted) / 0.5)] text-foreground hover:bg-[hsl(var(--muted))]")}>{tab.icon}{tab.label}</button>))}</div></div>
          {activeTab === "overview" ? (<div className="grid gap-3 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]"><Panel title="Tóm Tắt Điểm" className="h-fit">{selectedScenario && currentResult ? (<div className="space-y-2.5"><div className="flex flex-wrap gap-2"><Badge tone={currentScore?.pass ? "ok" : currentScore?.requiresManualReview && currentScore?.manualStatus === "pending" && currentScore?.autoPass ? "neutral" : "bad"} label={currentScore?.requiresManualReview ? currentScore?.manualStatus === "pass" ? "Đạt sau review" : currentScore?.manualStatus === "fail" ? "Trượt sau review" : "Chờ review tay" : currentScore?.manualStatus === "pass" ? "Đạt có review" : currentScore?.manualStatus === "fail" ? "Trượt do review" : currentScore?.pass ? "Đạt tự động" : "Trượt"} /><Badge tone={currentScore?.routePass ? "ok" : "bad"} label="Route" /><Badge tone={currentScore?.intentPass ? "ok" : "bad"} label="Intent" /><Badge tone={currentScore?.clarifyPass ? "ok" : "bad"} label="Clarify" /><Badge tone={currentScore?.manualStatus === "pass" ? "ok" : currentScore?.manualStatus === "fail" ? "bad" : "neutral"} label={currentScore?.manualStatus === "pass" ? "Review pass" : currentScore?.manualStatus === "fail" ? "Review fail" : currentScore?.requiresManualReview ? "Review pending" : "Review tùy chọn"} /></div><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-2xl bg-[hsl(var(--card))] p-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Kỳ vọng</div><div className="mt-1 text-sm leading-6 text-foreground">Luồng: <strong>{selectedScenario.expectedRoute}</strong><br />Ý định: <strong>{selectedScenario.expectedIntent}</strong><br />Skill: <strong>{selectedScenario.expectedSkillId || "-"}</strong></div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Thực tế</div><div className="mt-1 text-sm leading-6 text-foreground">Luồng: <strong>{selectedResponse?.route || "-"}</strong><br />Ý định: <strong>{selectedResponse?.intent?.primary_intent || "-"}</strong><br />Skill: <strong>{selectedResponse?.skill_id || "-"}</strong></div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Độ trễ</div><div className="mt-1 text-sm font-bold text-foreground">{selectedResponse?.latency_ms || 0} ms</div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Token</div><div className="mt-1 text-sm font-bold text-foreground">{selectedResponse?.usage?.total_tokens || 0}</div></div></div><div className="rounded-2xl border border-border bg-[#FCFCFE] p-3.5"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{selectedScenario.manualReview ? "Manual review bắt buộc" : "Manual review tùy chọn"}</div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => upsertManualReview(selectedScenario.id, "pass", selectedManualReview?.reason || "")} className={getManualReviewButtonClass("pass", selectedManualReview?.status === "pass")}>Đánh dấu pass</button><button type="button" onClick={() => upsertManualReview(selectedScenario.id, "fail", selectedManualReview?.reason || "")} className={getManualReviewButtonClass("fail", selectedManualReview?.status === "fail")}>Đánh dấu fail</button><button type="button" onClick={() => clearManualReview(selectedScenario.id)} className={getManualReviewButtonClass("clear", !selectedManualReview)}>Bỏ review</button></div><label className="mt-2.5 block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Lý do review tay</span><textarea value={selectedManualReview?.reason || ""} onChange={(event) => upsertManualReview(selectedScenario.id, selectedManualReview?.status || "pending", event.target.value)} placeholder="Ví dụ: route đúng nhưng reply thiếu số tổng, sai ngôn ngữ hoặc chưa grounded." className="min-h-28 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-primary" /></label>{selectedManualReview?.updatedAt ? <div className="mt-2 text-xs text-muted-foreground">Cập nhật: {selectedManualReview.updatedAt}</div> : null}</div></div>) : <p className="text-sm text-muted-foreground">Chưa có kết quả để chấm điểm.</p>}</Panel><div className="space-y-3"><Panel title="So Sánh Phản Hồi" className="h-fit">{selectedScenario && currentResult ? (<div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)]"><div className="rounded-2xl border border-border bg-[hsl(var(--card))] p-3"><div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Kỳ vọng</div><div className="text-sm leading-6 text-foreground">Luồng: <strong>{selectedScenario.expectedRoute}</strong><br />Ý định: <strong>{selectedScenario.expectedIntent}</strong></div></div><div className="rounded-2xl border border-border bg-[hsl(var(--card))] p-3"><div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Phản hồi thực tế</div><div className="max-h-[10rem] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">{currentResult.error || selectedResponse?.reply || "-"}</div></div></div>) : <p className="text-sm text-muted-foreground">Chưa có kết quả để so sánh.</p>}</Panel>{batchResultsPanel}</div></div>) : null}

          {activeTab === "reasoning" ? (<div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><Panel title="Ảnh Chụp Suy Luận">{selectedResponse ? (<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[hsl(var(--card))] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nguồn intent</div><div className="mt-2 text-sm font-bold text-foreground">{selectedResponse.intent_source || "-"}</div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nguồn formatter</div><div className="mt-2 text-sm font-bold text-foreground">{selectedResponse.formatter_source || "-"}</div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Độ tin cậy</div><div className="mt-2 text-sm font-bold text-foreground">{selectedResponse.intent_confidence ?? selectedResponse.confidence ?? "-"}</div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Lý do fallback</div><div className="mt-2 text-sm font-bold text-foreground">{selectedResponse.fallback_reason || "-"}</div></div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-4 text-sm leading-6 text-foreground"><div>Trace: <strong>{selectedResponse.trace_id || "-"}</strong></div><div className="mt-2">Clarify: <strong>{selectedResponse.clarification_question || "-"}</strong></div><div className="mt-2">Candidates: <strong>{selectedResponse.matched_skill_candidates?.join(", ") || "-"}</strong></div></div><pre className="max-h-[28rem] overflow-auto rounded-2xl bg-[#101114] p-4 text-[11px] text-[#D8FBC1]">{prettyJson(selectedResponse.intent)}</pre></div>) : <p className="text-sm text-muted-foreground">Chưa có ảnh chụp để xem.</p>}</Panel><Panel title="Dòng Thời Gian Thực Thi">{selectedResponse?.execution_timeline?.length ? (<div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">{selectedResponse.execution_timeline.map((item, index) => (<div key={item.step + "-" + index} className="rounded-2xl border border-border bg-[hsl(var(--card))] p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-bold capitalize text-foreground">{item.step.replaceAll("_", " ")}</div><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{item.at}</div></div><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{prettyJson(item)}</pre></div>))}</div>) : <p className="text-sm text-muted-foreground">Không có dòng thời gian thực thi.</p>}</Panel></div>) : null}

          {activeTab === "sql" ? (<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><Panel title="Trình xem SQL">{selectedResponse?.sql_logs?.length ? (<div className="max-h-[36rem] space-y-4 overflow-y-auto pr-1">{selectedResponse.sql_logs.map((log, index) => (<div key={log.name + "-" + index} className="rounded-2xl border border-border bg-[hsl(var(--card))] p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-card text-card-foreground px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">{log.name}</span><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">rows={log.row_count} limit={log.row_limit}</span></div>{log.error ? <div className="mt-3 rounded-xl bg-[hsl(var(--destructive) / 0.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive-foreground))]">{log.error}</div> : null}<pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-card p-4 text-[11px] text-foreground">{log.sql}</pre></div>))}</div>) : <p className="text-sm text-muted-foreground">Không có SQL logs cho test case này.</p>}</Panel><Panel title="Bản Đồ Test">{selectedScenario ? (<div className="space-y-4"><div className="rounded-2xl bg-[hsl(var(--card))] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tự động hóa</div><div className="mt-2 space-y-2 text-sm leading-6 text-foreground"><div>Route suite: <strong>{selectedScenario.routeSuite || "-"}</strong></div><div>Intent suite: <strong>{selectedScenario.intentSuite || "-"}</strong></div><div>Clarify suite: <strong>{selectedScenario.clarifySuite || "-"}</strong></div><div>Manual review: <strong>{String(Boolean(selectedScenario.manualReview))}</strong></div></div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Trọng tâm review</div><div className="mt-3 flex flex-wrap gap-2">{(selectedScenario.reviewFocus || []).length ? selectedScenario.reviewFocus?.map((focus) => (<span key={focus} className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{focus}</span>)) : <span className="text-sm text-muted-foreground">Không có.</span>}</div></div><div className="rounded-2xl bg-[hsl(var(--card))] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Ghi chú</div><div className="mt-2 text-sm leading-6 text-foreground">{selectedScenario.notes || "-"}</div></div></div>) : <p className="text-sm text-muted-foreground">Chưa có scenario nào được chọn.</p>}</Panel></div>) : null}

          {activeTab === "conversation" ? (
            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Panel title="Conversation Stress">
                <div className="space-y-4">
                  <div className="rounded-2xl bg-[hsl(var(--card))] p-4 text-sm leading-6 text-foreground">
                    <div>Session ID: <strong>{sessionId}</strong></div>
                    <div className="mt-2">Scripted progress: <strong>{sessionCursor}/{scriptedTurns.length}</strong></div>
                    <div className="mt-2">History messages: <strong>{sessionMessages.length}</strong></div>
                    <div className="mt-2">Tổng token session: <strong>{sessionTokenTotal}</strong></div>
                  </div>
                  {finalScriptedTurn ? (
                    <div className="rounded-2xl border border-[hsl(var(--primary) / 0.2)] bg-[#F7FAEF] p-4">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Final scripted turn</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          tone={selectedScenario && finalScriptedTurn.response
                            ? getScoreSummary(selectedScenario, finalScriptedTurn.response, selectedManualReview).pass ? "ok" : "bad"
                            : "neutral"}
                          label={selectedScenario && finalScriptedTurn.response
                            ? getScoreSummary(selectedScenario, finalScriptedTurn.response, selectedManualReview).pass ? "Pass" : "Fail"
                            : "Chưa chấm"}
                        />
                        {finalScriptedTurn.response?.conversation_state?.continuity_mode ? (
                          <Badge
                            tone={getConversationModeTone(finalScriptedTurn.response.conversation_state.continuity_mode)}
                            label={formatConversationModeLabel(finalScriptedTurn.response.conversation_state.continuity_mode)}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {latestConversationState ? (
                    <div className="rounded-2xl border border-border bg-[#FCFCFE] p-4">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Topic đang mở</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={getConversationModeTone(latestConversationState.continuity_mode)} label={formatConversationModeLabel(latestConversationState.continuity_mode)} />
                        <Badge tone="neutral" label={latestConversationState.primary_intent || "unknown"} />
                      </div>
                      <div className="mt-3 space-y-1.5 text-sm leading-6 text-foreground">
                        <div><strong>Label:</strong> {latestConversationState.label || "-"}</div>
                        <div><strong>Time:</strong> {latestConversationState.time_reference || "-"}</div>
                        <div><strong>Focus:</strong> {latestConversationState.focuses?.join(", ") || "-"}</div>
                        <div><strong>Entity:</strong> {latestConversationState.entities?.map((entity) => `${entity.type}:${entity.value}`).join(", ") || "-"}</div>
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <button type="button" onClick={runNextScriptedTurn} disabled={!selectedScenario || sessionCursor >= scriptedTurns.length || isRunningSession} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-card text-card-foreground px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-muted-foreground"><Play className="h-4 w-4" />Chạy turn kế tiếp</button>
                    <button type="button" onClick={runAllScriptedTurns} disabled={!selectedScenario || sessionCursor >= scriptedTurns.length || isRunningSession} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"><Rows4 className="h-4 w-4" />Replay hết testcase theo turn</button>
                    <button type="button" onClick={seedConversationFromScenarioTranscript} disabled={!selectedScenario || isRunningSession} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">Dùng transcript gốc làm seed</button>
                    <button type="button" onClick={() => resetConversationSession("Đã reset session stress-test.")} disabled={isRunningSession} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"><TimerReset className="h-4 w-4" />Reset session</button>
                  </div>
                  <div className="rounded-2xl border border-border bg-[#FCFCFE] p-4">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Thêm turn mới vào cùng session</div>
                    <textarea value={sessionDraft} onChange={(event) => setSessionDraft(event.target.value)} placeholder="Ví dụ: Còn tháng 2 thì sao? hoặc hỏi lệch topic để test reset context." className="min-h-28 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-primary" />
                    <button type="button" onClick={sendCustomConversationTurn} disabled={isRunningSession || sessionDraft.trim().length === 0} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-card text-card-foreground px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-muted-foreground"><Send className="h-4 w-4" />Gửi thêm turn</button>
                  </div>
                  {sessionFeedback ? <div className="rounded-2xl border border-[hsl(var(--primary) / 0.2)] bg-[#F7FAEF] px-4 py-3 text-sm text-foreground">{sessionFeedback}</div> : null}
                </div>
              </Panel>
              <Panel title="Session Timeline">
                {sessionTurns.length > 0 ? (
                  <div className="max-h-[42rem] space-y-4 overflow-y-auto pr-1">
                    {sessionTurns.map((turn, index) => {
                      const turnAssessment = getConversationTurnAssessment({
                        turn,
                        scenario: selectedScenario,
                        scriptedTurnCount: scriptedTurns.length,
                        manualDecision: selectedManualReview,
                      });
                      const continuityMode = turn.response?.conversation_state?.continuity_mode || null;
                      const routeTone = turn.error
                        ? "bad"
                        : turn.response?.route === "skill"
                          ? "ok"
                          : turn.response?.route === "llm_fallback"
                            ? "bad"
                            : "neutral";

                      return (
                        <div key={turn.id} className="rounded-2xl border border-border bg-[hsl(var(--card))] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-foreground">
                                Turn {index + 1}{turn.scriptedIndex !== null ? ` · Scripted ${turn.scriptedIndex + 1}/${scriptedTurns.length}` : " · Custom"}
                              </div>
                              <div className="mt-1 text-xs leading-5 text-muted-foreground">{turnAssessment.detail}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge tone={turnAssessment.tone} label={turnAssessment.label} />
                              <Badge tone={routeTone} label={turn.response?.route || (turn.error ? "Error" : "No route")} />
                              <Badge tone="neutral" label={turn.response?.intent?.primary_intent || "unknown"} />
                              {continuityMode ? (
                                <Badge tone={getConversationModeTone(continuityMode)} label={formatConversationModeLabel(continuityMode)} />
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-2xl border border-border bg-card p-3">
                              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">User</div>
                              <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{turn.userMessage}</div>
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-3">
                              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Assistant thực tế</div>
                              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">{turn.error || turn.response?.reply || "-"}</div>
                            </div>
                          </div>

                          {turn.response?.conversation_state ? (
                            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                              <div className="rounded-2xl border border-border bg-card p-3">
                                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Conversation state</div>
                                <div className="space-y-1 text-sm leading-6 text-foreground">
                                  <div><strong>Label:</strong> {turn.response.conversation_state.label || "-"}</div>
                                  <div><strong>Time:</strong> {turn.response.conversation_state.time_reference || "-"}</div>
                                  <div><strong>Focus:</strong> {turn.response.conversation_state.focuses?.join(", ") || "-"}</div>
                                  <div><strong>Entity:</strong> {turn.response.conversation_state.entities?.map((entity) => `${entity.type}:${entity.value}`).join(", ") || "-"}</div>
                                  <div><strong>Patched:</strong> {turn.response.conversation_state.patched_fields?.join(", ") || "-"}</div>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-border bg-card p-3">
                                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Anchor</div>
                                <div className="space-y-1 text-sm leading-6 text-foreground">
                                  <div><strong>Intent:</strong> {turn.response.conversation_state.anchor_intent || "-"}</div>
                                  <div><strong>User turn count:</strong> {turn.response.conversation_state.user_turn_count ?? "-"}</div>
                                  <div className="max-h-24 overflow-y-auto whitespace-pre-wrap"><strong>Câu neo:</strong> {turn.response.conversation_state.anchor_question || "-"}</div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {turn.referenceAssistant ? (
                            <div className="mt-3 rounded-2xl border border-dashed border-border bg-card p-3">
                              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Assistant tham chiếu trong dataset</div>
                              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">{turn.referenceAssistant}</div>
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span>Latency: {turn.response?.latency_ms || 0} ms</span>
                            <span>Token: {turn.response?.usage?.total_tokens || 0}</span>
                            <span>Bắt đầu: {turn.startedAt}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Chưa có turn nào trong session hiện tại.</p>}
              </Panel>
            </div>
          ) : null}
          {activeTab !== "overview" ? batchResultsPanel : null}
        </div>
      </div>

      {isRunning ? <div className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-card text-card-foreground px-4 py-3 text-sm font-bold text-primary shadow-xl"><Bot className="h-4 w-4" />Đang chạy test case...</div> : <button type="button" onClick={() => { setCurrentResult(null); setBatchResults([]); setManualReviews({}); setExportFeedback(null); resetConversationSession(); localStorage.removeItem(STORAGE_KEYS.currentResult); localStorage.removeItem(STORAGE_KEYS.batchResults); localStorage.removeItem(STORAGE_KEYS.manualReviews); }} className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-bold text-foreground shadow-sm"><TimerReset className="h-4 w-4" />Làm mới lab</button>}
      {isRunningSession ? <div className="fixed bottom-24 right-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-bold text-foreground shadow-sm"><Bot className="h-4 w-4" />Đang chạy conversation stress-test...</div> : null}
      {isLoadingScenarios ? <div className="fixed bottom-40 right-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-bold text-foreground shadow-sm"><Bot className="h-4 w-4" />Đang tải eval-50 scenarios...</div> : null}
    </div>
  );
}

