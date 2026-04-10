import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Bot, FlaskConical, Play, Rows4, Search, SplitSquareHorizontal, TimerReset } from "lucide-react";
import { CHAT_LAB_FALLBACK_SCENARIOS, type ChatLabScenario } from "@/src/lib/chatLabScenarios";
import {
  evaluateChatLabResults,
  exportChatLabCsvArtifact,
  fetchChatLabScenarios,
  sendAgentMessage,
  type AgentChatResponse,
  type EvaluateTestResult,
} from "@/src/lib/agentApi";
import { cn } from "@/src/lib/utils";

type RunResult = { scenarioId: string; response: AgentChatResponse | null; error: string | null; startedAt: string };
type LabTab = "overview" | "reasoning" | "sql" | "batch";
type ManualReviewStatus = "pending" | "pass" | "fail";
type ManualReviewDecision = { status: ManualReviewStatus; reason: string; updatedAt: string };
type EvaluateTestMap = Record<string, EvaluateTestResult>;

const STORAGE_KEYS = {
  currentResult: "chat-lab-current-result",
  batchResults: "chat-lab-batch-results",
  manualReviews: "chat-lab-manual-reviews",
  evaluateTestEnabled: "chat-lab-evaluate-test-enabled",
  evaluateTestResults: "chat-lab-evaluate-test-results"
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

function Badge({ tone, label }: { tone: "ok" | "bad" | "neutral"; label: string }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", tone === "ok" ? "bg-[#B8FF68] text-[#1C1D21]" : tone === "bad" ? "bg-[#FFD6D6] text-[#7D1D1D]" : "bg-[#E9ECF1] text-[#4B5563]")}>{label}</span>;
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:p-5", className)}><div className="mb-4 flex items-center gap-2"><div className="rounded-xl bg-[#F2F5EA] p-2 text-[#1C1D21]"><FlaskConical className="h-4 w-4" /></div><h2 className="text-sm font-bold uppercase tracking-[0.14em] text-gray-500">{title}</h2></div>{children}</section>;
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
  const [useEvaluateTest, setUseEvaluateTest] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<LabTab>("overview");
  const [manualReviews, setManualReviews] = useState<Record<string, ManualReviewDecision>>({});
  const [evaluateTestResults, setEvaluateTestResults] = useState<EvaluateTestMap>({});
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [evaluateFeedback, setEvaluateFeedback] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    try {
      const storedCurrent = localStorage.getItem(STORAGE_KEYS.currentResult);
      const storedBatch = localStorage.getItem(STORAGE_KEYS.batchResults);
      const storedManualReviews = localStorage.getItem(STORAGE_KEYS.manualReviews);
      const storedEvaluateTestEnabled = localStorage.getItem(STORAGE_KEYS.evaluateTestEnabled);
      const storedEvaluateTestResults = localStorage.getItem(STORAGE_KEYS.evaluateTestResults);
      if (storedCurrent) {
        setCurrentResult(JSON.parse(storedCurrent));
      }
      if (storedBatch) {
        setBatchResults(JSON.parse(storedBatch));
      }
      if (storedManualReviews) {
        setManualReviews(JSON.parse(storedManualReviews));
      }
      if (storedEvaluateTestEnabled) {
        setUseEvaluateTest(storedEvaluateTestEnabled === "true");
      }
      if (storedEvaluateTestResults) {
        setEvaluateTestResults(JSON.parse(storedEvaluateTestResults));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEYS.currentResult);
      localStorage.removeItem(STORAGE_KEYS.batchResults);
      localStorage.removeItem(STORAGE_KEYS.manualReviews);
      localStorage.removeItem(STORAGE_KEYS.evaluateTestEnabled);
      localStorage.removeItem(STORAGE_KEYS.evaluateTestResults);
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.evaluateTestEnabled, String(useEvaluateTest));
  }, [useEvaluateTest]);

  useEffect(() => {
    if (Object.keys(evaluateTestResults).length > 0) {
      localStorage.setItem(STORAGE_KEYS.evaluateTestResults, JSON.stringify(evaluateTestResults));
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.evaluateTestResults);
  }, [evaluateTestResults]);

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
  const selectedManualReview = useMemo(() => selectedScenario ? manualReviews[selectedScenario.id] || null : null, [manualReviews, selectedScenario]);
  const selectedEvaluateTestResult = useMemo(() => selectedScenario ? evaluateTestResults[selectedScenario.id] || null : null, [evaluateTestResults, selectedScenario]);
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
      ? "bg-[#1C1D21] text-[#B8FF68]"
      : "border border-gray-300 bg-white text-[#1C1D21] hover:bg-[#F4F7EC]"),
    variant === "fail" && (active
      ? "border border-[#C43D3D] bg-[#7D1D1D] text-white"
      : "border border-gray-300 bg-white text-[#1C1D21] hover:bg-[#FFF0F0]"),
    variant === "clear" && (active
      ? "border border-[#4B5563] bg-[#4B5563] text-white"
      : "border border-gray-300 bg-white text-[#1C1D21] hover:bg-gray-100")
  );

  const getEvaluateTone = (status?: EvaluateTestResult["status"] | null): "ok" | "bad" | "neutral" => {
    if (status === "pass") return "ok";
    if (status === "fail") return "bad";
    return "neutral";
  };

  const getLatestStoredResults = () => {
    const next = new Map<string, RunResult>();
    if (currentResult) next.set(currentResult.scenarioId, currentResult);
    for (const result of batchResults) {
      if (!next.has(result.scenarioId)) next.set(result.scenarioId, result);
    }
    return Array.from(next.values());
  };

  const runEvaluateTest = async (results: RunResult[], force = false) => {
    if ((!useEvaluateTest && !force) || results.length === 0) return;
    setIsEvaluating(true);
    setEvaluateFeedback("Evaluate_test đang duyệt kết quả Chat Lab...");
    try {
      const evaluations = await evaluateChatLabResults({
        items: results
          .map((result) => {
            const scenario = scenarios.find((item) => item.id === result.scenarioId);
            return scenario ? { scenario, result } : null;
          })
          .filter(Boolean) as Array<{ scenario: ChatLabScenario; result: RunResult }>,
      });

      startTransition(() => {
        setEvaluateTestResults((current) => {
          const next = { ...current };
          for (const evaluation of evaluations) {
            next[evaluation.scenario_id] = evaluation;
          }
          return next;
        });
      });
      setEvaluateFeedback(`Evaluate_test đã cập nhật ${evaluations.length} recommendation.`);
    } catch (error) {
      setEvaluateFeedback(error instanceof Error ? error.message : "Evaluate_test không thể review kết quả hiện tại.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const exportResultsToCsv = async () => {
    const resultsToExport = batchResults.length > 0 ? batchResults : currentResult ? [currentResult] : [];
    const rows = resultsToExport
      .map((result) => {
        const scenario = scenarios.find((item) => item.id === result.scenarioId);
        if (!scenario) return null;
        const manualReview = manualReviews[result.scenarioId] || null;
        const evaluateTestReview = evaluateTestResults[result.scenarioId] || null;
        const score = getScoreSummary(scenario, result.response, manualReview);
        const response = result.response;
        return {
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
          route_pass: String(score.routePass),
          intent_pass: String(score.intentPass),
          clarify_pass: String(score.clarifyPass),
          auto_pass: String(score.autoPass),
          manual_review_required: String(Boolean(scenario.manualReview)),
          manual_review_available: "true",
          manual_review_status: score.manualStatus || "",
          manual_review_reason: manualReview?.reason || "",
          manual_review_updated_at: manualReview?.updatedAt || "",
          evaluate_test_status: evaluateTestReview?.status || "",
          evaluate_test_layer: evaluateTestReview?.layer || "",
          evaluate_test_summary: evaluateTestReview?.summary || "",
          evaluate_test_recommendation: evaluateTestReview?.recommendation || "",
          evaluate_test_know_how_ids: evaluateTestReview?.matched_know_how?.map((entry) => entry.id).join("|") || "",
          evaluate_test_should_review_manually: evaluateTestReview ? String(evaluateTestReview.should_review_manually) : "",
          evaluate_test_updated_at: evaluateTestReview?.generated_at || "",
          pass: String(score.pass),
          latency_ms: response?.latency_ms ?? "",
          total_tokens: response?.usage?.total_tokens ?? "",
          started_at: result.startedAt,
          error: result.error || "",
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    if (rows.length === 0) return;
    const exportStamp = new Date().toISOString().replace(/[:.]/g, "-");
    const scope = batchResults.length > 0 ? "batch" : "single";
    setExportFeedback(`Dang luu CSV vao ${CHAT_LAB_ARTIFACT_DIR}...`);
    try {
      const result = await exportChatLabCsvArtifact({
        filename: `chat-lab-results-${scope}-${exportStamp}.csv`,
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
    setEvaluateFeedback(null);
    const result = await runScenario(selectedScenario);
    startTransition(() => {
      setCurrentResult(result);
      setBatchResults((current) => [result, ...current.filter((item) => item.scenarioId !== result.scenarioId)]);
      setActiveTab("overview");
    });
    await runEvaluateTest([result]);
    setIsRunning(false);
  };

  const handleRunBatch = async () => {
    if (isRunning || filteredScenarios.length === 0) return;
    setIsRunning(true);
    setEvaluateFeedback(null);
    const nextResults = [...batchResults];
    const freshResults: RunResult[] = [];
    for (const scenario of filteredScenarios) {
      const result = await runScenario(scenario);
      freshResults.push(result);
      const existingIndex = nextResults.findIndex((item) => item.scenarioId === result.scenarioId);
      if (existingIndex >= 0) {
        nextResults.splice(existingIndex, 1, result);
      } else {
        nextResults.push(result);
      }
      if (scenario.id === selectedScenario?.id) startTransition(() => setCurrentResult(result));
    }
    await runEvaluateTest(freshResults);
    startTransition(() => { setBatchResults(nextResults); setActiveTab("batch"); });
    setIsRunning(false);
  };
  const statusCards = (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
      <div className="rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Số case</div><div className="mt-1 text-lg font-black text-[#1C1D21]">{scenarios.length}</div></div>
      <div className="rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Đang lọc</div><div className="mt-1 text-lg font-black text-[#1C1D21]">{filteredScenarios.length}</div></div>
      <div className="rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Kết quả batch</div><div className="mt-1 text-lg font-black text-[#1C1D21]">{batchResults.length}</div></div>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[1.25rem] border border-[#DCE5C7] bg-[radial-gradient(circle_at_top_left,_#EAF4D5,_#F9F9FB_60%)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-[#C4DCA0] bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Chat Lab</div>
            <h1 className="max-w-3xl text-[1.65rem] font-black leading-tight tracking-tight text-[#1C1D21] lg:text-[1.9rem]">Kiểm thử intent, route, formatter và fallback của AI chat trên từng test case.</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-gray-600">Màn này dùng để soi từng bước classifier, router, skill, SQL log và câu trả lời cuối thay vì chỉ nhìn đáp án.</p>
            <p className="mt-1 max-w-2xl text-[12px] leading-6 text-gray-500">CSV export duoc luu vao <code className="rounded bg-white/80 px-1.5 py-0.5 text-[11px]">{CHAT_LAB_ARTIFACT_DIR}</code> de tiep tuc review va handoff.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={handleRunSingle} disabled={isRunning || !selectedScenario} className="inline-flex items-center gap-2 rounded-2xl bg-[#1C1D21] px-4 py-2.5 text-sm font-bold text-[#B8FF68] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"><Play className="h-4 w-4" />Chạy test case</button>
            <button type="button" onClick={handleRunBatch} disabled={isRunning} className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-[#1C1D21] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"><Rows4 className="h-4 w-4" />Chạy batch</button>
            <button type="button" onClick={exportResultsToCsv} disabled={isRunning || (batchResults.length === 0 && !currentResult)} className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-[#1C1D21] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">Xuất CSV</button>
          </div>
        </div>
        {exportFeedback ? <div className="mt-3 rounded-2xl border border-[#DCE5C7] bg-white/80 px-4 py-3 text-sm text-gray-700">{exportFeedback}</div> : null}
        {evaluateFeedback ? <div className="mt-3 rounded-2xl border border-[#D8E4F5] bg-white/80 px-4 py-3 text-sm text-gray-700">{evaluateFeedback}</div> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="Bảng điều khiển" className="h-fit xl:sticky xl:top-5">
          <div className="space-y-4">
            {statusCards}
            <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Tìm test case</span><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="tc01, seller, follow-up..." className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] py-3 pl-11 pr-4 text-sm font-medium outline-none transition-colors focus:border-[#B8FF68]" /></div></label>
            <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Nhóm / bảng</span><select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[#B8FF68]">{groups.map((group) => (<option key={group} value={group}>{group === "all" ? "Tất cả nhóm" : "Nhóm " + group}</option>))}</select></label>
            <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Test case</span><select value={selectedScenarioId} onChange={(event) => setSelectedScenarioId(event.target.value)} className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[#B8FF68]">{filteredScenarios.map((scenario) => (<option key={scenario.id} value={scenario.id}>{scenario.id + " · " + scenario.title}</option>))}</select></label>
            <div className="grid gap-3"><label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium"><span>Bật intent classifier</span><input type="checkbox" checked={useIntentClassifier} onChange={(event) => setUseIntentClassifier(event.target.checked)} /></label><label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium"><span>Bật skill formatter</span><input type="checkbox" checked={useSkillFormatter} onChange={(event) => setUseSkillFormatter(event.target.checked)} /></label><label className="space-y-2 rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium"><div className="flex items-center justify-between gap-3"><span>Bật Evaluate_test</span><input type="checkbox" checked={useEvaluateTest} onChange={(event) => { const checked = event.target.checked; setUseEvaluateTest(checked); if (checked) { void runEvaluateTest(getLatestStoredResults(), true); } else { setEvaluateFeedback(null); } }} /></div><p className="text-xs leading-5 text-gray-500">Chỉ chạy agent review sơ bộ khi checkbox này được bật.</p></label></div>
            {selectedScenario ? (<div className="rounded-2xl border border-dashed border-gray-300 bg-[#FCFCFE] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Tóm tắt case</p><p className="mt-2 text-base font-bold text-[#1C1D21]">{selectedScenario.title}</p><p className="mt-1 text-sm text-gray-500">Nhóm {selectedScenario.group} · View: {selectedScenario.viewId}</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500"><span className="rounded-full bg-white px-3 py-1">Luồng {selectedScenario.expectedRoute}</span><span className="rounded-full bg-white px-3 py-1">Ý định {selectedScenario.expectedIntent}</span>{selectedScenario.expectedSkillId ? <span className="rounded-full bg-white px-3 py-1">Skill {selectedScenario.expectedSkillId}</span> : null}{selectedScenario.manualReview ? <span className="rounded-full bg-white px-3 py-1">Cần xem tay</span> : null}</div>{selectedScenario.notes ? <div className="mt-3 rounded-2xl bg-white p-3 text-sm leading-6 text-gray-700">{selectedScenario.notes}</div> : null}<div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">{selectedScenario.messages.map((message, index) => (<div key={message.role + "-" + index} className="rounded-2xl border border-gray-200 bg-white p-3"><div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">{message.role === "user" ? "Người dùng" : "Trợ lý"}</div><div className="text-sm leading-6 text-[#1C1D21]">{message.content || "(trống)"}</div></div>))}</div></div>) : null}
            {scenariosError ? (<div className="rounded-2xl border border-[#FFD6D6] bg-[#FFF0F0] p-4 text-sm leading-6 text-[#7D1D1D]">Đang dùng fallback scenarios. Chi tiết: {scenariosError}</div>) : null}
          </div>
        </Panel>

        <div className="space-y-4">
          <div className="sticky top-5 z-10 rounded-3xl border border-gray-200 bg-white/90 p-3 shadow-sm backdrop-blur"><div className="flex flex-wrap gap-2">{[{ id: "overview", label: "Tổng quan", icon: <SplitSquareHorizontal className="h-4 w-4" /> }, { id: "reasoning", label: "Suy luận", icon: <FlaskConical className="h-4 w-4" /> }, { id: "sql", label: "SQL", icon: <FlaskConical className="h-4 w-4" /> }, { id: "batch", label: "Batch", icon: <Rows4 className="h-4 w-4" /> }].map((tab) => (<button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as LabTab)} className={cn("inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors", activeTab === tab.id ? "bg-[#1C1D21] text-[#B8FF68]" : "bg-[#F3F4F6] text-[#1C1D21] hover:bg-[#E8EAED]")}>{tab.icon}{tab.label}</button>))}</div></div>
          {activeTab === "overview" ? (<div className="grid gap-5 xl:grid-cols-2"><Panel title="Tóm tắt điểm">{selectedScenario && currentResult ? (<div className="space-y-4"><div className="flex flex-wrap gap-2"><Badge tone={currentScore?.pass ? "ok" : currentScore?.requiresManualReview && currentScore?.manualStatus === "pending" && currentScore?.autoPass ? "neutral" : "bad"} label={currentScore?.requiresManualReview ? currentScore?.manualStatus === "pass" ? "Đạt sau review" : currentScore?.manualStatus === "fail" ? "Trượt sau review" : "Chờ review tay" : currentScore?.manualStatus === "pass" ? "Đạt có review" : currentScore?.manualStatus === "fail" ? "Trượt do review" : currentScore?.pass ? "Đạt tự động" : "Trượt"} /><Badge tone={currentScore?.routePass ? "ok" : "bad"} label="Route" /><Badge tone={currentScore?.intentPass ? "ok" : "bad"} label="Intent" /><Badge tone={currentScore?.clarifyPass ? "ok" : "bad"} label="Clarify" /><Badge tone={currentScore?.manualStatus === "pass" ? "ok" : currentScore?.manualStatus === "fail" ? "bad" : "neutral"} label={currentScore?.manualStatus === "pass" ? "Review pass" : currentScore?.manualStatus === "fail" ? "Review fail" : currentScore?.requiresManualReview ? "Review pending" : "Review tùy chọn"} />{useEvaluateTest ? <Badge tone={getEvaluateTone(selectedEvaluateTestResult?.status)} label={selectedEvaluateTestResult?.status === "pass" ? "Evaluate pass" : selectedEvaluateTestResult?.status === "fail" ? "Evaluate fail" : selectedEvaluateTestResult?.status === "needs_review" ? "Evaluate cần xem" : "Evaluate chờ chạy"} /> : null}</div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Kỳ vọng</div><div className="mt-2 text-sm leading-6 text-[#1C1D21]">Luồng: <strong>{selectedScenario.expectedRoute}</strong><br />Ý định: <strong>{selectedScenario.expectedIntent}</strong><br />Skill: <strong>{selectedScenario.expectedSkillId || "-"}</strong></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Thực tế</div><div className="mt-2 text-sm leading-6 text-[#1C1D21]">Luồng: <strong>{selectedResponse?.route || "-"}</strong><br />Ý định: <strong>{selectedResponse?.intent?.primary_intent || "-"}</strong><br />Skill: <strong>{selectedResponse?.skill_id || "-"}</strong></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Độ trễ</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse?.latency_ms || 0} ms</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Token</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse?.usage?.total_tokens || 0}</div></div></div><div className="grid gap-3 lg:grid-cols-2"><div className="rounded-2xl border border-[#D8E4F5] bg-[#F7FAFF] p-4"><div className="mb-2 flex items-center justify-between gap-3"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Evaluate_test recommendation</div>{useEvaluateTest ? <Badge tone={getEvaluateTone(selectedEvaluateTestResult?.status)} label={selectedEvaluateTestResult?.status === "pass" ? "Pass" : selectedEvaluateTestResult?.status === "fail" ? "Fail" : selectedEvaluateTestResult?.status === "needs_review" ? "Cần review" : "Chưa chạy"} /> : <Badge tone="neutral" label="Đang tắt" />}</div>{!useEvaluateTest ? <p className="text-sm leading-6 text-gray-600">Bật checkbox <strong>Evaluate_test</strong> ở bảng điều khiển để agent review sơ bộ testcase này.</p> : isEvaluating && !selectedEvaluateTestResult ? <p className="text-sm leading-6 text-gray-600">Evaluate_test đang đọc kết quả và đối chiếu know-how.</p> : selectedEvaluateTestResult ? (<div className="space-y-3"><div className="text-sm leading-6 text-[#1C1D21]"><strong>Tóm tắt:</strong> {selectedEvaluateTestResult.summary}</div><div className="text-sm leading-6 text-[#1C1D21]"><strong>Khuyến nghị:</strong> {selectedEvaluateTestResult.recommendation}</div><div className="text-xs leading-5 text-gray-500">Layer ưu tiên: <strong>{selectedEvaluateTestResult.layer}</strong> · Cập nhật: {selectedEvaluateTestResult.generated_at}</div>{selectedEvaluateTestResult.matched_know_how.length ? <div className="flex flex-wrap gap-2">{selectedEvaluateTestResult.matched_know_how.map((entry) => (<span key={entry.id} className="rounded-full border border-[#D8E4F5] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#415A77]">{entry.id}</span>))}</div> : null}</div>) : <p className="text-sm leading-6 text-gray-600">Chưa có recommendation cho testcase này.</p>}</div><div className="rounded-2xl border border-gray-200 bg-[#FCFCFE] p-4"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">{selectedScenario.manualReview ? "Manual review bắt buộc" : "Manual review tùy chọn"}</div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => upsertManualReview(selectedScenario.id, "pass", selectedManualReview?.reason || "")} className={getManualReviewButtonClass("pass", selectedManualReview?.status === "pass")}>Đánh dấu pass</button><button type="button" onClick={() => upsertManualReview(selectedScenario.id, "fail", selectedManualReview?.reason || "")} className={getManualReviewButtonClass("fail", selectedManualReview?.status === "fail")}>Đánh dấu fail</button><button type="button" onClick={() => clearManualReview(selectedScenario.id)} className={getManualReviewButtonClass("clear", !selectedManualReview)}>Bỏ review</button></div><label className="mt-3 block space-y-2"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Lý do review tay</span><textarea value={selectedManualReview?.reason || ""} onChange={(event) => upsertManualReview(selectedScenario.id, selectedManualReview?.status || "pending", event.target.value)} placeholder="Ví dụ: route đúng nhưng reply thiếu số tổng, sai ngôn ngữ, hoặc chưa grounded." className="min-h-28 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-[#B8FF68]" /></label>{selectedManualReview?.updatedAt ? <div className="mt-2 text-xs text-gray-500">Cập nhật: {selectedManualReview.updatedAt}</div> : null}</div></div></div>) : <p className="text-sm text-gray-500">Chưa có kết quả để chấm điểm.</p>}</Panel><Panel title="So sánh phản hồi">{selectedScenario && currentResult ? (<div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-4"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Kỳ vọng</div><div className="text-sm leading-6 text-[#1C1D21]">Luồng: <strong>{selectedScenario.expectedRoute}</strong><br />Ý định: <strong>{selectedScenario.expectedIntent}</strong></div></div><div className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-4"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Phản hồi thực tế</div><div className="max-h-[18rem] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#1C1D21]">{currentResult.error || selectedResponse?.reply || "-"}</div></div></div>) : <p className="text-sm text-gray-500">Chưa có kết quả để so sánh.</p>}</Panel></div>) : null}

          {activeTab === "reasoning" ? (<div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><Panel title="Ảnh chụp suy luận">{selectedResponse ? (<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Nguồn intent</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.intent_source || "-"}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Nguồn formatter</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.formatter_source || "-"}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Độ tin cậy</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.intent_confidence ?? selectedResponse.confidence ?? "-"}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Lý do fallback</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.fallback_reason || "-"}</div></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4 text-sm leading-6 text-[#1C1D21]"><div>Trace: <strong>{selectedResponse.trace_id || "-"}</strong></div><div className="mt-2">Clarify: <strong>{selectedResponse.clarification_question || "-"}</strong></div><div className="mt-2">Candidates: <strong>{selectedResponse.matched_skill_candidates?.join(", ") || "-"}</strong></div></div><pre className="max-h-[28rem] overflow-auto rounded-2xl bg-[#101114] p-4 text-[11px] text-[#D8FBC1]">{prettyJson(selectedResponse.intent)}</pre></div>) : <p className="text-sm text-gray-500">Chưa có ảnh chụp để xem.</p>}</Panel><Panel title="Dòng thời gian thực thi">{selectedResponse?.execution_timeline?.length ? (<div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">{selectedResponse.execution_timeline.map((item, index) => (<div key={item.step + "-" + index} className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-bold capitalize text-[#1C1D21]">{item.step.replaceAll("_", " ")}</div><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{item.at}</div></div><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-gray-600">{prettyJson(item)}</pre></div>))}</div>) : <p className="text-sm text-gray-500">Không có dòng thời gian thực thi.</p>}</Panel></div>) : null}

          {activeTab === "sql" ? (<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><Panel title="Trình xem SQL">{selectedResponse?.sql_logs?.length ? (<div className="max-h-[36rem] space-y-4 overflow-y-auto pr-1">{selectedResponse.sql_logs.map((log, index) => (<div key={log.name + "-" + index} className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#1C1D21] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#B8FF68]">{log.name}</span><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">rows={log.row_count} limit={log.row_limit}</span></div>{log.error ? <div className="mt-3 rounded-xl bg-[#FFF0F0] px-3 py-2 text-xs font-semibold text-[#7D1D1D]">{log.error}</div> : null}<pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-[11px] text-gray-700">{log.sql}</pre></div>))}</div>) : <p className="text-sm text-gray-500">Không có SQL logs cho test case này.</p>}</Panel><Panel title="Bản đồ test">{selectedScenario ? (<div className="space-y-4"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Tự động hóa</div><div className="mt-2 space-y-2 text-sm leading-6 text-[#1C1D21]"><div>Route suite: <strong>{selectedScenario.routeSuite || "-"}</strong></div><div>Intent suite: <strong>{selectedScenario.intentSuite || "-"}</strong></div><div>Clarify suite: <strong>{selectedScenario.clarifySuite || "-"}</strong></div><div>Manual review: <strong>{String(Boolean(selectedScenario.manualReview))}</strong></div></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Trọng tâm review</div><div className="mt-3 flex flex-wrap gap-2">{(selectedScenario.reviewFocus || []).length ? selectedScenario.reviewFocus?.map((focus) => (<span key={focus} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{focus}</span>)) : <span className="text-sm text-gray-500">Không có.</span>}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Ghi chú</div><div className="mt-2 text-sm leading-6 text-[#1C1D21]">{selectedScenario.notes || "-"}</div></div></div>) : <p className="text-sm text-gray-500">Chưa có scenario nào được chọn.</p>}</Panel></div>) : null}

          {activeTab === "batch" ? (<div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"><Panel title="Tổng kết batch"><div className="grid gap-3"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Tập chạy</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{filteredScenarios.length} test case</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Đạt hoàn chỉnh</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{batchSummary.passed}/{batchSummary.total}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Chờ review tay</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{batchSummary.pendingManual}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4 text-sm leading-6 text-gray-600">Batch được giữ lại trong cache local. Chỉ khi bấm Làm mới lab thì toàn bộ lịch sử chạy và review tay mới bị xóa.</div></div></Panel><Panel title="Danh sách batch">{batchResults.length > 0 ? (<div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">{batchResults.map((result) => { const scenario = scenarios.find((item) => item.id === result.scenarioId); if (!scenario) return null; const score = getScoreSummary(scenario, result.response, manualReviews[result.scenarioId]); return <button key={result.scenarioId} type="button" onClick={() => { setSelectedScenarioId(result.scenarioId); setCurrentResult(result); setActiveTab("overview"); }} className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-left transition-colors hover:bg-white"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-[#1C1D21]">{scenario.id + " · " + scenario.title}</div><div className="mt-1 text-xs text-gray-500">luồng={result.response?.route || "error"} ý định={result.response?.intent?.primary_intent || "-"}</div></div><Badge tone={score.pass ? "ok" : score.requiresManualReview && score.manualStatus === "pending" && score.autoPass ? "neutral" : "bad"} label={score.requiresManualReview ? score.manualStatus === "pass" ? "Đạt sau review" : score.manualStatus === "fail" ? "Trượt sau review" : "Chờ review" : score.manualStatus === "pass" ? "Đạt có review" : score.manualStatus === "fail" ? "Trượt do review" : score.pass ? "Đạt tự động" : "Trượt"} /></div></button>; })}</div>) : <p className="text-sm text-gray-500">Batch run chưa được chạy.</p>}</Panel></div>) : null}
        </div>
      </div>

      {isRunning ? <div className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-[#1C1D21] px-4 py-3 text-sm font-bold text-[#B8FF68] shadow-xl"><Bot className="h-4 w-4" />Đang chạy test case...</div> : <button type="button" onClick={() => { setCurrentResult(null); setBatchResults([]); setManualReviews({}); setEvaluateTestResults({}); setExportFeedback(null); setEvaluateFeedback(null); localStorage.removeItem(STORAGE_KEYS.currentResult); localStorage.removeItem(STORAGE_KEYS.batchResults); localStorage.removeItem(STORAGE_KEYS.manualReviews); localStorage.removeItem(STORAGE_KEYS.evaluateTestResults); }} className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-[#1C1D21] shadow-lg"><TimerReset className="h-4 w-4" />Làm mới lab</button>}
      {isEvaluating ? <div className="fixed bottom-24 right-6 inline-flex items-center gap-2 rounded-full border border-[#D8E4F5] bg-white px-4 py-3 text-sm font-bold text-[#1C1D21] shadow-lg"><Bot className="h-4 w-4" />Evaluate_test đang review...</div> : null}
      {isLoadingScenarios ? <div className="fixed bottom-40 right-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-[#1C1D21] shadow-lg"><Bot className="h-4 w-4" />Đang tải eval-50 scenarios...</div> : null}
    </div>
  );
}
