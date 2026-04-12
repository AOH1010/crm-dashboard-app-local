import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarRange,
  Filter,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { LOAD_LIVE_DATA_EVENT } from "@/src/lib/liveDataEvents";
import { fetchOperationsUserMap, type OperationsUserMapResponse } from "@/src/lib/operationsApi";
import { readViewCache, writeViewCache } from "@/src/lib/viewCache";

const USER_MAP_CACHE_KEY_PREFIX = "crm_cache_ops_user_map";

const numberFormatter = new Intl.NumberFormat("en-US");

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

function buildUserMapCacheKey(reportMonth: string) {
  return `${USER_MAP_CACHE_KEY_PREFIX}:${reportMonth}`;
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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getCategoryShell(category: string) {
  switch (category) {
    case "Best":
      return "border-lime-200 bg-lime-50 text-lime-700";
    case "Value":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "Noise":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Ghost":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function UserMapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: OperationsUserMapResponse["quadrants"]["points"][number] }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }

  return (
    <div className="min-w-[220px] rounded-2xl border border-border bg-card text-card-foreground px-4 py-3  shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{point.account}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {point.category}
          </p>
        </div>
        <span
          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ backgroundColor: `${point.color}22`, color: point.color }}
        >
          {point.status || "N/A"}
        </span>
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        <p>Open count: <strong className="">{numberFormatter.format(point.open_cnt)}</strong></p>
        <p>Quality: <strong className="">{formatPercent(point.quality_ratio * 100)}</strong></p>
        <p>Sale owner: <strong className="">{point.sale_owner || "N/A"}</strong></p>
        <p>Latest active: <strong className="">{point.latest_active_date || "N/A"}</strong></p>
      </div>
    </div>
  );
}

