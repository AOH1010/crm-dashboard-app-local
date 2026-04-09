import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarRange,
  Filter,
  ShieldCheck,
  TimerReset,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { LOAD_LIVE_DATA_EVENT } from "@/src/lib/liveDataEvents";
import {
  fetchOperationsActiveMap,
  type OperationsActiveMapResponse,
  type TenureBucket,
} from "@/src/lib/operationsApi";
import { readViewCache, writeViewCache } from "@/src/lib/viewCache";

const ACTIVE_MAP_CACHE_KEY_PREFIX = "crm_cache_ops_active_map";
const TENURE_BUCKETS: Array<{ key: TenureBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "0-3", label: "0-3 months" },
  { key: "3-6", label: "3-6 months" },
  { key: "6-9", label: "6-9 months" },
  { key: "9-12", label: "9-12 months" },
  { key: "12+", label: "12+ months" },
];

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

function buildActiveMapCacheKey(reportMonth: string, tenureBucket: TenureBucket) {
  return `${ACTIVE_MAP_CACHE_KEY_PREFIX}:${reportMonth}:${tenureBucket}`;
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

function formatDate(value: string | null) {
  if (!value) {
    return "N/A";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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

function getCategoryTone(category: string) {
  switch (category) {
    case "Best":
      return "border-[#B8FF68]/45 bg-[#B8FF68]/12 text-[#416113]";
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

function getStatusTone(status: string | null) {
  if (status === "Active") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "Inactive") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-slate-100 text-slate-600";
}

export default function ActiveMapView() {
  const initialToday = getTodayKey();
  const [reportMonth, setReportMonth] = useState(initialToday);
  const [draftMonth, setDraftMonth] = useState(monthInputFromDate(initialToday));
  const [showFilters, setShowFilters] = useState(false);
  const [tenureBucket, setTenureBucket] = useState<TenureBucket>("all");
  const [payload, setPayload] = useState<OperationsActiveMapResponse | null>(null);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadActiveMap = async (nextReportMonth: string, nextTenureBucket: TenureBucket) => {
    try {
      const nextPayload = await fetchOperationsActiveMap({
        reportMonth: nextReportMonth,
        tenureBucket: nextTenureBucket,
      });
      const cached = writeViewCache(buildActiveMapCacheKey(nextReportMonth, nextTenureBucket), nextPayload);
      setPayload(nextPayload);
      setCacheSavedAt(cached.savedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load active map data.");
    }
  };

  useEffect(() => {
    const cached = readViewCache<OperationsActiveMapResponse>(buildActiveMapCacheKey(reportMonth, tenureBucket));
    if (cached) {
      setPayload(cached.data);
      setCacheSavedAt(cached.savedAt);
      return;
    }
    setPayload(null);
    setCacheSavedAt(null);
    void loadActiveMap(reportMonth, tenureBucket);
  }, [reportMonth, tenureBucket]);

  useEffect(() => {
    const onLoadLiveData = () => {
      void loadActiveMap(reportMonth, tenureBucket);
    };
    window.addEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    return () => {
      window.removeEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    };
  }, [reportMonth, tenureBucket]);

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

  const riskRows = useMemo(
    () => (payload?.rows || []).filter((row) => row.category === "Ghost" || row.category === "Noise").slice(0, 6),
    [payload],
  );

  const tableRows = useMemo(() => (payload?.rows || []).slice(0, 18), [payload]);

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-[#1C1D21]">
            Active Map
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor activation-rooted accounts by tenure, current active status, and usage quality.
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
            Dang hien cache local duoc luu luc <strong>{formatDateTime(cacheSavedAt)}</strong>. Bam <strong>Load live data</strong> tren top bar de cap nhat Active Map tu server.
          </span>
        ) : (
          <span>
            Chua co cache local cho bo loc nay. Bam <strong>Load live data</strong> tren top bar de lay snapshot moi tu server.
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

      <section className="rounded-[30px] border border-gray-100 bg-white p-4 shadow-ambient">
        <div className="flex flex-wrap gap-2">
          {TENURE_BUCKETS.map((bucket) => (
            <button
              key={bucket.key}
              type="button"
              onClick={() => setTenureBucket(bucket.key)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-all",
                tenureBucket === bucket.key
                  ? "bg-[#1C1D21] text-[#B8FF68] shadow-lg shadow-black/10"
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-[#1C1D21]",
              )}
            >
              {bucket.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Tracked Accounts",
              value: payload?.kpis.tracked_accounts || 0,
              helper: formatMonthLabel(payload?.applied_filters.report_month || reportMonth),
              icon: ShieldCheck,
            },
            {
              label: "Active Accounts",
              value: payload?.kpis.active_accounts || 0,
              helper: formatPercent(payload?.kpis.active_rate || 0),
              icon: TimerReset,
            },
            {
              label: "Risk Accounts",
              value: payload?.kpis.risk_accounts || 0,
              helper: "Ghost + Noise in current slice",
              icon: AlertTriangle,
            },
            {
              label: "Avg Quality",
              value: `${((payload?.kpis.avg_quality || 0) * 100).toFixed(1)}%`,
              helper: "Average quality ratio",
              icon: ShieldCheck,
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
                    "text-[11px] font-black uppercase tracking-[0.22em]",
                    card.dark ? "text-white/40" : "text-gray-400",
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
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
              <p className={cn("mt-6 text-sm", card.dark ? "text-white/60" : "text-gray-500")}>{card.helper}</p>
            </article>
          ))}
        </div>

        <aside className="rounded-[32px] border border-white/5 bg-[#1C1D21] p-7 text-white shadow-2xl">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#B8FF68]">Risk Queue</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight">Priority Follow-up</h2>
          <p className="mt-2 text-sm text-white/55">
            Highest-risk accounts in {TENURE_BUCKETS.find((bucket) => bucket.key === tenureBucket)?.label || "All"} for {formatMonthLabel(payload?.applied_filters.report_month || reportMonth)}.
          </p>

          <div className="mt-6 space-y-3">
            {riskRows.length === 0 ? (
              <div className="rounded-[22px] border border-white/8 bg-white/5 p-5 text-sm text-white/60">
                No Ghost or Noise accounts in this tenure slice.
              </div>
            ) : (
              riskRows.map((row) => (
                <article key={row.account} className="rounded-[22px] border border-white/8 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">{row.account}</p>
                      <p className="mt-1 text-sm text-white/55">{row.sale_owner || "Unassigned owner"}</p>
                    </div>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]", getCategoryTone(row.category))}>
                      {row.category}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl bg-black/15 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Latest active</p>
                      <p className="mt-1 font-bold text-white">{row.latest_active_date || "N/A"}</p>
                    </div>
                    <div className="rounded-2xl bg-black/15 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Quality</p>
                      <p className="mt-1 font-bold text-white">{formatPercent(row.quality_ratio * 100)}</p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>
      </section>

      <section className="rounded-[36px] border border-gray-100 bg-white p-7 shadow-ambient">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-[#1C1D21]">
              Account Monitoring Table
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Revenue is not shown here. This table focuses on active quality, category, and expiry readiness.
            </p>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-gray-400">
            {numberFormatter.format(payload?.rows.length || 0)} rows in slice
          </p>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[1180px] w-full border-separate border-spacing-y-3">
            <thead>
              <tr>
                {["Account", "Owner", "Type", "Activation", "Expiry", "Open", "Quality", "Status", "Category", "Latest active"].map((header) => (
                  <th key={header} className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={`${row.account}:${row.customer_id || "na"}`}>
                  <td className="rounded-l-[22px] border-y border-l border-gray-100 bg-[#FBFCFE] px-3 py-4">
                    <p className="font-bold text-[#1C1D21]">{row.account}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.customer_id || "No customer ID"}</p>
                  </td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4 text-sm text-gray-600">{row.sale_owner || "Unassigned"}</td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4 text-sm text-gray-600">{row.account_type || row.customer_type || "N/A"}</td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4 text-sm text-gray-600">{formatDate(row.activation_date)}</td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4 text-sm text-gray-600">{formatDate(row.expiry_date)}</td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4">
                    <div className="flex items-center gap-3">
                      <span className="min-w-[42px] text-sm font-bold text-[#1C1D21]">{numberFormatter.format(row.open_cnt)}</span>
                      <div className="h-2 flex-1 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-[#B8FF68] to-[#D7F59D]"
                          style={{ width: `${Math.min(100, row.open_cnt * 4)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4 text-sm font-bold text-[#1C1D21]">{formatPercent(row.quality_ratio * 100)}</td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4">
                    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]", getStatusTone(row.status))}>
                      {row.status || "N/A"}
                    </span>
                  </td>
                  <td className="border-y border-gray-100 bg-[#FBFCFE] px-3 py-4">
                    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]", getCategoryTone(row.category))}>
                      {row.category}
                    </span>
                  </td>
                  <td className="rounded-r-[22px] border-y border-r border-gray-100 bg-[#FBFCFE] px-3 py-4 text-sm text-gray-600">
                    {row.latest_active_date || "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
