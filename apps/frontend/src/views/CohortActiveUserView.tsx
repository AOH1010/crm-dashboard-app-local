import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarRange,
  Filter,
  Layers3,
  Radar,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { LOAD_LIVE_DATA_EVENT } from "@/src/lib/liveDataEvents";
import {
  fetchOperationsCohort,
  type OperationsCohortResponse,
  type OperationsMetric,
} from "@/src/lib/operationsApi";
import { readViewCache, writeViewCache } from "@/src/lib/viewCache";

const COHORT_CACHE_KEY_PREFIX = "crm_cache_ops_cohort";
const METRIC_OPTIONS: Array<{ key: OperationsMetric; label: string }> = [
  { key: "open", label: "Open" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "render", label: "Render" },
];

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthInputFromDate(dateKey: string) {
  return dateKey.slice(0, 7);
}

function dateFromMonthInput(value: string) {
  return `${value}-01`;
}

function buildCohortCacheKey(reportMonth: string, metric: OperationsMetric, threshold: number) {
  return `${COHORT_CACHE_KEY_PREFIX}:${reportMonth}:${metric}:${threshold}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMonthLabel(dateKey: string) {
  const date = new Date(`${dateKey.slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function heatCellStyle(value: number | null) {
  if (value === null) {
    return {
      backgroundColor: "#F8FAFC",
      color: "#CBD5E1",
    };
  }

  const alpha = Math.max(0.12, Math.min(0.92, value / 100));
  return {
    backgroundColor: `rgba(184, 255, 104, ${alpha})`,
    color: value >= 50 ? "#1E2C0C" : "#334155",
  };
}

export default function CohortActiveUserView() {
  const initialToday = getTodayKey();
  const [reportMonth, setReportMonth] = useState(initialToday);
  const [draftMonth, setDraftMonth] = useState(monthInputFromDate(initialToday));
  const [showFilters, setShowFilters] = useState(false);
  const [metric, setMetric] = useState<OperationsMetric>("open");
  const [threshold, setThreshold] = useState(1);
  const [draftThreshold, setDraftThreshold] = useState("1");
  const [payload, setPayload] = useState<OperationsCohortResponse | null>(null);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadCohort = async (nextReportMonth: string, nextMetric: OperationsMetric, nextThreshold: number) => {
    try {
      const nextPayload = await fetchOperationsCohort({
        reportMonth: nextReportMonth,
        metric: nextMetric,
        threshold: nextThreshold,
      });
      const cached = writeViewCache(buildCohortCacheKey(nextReportMonth, nextMetric, nextThreshold), nextPayload);
      setPayload(nextPayload);
      setCacheSavedAt(cached.savedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load cohort data.");
    }
  };

  useEffect(() => {
    const cached = readViewCache<OperationsCohortResponse>(buildCohortCacheKey(reportMonth, metric, threshold));
    if (cached) {
      setPayload(cached.data);
      setCacheSavedAt(cached.savedAt);
      return;
    }
    setPayload(null);
    setCacheSavedAt(null);
    void loadCohort(reportMonth, metric, threshold);
  }, [reportMonth, metric, threshold]);

  useEffect(() => {
    const onLoadLiveData = () => {
      void loadCohort(reportMonth, metric, threshold);
    };
    window.addEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    return () => {
      window.removeEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    };
  }, [reportMonth, metric, threshold]);

  const handleResetCurrentMonth = () => {
    const today = getTodayKey();
    startTransition(() => {
      setDraftMonth(monthInputFromDate(today));
      setReportMonth(today);
      setShowFilters(false);
    });
  };

  const handleApplyFilters = () => {
    const nextThreshold = Math.max(0, Number.parseInt(draftThreshold, 10) || 0);
    startTransition(() => {
      setReportMonth(dateFromMonthInput(draftMonth));
      setThreshold(nextThreshold);
      setShowFilters(false);
    });
  };

  const cohortRows = payload?.cohorts || [];
  const topWarning = (payload?.qa.invalid_account_months || 0) > 0;

  const maxEligible = useMemo(
    () => cohortRows.reduce((accumulator, row) => Math.max(accumulator, row.account_count), 0),
    [cohortRows],
  );

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-[#1C1D21]">
            Cohort Active User
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Measure active retention by activation month with a dynamic rule over open, create, update, or render.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleResetCurrentMonth}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-[#1C1D21] shadow-ambient transition-colors hover:bg-gray-50"
          >
            <CalendarRange className="h-4 w-4 text-[#3c6600]" />
            Current month
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold shadow-ambient transition-colors",
              showFilters
                ? "border-[#B8FF68] bg-[#B8FF68]/20 text-[#1C1D21]"
                : "border-gray-200 bg-white text-[#1C1D21] hover:bg-gray-50",
            )}
          >
            <Filter className="h-4 w-4" />
            Filter month
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-ambient">
        {cacheSavedAt ? (
          <span>
            Dang hien cache local duoc luu luc <strong>{formatDateTime(cacheSavedAt)}</strong>. Bam <strong>Load live data</strong> tren top bar de cap nhat Cohort Active tu server.
          </span>
        ) : (
          <span>
            Chua co cache local cho bo loc nay. Bam <strong>Load live data</strong> tren top bar de lay snapshot moi tu server.
          </span>
        )}
      </section>

      {showFilters ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-ambient">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <label className="space-y-2 text-sm font-semibold text-[#1C1D21]">
              <span>Report month</span>
              <input
                type="month"
                value={draftMonth}
                onChange={(event) => setDraftMonth(event.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#B8FF68]"
              />
            </label>

            <label className="space-y-2 text-sm font-semibold text-[#1C1D21]">
              <span>Threshold</span>
              <input
                type="number"
                min={0}
                step={1}
                value={draftThreshold}
                onChange={(event) => setDraftThreshold(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#B8FF68]"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Close
              </button>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="rounded-xl bg-[#B8FF68] px-5 py-2 text-sm font-bold text-[#1C1D21] shadow-lg shadow-[#B8FF68]/20 transition-transform hover:scale-[1.01]"
              >
                Apply
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
          {errorMessage}
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              label: "Avg T0-T3",
              value: `${(payload?.kpis.t0_t3_rate || 0).toFixed(1)}%`,
              icon: Layers3,
              helper: "Early retention window",
            },
            {
              label: "Avg T3-T6",
              value: `${(payload?.kpis.t3_t6_rate || 0).toFixed(1)}%`,
              icon: Radar,
              helper: "Mid retention window",
            },
            {
              label: "Avg T6-T12",
              value: `${(payload?.kpis.t6_t12_rate || 0).toFixed(1)}%`,
              icon: Layers3,
              helper: "Long-term retention window",
            },
          ].map((card, index) => (
            <article
              key={card.label}
              className={cn(
                "rounded-[28px] border p-6 shadow-ambient",
                index === 2 ? "border-[#1C1D21] bg-[#1C1D21] text-white" : "border-gray-100 bg-white text-[#1C1D21]",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn(
                    "text-[11px] font-black uppercase tracking-[0.22em]",
                    index === 2 ? "text-white/40" : "text-gray-400",
                  )}>
                    {card.label}
                  </p>
                  <p className="mt-3 font-headline text-4xl font-bold tracking-tight">{card.value}</p>
                </div>
                <div className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-2xl",
                  index === 2 ? "bg-white/8 text-[#B8FF68]" : "bg-gray-50 text-[#1C1D21]",
                )}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
              <p className={cn("mt-6 text-sm", index === 2 ? "text-white/60" : "text-gray-500")}>{card.helper}</p>
            </article>
          ))}
        </div>

        <aside className="rounded-[32px] border border-white/5 bg-[#1C1D21] p-7 text-white shadow-2xl">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#B8FF68]">Dynamic Rule</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight">Retention Control</h2>
          <p className="mt-2 text-sm text-white/55">
            {formatMonthLabel(payload?.applied_filters.report_month || reportMonth)} using <strong className="text-white">{metric}</strong> {">="} <strong className="text-white">{threshold}</strong> as the active rule.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {METRIC_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMetric(option.key)}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.2em] transition-colors",
                  metric === option.key
                    ? "bg-[#B8FF68] text-[#1C1D21]"
                    : "bg-white/8 text-white/65 hover:bg-white/12",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-[24px] border border-white/8 bg-white/5 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/35">Cohort QA</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-white/45">Invalid rows</p>
                <p className="mt-1 text-lg font-bold text-white">{payload?.qa.invalid_daily_rows_total || 0}</p>
              </div>
              <div>
                <p className="text-white/45">Invalid account-months</p>
                <p className="mt-1 text-lg font-bold text-white">{payload?.qa.invalid_account_months || 0}</p>
              </div>
              <div>
                <p className="text-white/45">Affected accounts</p>
                <p className="mt-1 text-lg font-bold text-white">{payload?.qa.affected_accounts || 0}</p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {topWarning ? (
        <section className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 shadow-ambient">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-red-700">Invalid activity rows detected</p>
              <p className="mt-1 text-sm text-red-600">
                There are rows where <strong>open = 0</strong> but create/update/render is still positive. These rows are excluded from cohort eligibility and should be corrected in the source workbook.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[36px] border border-gray-100 bg-white p-7 shadow-ambient">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-[#1C1D21]">
              Cohort Retention Matrix
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Rows are activation cohorts. Columns track active retention from T0 to T12 using the current dynamic rule.
            </p>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-400">
            {cohortRows.length} cohort rows
          </p>
        </div>

        <div className="mt-6 overflow-x-auto pb-2">
          <table className="min-w-[1060px] w-full border-separate border-spacing-2">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 rounded-2xl bg-white px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                  Cohort
                </th>
                <th className="rounded-2xl bg-gray-50 px-3 py-3 text-center text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                  Leads
                </th>
                {Array.from({ length: 13 }, (_, index) => (
                  <th key={index} className="rounded-2xl bg-gray-50 px-3 py-3 text-center text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                    T{index}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortRows.map((row) => (
                <tr key={row.cohort_month}>
                  <td className="sticky left-0 z-10 rounded-2xl border border-gray-100 bg-white px-4 py-4">
                    <p className="font-bold text-[#1C1D21]">{row.label}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {maxEligible > 0 ? `${((row.account_count / maxEligible) * 100).toFixed(1)}% of largest cohort` : "0.0%"}
                    </p>
                  </td>
                  <td className="rounded-2xl border border-gray-100 bg-[#F8FAFC] px-3 py-4 text-center text-sm font-bold text-[#1C1D21]">
                    {row.account_count}
                  </td>
                  {row.cells.map((cell) => (
                    <td key={`${row.cohort_month}:${cell.offset}`} className="p-0">
                      <div
                        className="rounded-2xl border border-white px-3 py-4 text-center shadow-sm"
                        style={heatCellStyle(cell.active_rate)}
                        title={cell.active_rate === null ? "No eligible accounts yet" : `${cell.active_count}/${cell.eligible_count} active`}
                      >
                        <p className="text-sm font-bold">
                          {cell.active_rate === null ? "-" : `${cell.active_rate.toFixed(1)}%`}
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                          {cell.active_rate === null ? "NA" : `${cell.active_count}/${cell.eligible_count}`}
                        </p>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