export default function UserMapView() {
  const initialToday = getTodayKey();
  const [reportMonth, setReportMonth] = useState(initialToday);
  const [draftMonth, setDraftMonth] = useState(monthInputFromDate(initialToday));
  const [showFilters, setShowFilters] = useState(false);
  const [payload, setPayload] = useState<OperationsUserMapResponse | null>(null);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, startTransition] = useTransition();

  const loadUserMap = async (nextReportMonth: string) => {
    setIsRefreshing(true);
    try {
      const nextPayload = await fetchOperationsUserMap(nextReportMonth);
      const cached = writeViewCache(buildUserMapCacheKey(nextReportMonth), nextPayload);
      setPayload(nextPayload);
      setCacheSavedAt(cached.savedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load user map data.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = readViewCache<OperationsUserMapResponse>(buildUserMapCacheKey(reportMonth));
    if (cached) {
      setPayload(cached.data);
      setCacheSavedAt(cached.savedAt);
      return;
    }

    setPayload(null);
    setCacheSavedAt(null);
    void loadUserMap(reportMonth);
  }, [reportMonth]);

  useEffect(() => {
    const onLoadLiveData = () => {
      void loadUserMap(reportMonth);
    };
    window.addEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    return () => {
      window.removeEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    };
  }, [reportMonth]);

  const handleResetCurrentMonth = () => {
    const today = getTodayKey();
    startTransition(() => {
      setDraftMonth(monthInputFromDate(today));
      setReportMonth(today);
      setShowFilters(false);
    });
  };

  const handleApplyFilters = () => {
    startTransition(() => {
      setReportMonth(dateFromMonthInput(draftMonth));
      setShowFilters(false);
    });
  };

  const sortedSegments = payload?.segment_breakdown || [];
  const segmentBoardRows = useMemo(
    () => [...sortedSegments].sort((left, right) => right.share - left.share),
    [sortedSegments],
  );
  const topAccounts = useMemo(
    () => [...(payload?.quadrants.points || [])].sort((left, right) => right.open_cnt - left.open_cnt).slice(0, 5),
    [payload],
  );
  const monthLabel = formatMonthLabel(payload?.applied_filters.report_month || reportMonth);
  const totalTracked = (payload?.kpis.total_active || 0) + (payload?.kpis.total_inactive || 0);
  const activeRateValue = payload?.kpis.active_rate || 0;
  const inactiveRateValue = totalTracked > 0 ? ((payload?.kpis.total_inactive || 0) / totalTracked) * 100 : 0;
  const leadingSegment = segmentBoardRows[0] || null;
  const overviewCards = [
    {
      label: "Inactive Accounts",
      value: payload?.kpis.total_inactive || 0,
      helper: `${formatPercent(inactiveRateValue)} of tracked base`,
      icon: ShieldAlert,
      iconTone: "text-slate-500",
    },
    {
      label: "Best + Value",
      value: payload?.kpis.bv_count || 0,
      helper: "High-priority operating base",
      icon: Sparkles,
      iconTone: "text-emerald-600",
    },
    {
      label: "Noise + Ghost",
      value: payload?.kpis.ng_count || 0,
      helper: "Risk and low-value accounts",
      icon: ShieldAlert,
      iconTone: "text-amber-600",
    },
    {
      label: "Official Accounts",
      value: payload?.qa.official_accounts || 0,
      helper: `${numberFormatter.format(payload?.qa.raw_accounts_excluded || 0)} raw usernames excluded`,
      icon: ShieldAlert,
      iconTone: "text-primary",
    },
  ];

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-foreground">
            User Map
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Segment operations accounts into Best, Value, Noise, and Ghost for the selected report month.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleResetCurrentMonth}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-gray-50"
          >
            <CalendarRange className="h-4 w-4 text-primary" />
            Current month
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold shadow-sm transition-colors",
              showFilters
                ? "border-primary bg-primary/20 text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-gray-50",
            )}
          >
            <Filter className="h-4 w-4" />
            Filter month
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        {cacheSavedAt ? (
          <span>
            Dang hien cache local duoc luu luc <strong>{formatDateTime(cacheSavedAt)}</strong>. Bam <strong>Load live data</strong> tren top bar de cap nhat User Map tu server.
          </span>
        ) : (
          <span>
            Chua co cache local cho thang nay. Bam <strong>Load live data</strong> tren top bar de lay snapshot moi tu server.
          </span>
        )}
      </section>

      {showFilters ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Report month</span>
              <input
                type="month"
                value={draftMonth}
                onChange={(event) => setDraftMonth(event.target.value)}
                className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Close
              </button>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 transition-transform hover:scale-[1.01]"
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

      <section className="grid gap-4 items-start xl:grid-cols-[minmax(0,1.15fr)_0.85fr]">
        <div className="space-y-4">
          <article className="rounded-[32px] border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-primary">Operations Snapshot</p>
                <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-foreground">
                  Activation Coverage
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  How much of the official account base stayed active in {monthLabel} and where the operational mix is concentrated.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {monthLabel}
                </span>
                {payload?.as_of ? (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    As of {formatDateTime(payload.as_of)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">Active accounts</p>
                <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
                  <p className="font-headline text-5xl font-bold tracking-tight text-foreground">
                    {numberFormatter.format(payload?.kpis.total_active || 0)}
                  </p>
                  <p className="pb-2 text-sm text-muted-foreground">
                    of {numberFormatter.format(totalTracked)} tracked accounts
                  </p>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    <span>Portfolio balance</span>
                    <span>{formatPercent(activeRateValue)} active</span>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${activeRateValue}%` }} />
                    <div className="h-full bg-slate-300" style={{ width: `${Math.max(0, 100 - activeRateValue)}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{numberFormatter.format(payload?.kpis.total_active || 0)} active</span>
                    <span>{numberFormatter.format(payload?.kpis.total_inactive || 0)} inactive</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-border bg-muted/30 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">Active rate</p>
                <p className="mt-3 font-headline text-4xl font-bold tracking-tight text-primary">
                  {formatPercent(activeRateValue)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Official accounts in scope:{" "}
                  <strong className="text-foreground">{numberFormatter.format(payload?.qa.official_accounts || 0)}</strong>
                </p>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-border bg-card px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Lead segment</p>
                    {leadingSegment ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: leadingSegment.color }} />
                          <span className="font-semibold text-foreground">{leadingSegment.category}</span>
                        </div>
                        <span className="text-sm font-black" style={{ color: leadingSegment.color }}>
                          {leadingSegment.share.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No segment data available.</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Data quality</p>
                    <p className="mt-2 text-sm text-foreground">
                      {numberFormatter.format(payload?.qa.invalid_daily_rows || 0)} invalid rows
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {numberFormatter.format(payload?.qa.raw_accounts_excluded || 0)} excluded usernames outside the bridge
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <div className="grid gap-4 md:grid-cols-2">
            {overviewCards.map((card) => (
              <article key={card.label} className="rounded-[24px] border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="mt-3 font-headline text-3xl font-bold tracking-tight text-foreground">
                      {typeof card.value === "number" ? numberFormatter.format(card.value) : card.value}
                    </p>
                  </div>
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/70", card.iconTone)}>
                    <card.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{card.helper}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-[32px] border border-border bg-card text-card-foreground p-6 shadow-sm h-fit">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-primary">Segment Board</p>
              <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight">Operational Mix</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Mix of Best, Value, Noise, and Ghost inside the tracked operational base.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadUserMap(reportMonth)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-muted"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", isRefreshing ? "animate-spin" : "")} />
              Live
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {segmentBoardRows.map((segment, index) => (
              <article key={segment.category} className="rounded-[24px] border border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-foreground">{segment.category}</p>
                        {index === 0 ? (
                          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                            Lead
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {numberFormatter.format(segment.account_count)} accounts
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-headline text-2xl font-bold tracking-tight" style={{ color: segment.color }}>
                      {segment.share.toFixed(1)}%
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">share</p>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-border/80">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${Math.max(segment.share, 3)}%`, backgroundColor: segment.color }}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">Most Active Accounts</p>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Top {topAccounts.length}</p>
            </div>

            <div className="mt-3 space-y-2.5">
              {topAccounts.length > 0 ? (
                topAccounts.map((account, index) => (
                  <div
                    key={`${account.account}:${account.customer_id || "na"}:${index}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-black text-muted-foreground">
                          {index + 1}
                        </span>
                        <p className="truncate text-sm font-bold text-foreground">{account.account}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em]",
                            getCategoryShell(account.category),
                          )}
                        >
                          {account.category}
                        </span>
                        <span className="text-xs text-muted-foreground">{account.sale_owner || "Unassigned"}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-headline text-xl font-bold tracking-tight text-foreground">
                        {numberFormatter.format(account.open_cnt)}
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">opens</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No active accounts available for this slice yet.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-rose-200 bg-rose-50/70 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-700">Data Quality</p>
            <p className="mt-2 text-sm leading-relaxed text-rose-700/85">
              {numberFormatter.format(payload?.qa.invalid_daily_rows || 0)} invalid raw rows and{" "}
              {numberFormatter.format(payload?.qa.raw_accounts_excluded || 0)} excluded usernames remain outside the official activation bridge.
            </p>
          </div>
        </aside>
      </section>

      <section className="grid gap-6">
        <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-foreground">
                User Distribution
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Active accounts only. X-axis uses monthly open count and Y-axis uses quality ratio.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sortedSegments.map((segment) => (
                <span
                  key={segment.category}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-gray-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  {segment.category}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 h-[520px] rounded-xl border border-border bg-muted/50 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 18, bottom: 24, left: 4 }}>
                <CartesianGrid stroke="#E9EDF3" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="open_cnt"
                  name="Open count"
                  tickLine={false}
                  axisLine={false}
                  stroke="#98A1B2"
                  tick={{ fontSize: 12, fontWeight: 700, fill: "#98A1B2" }}
                />
                <YAxis
                  type="number"
                  dataKey="quality_ratio"
                  name="Quality"
                  tickLine={false}
                  axisLine={false}
                  stroke="#98A1B2"
                  domain={[0, 1]}
                  tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
                  tick={{ fontSize: 12, fontWeight: 700, fill: "#98A1B2" }}
                />
                <ReferenceLine
                  x={payload?.thresholds.open_high || 13}
                  stroke="#1C1D21"
                  strokeDasharray="6 6"
                  strokeOpacity={0.2}
                />
                <ReferenceLine
                  y={payload?.thresholds.quality || 0.35}
                  stroke="#1C1D21"
                  strokeDasharray="6 6"
                  strokeOpacity={0.2}
                />
                <Tooltip content={<UserMapTooltip />} cursor={{ strokeDasharray: "4 4", stroke: "#CBD5E1" }} />
                {(sortedSegments.length > 0 ? sortedSegments : [{ category: "", color: "var(--color-primary)" }]).map((segment) => (
                  <Scatter
                    key={segment.category || "all"}
                    data={(payload?.quadrants.points || []).filter((point) => point.category === segment.category)}
                    fill={segment.color}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Open threshold</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{payload?.thresholds.open_high || 13}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Quality threshold</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatPercent((payload?.thresholds.quality || 0.35) * 100)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Month</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatMonthLabel(payload?.applied_filters.report_month || reportMonth)}</p>
            </div>
          </div>
        </article>

      </section>
    </div>
  );
}
