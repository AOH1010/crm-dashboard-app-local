import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Bot, FlaskConical, Play, Rows4, Search, SplitSquareHorizontal, TimerReset } from "lucide-react";
import { CHAT_LAB_FALLBACK_SCENARIOS, type ChatLabScenario } from "@/src/lib/chatLabScenarios";
import { fetchChatLabScenarios, sendAgentMessage, type AgentChatResponse } from "@/src/lib/agentApi";
import { cn } from "@/src/lib/utils";

type RunResult = { scenarioId: string; response: AgentChatResponse | null; error: string | null; startedAt: string };
type LabTab = "overview" | "reasoning" | "sql" | "batch";

function getScoreSummary(scenario: ChatLabScenario, response: AgentChatResponse | null) {
  const allowedRoutes = scenario.allowedRoutes?.length ? scenario.allowedRoutes : [scenario.expectedRoute];
  const routePass = allowedRoutes.includes(response?.route || "");
  const intentPass = (response?.intent?.primary_intent || "unknown") === scenario.expectedIntent;
  const clarifyPass = scenario.expectedClarify === undefined ? true : Boolean(response?.clarification_question) === scenario.expectedClarify;
  return { routePass, intentPass, clarifyPass, pass: routePass && intentPass && clarifyPass };
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""').replaceAll("\r\n", "\n").replaceAll("\n", "\\n")}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return false;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  const blob = new Blob(["\ufeff", lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", ok ? "bg-[#B8FF68] text-[#1C1D21]" : "bg-[#FFD6D6] text-[#7D1D1D]")}>{label}</span>;
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
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<LabTab>("overview");
  const deferredSearchTerm = useDeferredValue(searchTerm);

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
  const currentScore = useMemo(() => selectedScenario && currentResult?.response ? getScoreSummary(selectedScenario, currentResult.response) : null, [currentResult, selectedScenario]);
  const selectedResponse = currentResult?.response || null;
  const batchSummary = useMemo(() => {
    let passed = 0;
    for (const result of batchResults) {
      const scenario = scenarios.find((item) => item.id === result.scenarioId);
      if (scenario && getScoreSummary(scenario, result.response).pass) {
        passed += 1;
      }
    }
    return { total: batchResults.length, passed };
  }, [batchResults, scenarios]);

  const exportResultsToCsv = () => {
    const resultsToExport = batchResults.length > 0 ? batchResults : currentResult ? [currentResult] : [];
    const rows = resultsToExport
      .map((result) => {
        const scenario = scenarios.find((item) => item.id === result.scenarioId);
        if (!scenario) return null;
        const score = getScoreSummary(scenario, result.response);
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
          pass: String(score.pass),
          latency_ms: response?.latency_ms ?? "",
          total_tokens: response?.usage?.total_tokens ?? "",
          started_at: result.startedAt,
          error: result.error || "",
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    if (rows.length === 0) return;
    const datePart = new Date().toISOString().slice(0, 10);
    const scope = batchResults.length > 0 ? "batch" : "single";
    downloadCsv(`chat-lab-results-${scope}-${datePart}.csv`, rows);
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
    const nextResults: RunResult[] = [];
    for (const scenario of filteredScenarios) {
      const result = await runScenario(scenario);
      nextResults.push(result);
      if (scenario.id === selectedScenario?.id) startTransition(() => setCurrentResult(result));
    }
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
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={handleRunSingle} disabled={isRunning || !selectedScenario} className="inline-flex items-center gap-2 rounded-2xl bg-[#1C1D21] px-4 py-2.5 text-sm font-bold text-[#B8FF68] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"><Play className="h-4 w-4" />Chạy test case</button>
            <button type="button" onClick={handleRunBatch} disabled={isRunning} className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-[#1C1D21] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"><Rows4 className="h-4 w-4" />Chạy batch</button>
            <button type="button" onClick={exportResultsToCsv} disabled={isRunning || (batchResults.length === 0 && !currentResult)} className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-[#1C1D21] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">Xuất CSV</button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="Bảng điều khiển" className="h-fit xl:sticky xl:top-5">
          <div className="space-y-4">
            {statusCards}
            <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Tìm test case</span><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="tc01, seller, follow-up..." className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] py-3 pl-11 pr-4 text-sm font-medium outline-none transition-colors focus:border-[#B8FF68]" /></div></label>
            <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Nhóm / bảng</span><select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[#B8FF68]">{groups.map((group) => (<option key={group} value={group}>{group === "all" ? "Tất cả nhóm" : "Nhóm " + group}</option>))}</select></label>
            <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Test case</span><select value={selectedScenarioId} onChange={(event) => setSelectedScenarioId(event.target.value)} className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[#B8FF68]">{filteredScenarios.map((scenario) => (<option key={scenario.id} value={scenario.id}>{scenario.id + " · " + scenario.title}</option>))}</select></label>
            <div className="grid gap-3"><label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium"><span>Bật intent classifier</span><input type="checkbox" checked={useIntentClassifier} onChange={(event) => setUseIntentClassifier(event.target.checked)} /></label><label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-sm font-medium"><span>Bật skill formatter</span><input type="checkbox" checked={useSkillFormatter} onChange={(event) => setUseSkillFormatter(event.target.checked)} /></label></div>
            {selectedScenario ? (<div className="rounded-2xl border border-dashed border-gray-300 bg-[#FCFCFE] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Tóm tắt case</p><p className="mt-2 text-base font-bold text-[#1C1D21]">{selectedScenario.title}</p><p className="mt-1 text-sm text-gray-500">Nhóm {selectedScenario.group} · View: {selectedScenario.viewId}</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500"><span className="rounded-full bg-white px-3 py-1">Luồng {selectedScenario.expectedRoute}</span><span className="rounded-full bg-white px-3 py-1">Ý định {selectedScenario.expectedIntent}</span>{selectedScenario.expectedSkillId ? <span className="rounded-full bg-white px-3 py-1">Skill {selectedScenario.expectedSkillId}</span> : null}{selectedScenario.manualReview ? <span className="rounded-full bg-white px-3 py-1">Cần xem tay</span> : null}</div>{selectedScenario.notes ? <div className="mt-3 rounded-2xl bg-white p-3 text-sm leading-6 text-gray-700">{selectedScenario.notes}</div> : null}<div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">{selectedScenario.messages.map((message, index) => (<div key={message.role + "-" + index} className="rounded-2xl border border-gray-200 bg-white p-3"><div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">{message.role === "user" ? "Người dùng" : "Trợ lý"}</div><div className="text-sm leading-6 text-[#1C1D21]">{message.content || "(trống)"}</div></div>))}</div></div>) : null}
            {scenariosError ? (<div className="rounded-2xl border border-[#FFD6D6] bg-[#FFF0F0] p-4 text-sm leading-6 text-[#7D1D1D]">Đang dùng fallback scenarios. Chi tiết: {scenariosError}</div>) : null}
          </div>
        </Panel>

        <div className="space-y-4">
          <div className="sticky top-5 z-10 rounded-3xl border border-gray-200 bg-white/90 p-3 shadow-sm backdrop-blur"><div className="flex flex-wrap gap-2">{[{ id: "overview", label: "Tổng quan", icon: <SplitSquareHorizontal className="h-4 w-4" /> }, { id: "reasoning", label: "Suy luận", icon: <FlaskConical className="h-4 w-4" /> }, { id: "sql", label: "SQL", icon: <FlaskConical className="h-4 w-4" /> }, { id: "batch", label: "Batch", icon: <Rows4 className="h-4 w-4" /> }].map((tab) => (<button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as LabTab)} className={cn("inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors", activeTab === tab.id ? "bg-[#1C1D21] text-[#B8FF68]" : "bg-[#F3F4F6] text-[#1C1D21] hover:bg-[#E8EAED]")}>{tab.icon}{tab.label}</button>))}</div></div>
          {activeTab === "overview" ? (<div className="grid gap-5 xl:grid-cols-2"><Panel title="Tóm tắt điểm">{selectedScenario && currentResult ? (<div className="space-y-4"><div className="flex flex-wrap gap-2"><Badge ok={Boolean(currentScore?.pass)} label={currentScore?.pass ? "Đạt" : "Trượt"} /><Badge ok={Boolean(currentScore?.routePass)} label="Route" /><Badge ok={Boolean(currentScore?.intentPass)} label="Intent" /><Badge ok={Boolean(currentScore?.clarifyPass)} label="Clarify" /></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Kỳ vọng</div><div className="mt-2 text-sm leading-6 text-[#1C1D21]">Luồng: <strong>{selectedScenario.expectedRoute}</strong><br />Ý định: <strong>{selectedScenario.expectedIntent}</strong><br />Skill: <strong>{selectedScenario.expectedSkillId || "-"}</strong></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Thực tế</div><div className="mt-2 text-sm leading-6 text-[#1C1D21]">Luồng: <strong>{selectedResponse?.route || "-"}</strong><br />Ý định: <strong>{selectedResponse?.intent?.primary_intent || "-"}</strong><br />Skill: <strong>{selectedResponse?.skill_id || "-"}</strong></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Độ trễ</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse?.latency_ms || 0} ms</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Token</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse?.usage?.total_tokens || 0}</div></div></div></div>) : <p className="text-sm text-gray-500">Chưa có kết quả để chấm điểm.</p>}</Panel><Panel title="So sánh phản hồi">{selectedScenario && currentResult ? (<div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-4"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Kỳ vọng</div><div className="text-sm leading-6 text-[#1C1D21]">Luồng: <strong>{selectedScenario.expectedRoute}</strong><br />Ý định: <strong>{selectedScenario.expectedIntent}</strong></div></div><div className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-4"><div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Phản hồi thực tế</div><div className="max-h-[18rem] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#1C1D21]">{currentResult.error || selectedResponse?.reply || "-"}</div></div></div>) : <p className="text-sm text-gray-500">Chưa có kết quả để so sánh.</p>}</Panel></div>) : null}

          {activeTab === "reasoning" ? (<div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]"><Panel title="Ảnh chụp suy luận">{selectedResponse ? (<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Nguồn intent</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.intent_source || "-"}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Nguồn formatter</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.formatter_source || "-"}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Độ tin cậy</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.intent_confidence ?? selectedResponse.confidence ?? "-"}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Lý do fallback</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{selectedResponse.fallback_reason || "-"}</div></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4 text-sm leading-6 text-[#1C1D21]"><div>Trace: <strong>{selectedResponse.trace_id || "-"}</strong></div><div className="mt-2">Clarify: <strong>{selectedResponse.clarification_question || "-"}</strong></div><div className="mt-2">Candidates: <strong>{selectedResponse.matched_skill_candidates?.join(", ") || "-"}</strong></div></div><pre className="max-h-[28rem] overflow-auto rounded-2xl bg-[#101114] p-4 text-[11px] text-[#D8FBC1]">{prettyJson(selectedResponse.intent)}</pre></div>) : <p className="text-sm text-gray-500">Chưa có ảnh chụp để xem.</p>}</Panel><Panel title="Dòng thời gian thực thi">{selectedResponse?.execution_timeline?.length ? (<div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">{selectedResponse.execution_timeline.map((item, index) => (<div key={item.step + "-" + index} className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-bold capitalize text-[#1C1D21]">{item.step.replaceAll("_", " ")}</div><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{item.at}</div></div><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-gray-600">{prettyJson(item)}</pre></div>))}</div>) : <p className="text-sm text-gray-500">Không có dòng thời gian thực thi.</p>}</Panel></div>) : null}

          {activeTab === "sql" ? (<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><Panel title="Trình xem SQL">{selectedResponse?.sql_logs?.length ? (<div className="max-h-[36rem] space-y-4 overflow-y-auto pr-1">{selectedResponse.sql_logs.map((log, index) => (<div key={log.name + "-" + index} className="rounded-2xl border border-gray-200 bg-[#FAFAFC] p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#1C1D21] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#B8FF68]">{log.name}</span><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">rows={log.row_count} limit={log.row_limit}</span></div>{log.error ? <div className="mt-3 rounded-xl bg-[#FFF0F0] px-3 py-2 text-xs font-semibold text-[#7D1D1D]">{log.error}</div> : null}<pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-[11px] text-gray-700">{log.sql}</pre></div>))}</div>) : <p className="text-sm text-gray-500">Không có SQL logs cho test case này.</p>}</Panel><Panel title="Bản đồ test">{selectedScenario ? (<div className="space-y-4"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Tự động hóa</div><div className="mt-2 space-y-2 text-sm leading-6 text-[#1C1D21]"><div>Route suite: <strong>{selectedScenario.routeSuite || "-"}</strong></div><div>Intent suite: <strong>{selectedScenario.intentSuite || "-"}</strong></div><div>Clarify suite: <strong>{selectedScenario.clarifySuite || "-"}</strong></div><div>Manual review: <strong>{String(Boolean(selectedScenario.manualReview))}</strong></div></div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Trọng tâm review</div><div className="mt-3 flex flex-wrap gap-2">{(selectedScenario.reviewFocus || []).length ? selectedScenario.reviewFocus?.map((focus) => (<span key={focus} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{focus}</span>)) : <span className="text-sm text-gray-500">Không có.</span>}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Ghi chú</div><div className="mt-2 text-sm leading-6 text-[#1C1D21]">{selectedScenario.notes || "-"}</div></div></div>) : <p className="text-sm text-gray-500">Chưa có scenario nào được chọn.</p>}</Panel></div>) : null}

          {activeTab === "batch" ? (<div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"><Panel title="Tổng kết batch"><div className="grid gap-3"><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Tập chạy</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{filteredScenarios.length} test case</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4"><div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Tỷ lệ đạt</div><div className="mt-2 text-sm font-bold text-[#1C1D21]">{batchSummary.passed}/{batchSummary.total}</div></div><div className="rounded-2xl bg-[#FAFAFC] p-4 text-sm leading-6 text-gray-600">Batch sẽ chạy trên tập scenario đang được lọc ở cột trái. Cách này giúp đi từng bảng A, B, C... mà không bị loãng.</div></div></Panel><Panel title="Danh sách batch">{batchResults.length > 0 ? (<div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">{batchResults.map((result) => { const scenario = scenarios.find((item) => item.id === result.scenarioId); if (!scenario) return null; const score = getScoreSummary(scenario, result.response); return <button key={result.scenarioId} type="button" onClick={() => { setSelectedScenarioId(result.scenarioId); setCurrentResult(result); setActiveTab("overview"); }} className="w-full rounded-2xl border border-gray-200 bg-[#FAFAFC] px-4 py-3 text-left transition-colors hover:bg-white"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-[#1C1D21]">{scenario.id + " · " + scenario.title}</div><div className="mt-1 text-xs text-gray-500">luồng={result.response?.route || "error"} ý định={result.response?.intent?.primary_intent || "-"}</div></div><Badge ok={score.pass} label={score.pass ? "Đạt" : "Trượt"} /></div></button>; })}</div>) : <p className="text-sm text-gray-500">Batch run chưa được chạy.</p>}</Panel></div>) : null}
        </div>
      </div>

      {isRunning ? <div className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-[#1C1D21] px-4 py-3 text-sm font-bold text-[#B8FF68] shadow-xl"><Bot className="h-4 w-4" />Đang chạy test case...</div> : <button type="button" onClick={() => { setCurrentResult(null); setBatchResults([]); }} className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-[#1C1D21] shadow-lg"><TimerReset className="h-4 w-4" />Làm mới lab</button>}
      {isLoadingScenarios ? <div className="fixed bottom-24 right-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-[#1C1D21] shadow-lg"><Bot className="h-4 w-4" />Đang tải eval-50 scenarios...</div> : null}
    </div>
  );
}
