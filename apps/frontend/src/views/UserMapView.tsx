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
      return "border-[#B8FF68]/50 bg-[#F5FFDF] text-[#416113]";
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
    <div className="min-w-[220px] rounded-2xl border border-white/10 bg-[#1C1D21] px-4 py-3 text-white shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{point.account}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-white/45">
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
      <div className="mt-3 space-y-1.5 text-xs text-white/70">
        <p>Open count: <strong className="text-white">{numberFormatter.format(point.open_cnt)}</strong></p>
        <p>Quality: <strong className="text-white">{formatPercent(point.quality_ratio * 100)}</strong></p>
        <p>Sale owner: <strong className="text-white">{point.sale_owner || "N/A"}</strong></p>
        <p>Latest active: <strong className="text-white">{point.latest_active_date || "N/A"}</strong></p>
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
  const topAccounts = useMemo(
    () => [...(payload?.quadrants.points || [])].sort((left, right) => right.open_cnt - left.open_cnt).slice(0, 5),
    [payload],
  );

  const totalTracked = (payload?.kpis.total_active || 0) + (payload?.kpis.total_inactive || 0);

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-[#1C1D21]">
            User Map
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Segment operations accounts into Best, Value, Noise, and Ghost for the selected report month.
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
            Dang hien cache local duoc luu luc <strong>{formatDateTime(cacheSavedAt)}</strong>. Bam <strong>Load live data</strong> tren top bar de cap nhat User Map tu server.
          </span>
        ) : (
          <span>
            Chua co cache local cho thang nay. Bam <strong>Load live data</strong> tren top bar de lay snapshot moi tu server.
          </span>
        )}
      </section>

      {showFilters ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-ambient">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <label className="space-y-2 text-sm font-semibold text-[#1C1D21]">
              <span>Report month</span>
              <input
                type="month"
                value={draftMonth}
                onChange={(event) => setDraftMonth(event.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#B8FF68]"
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

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              label: "Total Active",
              value: payload?.kpis.total_active || 0,
              helper: `${formatMonthLabel(payload?.applied_filters.report_month || reportMonth)}`,
              accent: "from-[#B8FF68] to-[#DDF9A5]",
            },
            {
              label: "Total Inactive",
              value: payload?.kpis.total_inactive || 0,
              helper: `${totalTracked > 0 ? formatPercent(((payload?.kpis.total_inactive || 0) / totalTracked) * 100) : "0.0%"}`,
              accent: "from-[#FFB95C] to-[#FFD9A0]",
            },
            {
              label: "Active Rate",
              value: `${(payload?.kpis.active_rate || 0).toFixed(1)}%`,
              helper: `${numberFormatter.format(totalTracked)} tracked accounts`,
              accent: "from-sky-400 to-cyan-300",
            },
            {
              label: "Best + Value",
              value: payload?.kpis.bv_count || 0,
              helper: "High-priority operating base",
              accent: "from-emerald-400 to-lime-300",
            },
            {
              label: "Noise + Ghost",
              value: payload?.kpis.ng_count || 0,
              helper: "Risk and low-value accounts",
              accent: "from-rose-400 to-orange-300",
            },
            {
              label: "Official Accounts",
              value: payload?.qa.official_accounts || 0,
              helper: `${numberFormatter.format(payload?.qa.raw_accounts_excluded || 0)} raw usernames excluded`,
              accent: "from-[#1C1D21] to-[#46484F]",
              dark: true,
            },
          ].map((card) => (
            <article
              key={card.label}
              className={cn(
                "rounded-[28px] border p-6 shadow-ambient",
                card.dark ? "border-[#1C1D21] bg-[#1C1D21] text-white" : "border-gray-100 bg-white text-[#1C1D21]",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn(
                    "text-[11px] font-black uppercase tracking-[0.24em]",
                    card.dark ? "text-white/45" : "text-gray-400",
                  )}>
                    {card.label}
                  </p>
                  <p className="mt-3 font-headline text-4xl font-bold tracking-tight">
                    {typeof card.value === "number" ? numberFormatter.format(card.value) : card.value}
                  </p>
                </div>
                <div className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-2xl",
                  card.dark ? "bg-white/8 text-[#B8FF68]" : "bg-gray-50 text-[#1C1D21]",
                )}>
                  {card.label === "Official Accounts" ? <ShieldAlert className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                </div>
              </div>
              <p className={cn("mt-6 text-sm", card.dark ? "text-white/65" : "text-gray-500")}>{card.helper}</p>
              <div className={cn("mt-5 h-1.5 rounded-full", card.dark ? "bg-white/10" : "bg-gray-100")}>
                <div className={cn("h-1.5 rounded-full bg-gradient-to-r", card.accent)} style={{ width: "100%" }} />
              </div>
            </article>
          ))}
        </div>

        <aside className="rounded-[32px] border border-white/5 bg-[#1C1D21] p-7 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#B8FF68]">Segment Board</p>
              <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight">Operational Mix</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadUserMap(reportMonth)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-[0.22em] text-white/70 transition-colors hover:bg-white/10"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", isRefreshing ? "animate-spin" : "")} />
              Live
            </button>
          </div>

          <div className="mt-8 space-y-4">
            {sortedSegments.map((segment) => (
              <article key={segment.category} className="rounded-[24px] border border-white/6 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                    <div>
                      <p className="font-bold">{segment.category}</p>
                      <p className="text-xs text-white/45">{numberFormatter.format(segment.account_count)} accounts</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-[#B8FF68]">{segment.share.toFixed(1)}%</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${Math.max(segment.share, 4)}%`, backgroundColor: segment.color }}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-[24px] border border-rose-400/20 bg-rose-400/10 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-200">Data Quality</p>
            <p className="mt-2 text-sm text-white/75">
              {numberFormatter.format(payload?.qa.invalid_daily_rows || 0)} invalid raw rows and{" "}
              {numberFormatter.format(payload?.qa.raw_accounts_excluded || 0)} excluded usernames remain outside the official activation bridge.
            </p>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-[36px] border border-gray-100 bg-white p-8 shadow-ambient">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-[#1C1D21]">
                User Distribution
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Active accounts only. X-axis uses monthly open count and Y-axis uses quality ratio.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sortedSegments.map((segment) => (
                <span
                  key={segment.category}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-gray-600"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  {segment.category}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 h-[520px] rounded-[28px] border border-gray-100 bg-[#FBFCFE] p-5">
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
                {(sortedSegments.length > 0 ? sortedSegments : [{ category: "", color: "#B8FF68" }]).map((segment) => (
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
            <div className="rounded-2xl border border-gray-100 bg-[#F9FBF7] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Open threshold</p>
              <p className="mt-2 text-2xl font-bold text-[#1C1D21]">{payload?.thresholds.open_high || 13}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-[#F8FAFF] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Quality threshold</p>
              <p className="mt-2 text-2xl font-bold text-[#1C1D21]">{formatPercent((payload?.thresholds.quality || 0.35) * 100)}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-[#FFF9F3] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Month</p>
              <p className="mt-2 text-2xl font-bold text-[#1C1D21]">{formatMonthLabel(payload?.applied_filters.report_month || reportMonth)}</p>
            </div>
          </div>
        </article>

        <aside className="rounded-[36px] border border-white/5 bg-[#1C1D21] p-7 text-white shadow-2xl">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/35">Top Active Accounts</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight">Top by Open Count</h2>
          <p className="mt-2 text-sm text-white/55">
            Highest-usage accounts inside the active operating base for {formatMonthLabel(payload?.applied_filters.report_month || reportMonth)}.
          </p>

          <div className="mt-6 space-y-4">
            {topAccounts.map((account, index) => (
              <article key={account.account} className="rounded-[24px] border border-white/6 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">#{index + 1}</p>
                    <h3 className="mt-2 text-xl font-bold">{account.account}</h3>
                    <p className="mt-1 text-sm text-white/55">{account.sale_owner || "Unassigned owner"}</p>
                  </div>
                  <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]", getCategoryShell(account.category))}>
                    {account.category}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-black/15 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Open</p>
                    <p className="mt-1 text-lg font-bold text-[#B8FF68]">{numberFormatter.format(account.open_cnt)}</p>
                  </div>
                  <div className="rounded-2xl bg-black/15 px-3 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Quality</p>
                    <p className="mt-1 text-lg font-bold text-white">{formatPercent(account.quality_ratio * 100)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
