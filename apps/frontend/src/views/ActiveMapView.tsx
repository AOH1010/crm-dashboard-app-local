import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarRange,
  Filter,
  ShieldCheck,
  TimerReset,
  X,
  Download,
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
      return "border-primary/45 bg-primary/12 text-[#416113]";
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

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  
  const allRows = useMemo(() => payload?.rows || [], [payload]);
  const totalPages = Math.ceil(allRows.length / rowsPerPage) || 1;
  const tableRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return allRows.slice(start, start + rowsPerPage);
  }, [allRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [payload]);

  const handleExportCsv = () => {
    if (allRows.length === 0) return;
    const headers = ["Account", "Owner", "Type", "Customer ID", "Activation", "Expiry", "Open Count", "Quality Ratio", "Status", "Category", "Latest Active"];
    const csvContent = [
      headers.join(","),
      ...allRows.map(row => [
        `"${row.account || ''}"`,
        `"${row.sale_owner || ''}"`,
        `"${row.account_type || row.customer_type || ''}"`,
        `"${row.customer_id || ''}"`,
        `"${row.activation_date || ''}"`,
        `"${row.expiry_date || ''}"`,
        row.open_cnt || 0,
        row.quality_ratio || 0,
        `"${row.status || ''}"`,
        `"${row.category || ''}"`,
        `"${row.latest_active_date || ''}"`
      ].join(","))
    ].join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `active_accounts_${reportMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-foreground">
            Active Map
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor activation-rooted accounts by tenure, current active status, and usage quality.
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
            Dang hien cache local duoc luu luc <strong>{formatDateTime(cacheSavedAt)}</strong>. Bam <strong>Load live data</strong> tren top bar de cap nhat Active Map tu server.
          </span>
        ) : (
          <span>
            Chua co cache local cho bo loc nay. Bam <strong>Load live data</strong> tren top bar de lay snapshot moi tu server.
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

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TENURE_BUCKETS.map((bucket) => (
            <button
              key={bucket.key}
              type="button"
              onClick={() => setTenureBucket(bucket.key)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-all",
                tenureBucket === bucket.key
                  ? "bg-card text-card-foreground text-primary shadow-sm shadow-black/10"
                  : "bg-gray-50 text-muted-foreground hover:bg-gray-100 hover:text-foreground",
              )}
            >
              {bucket.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 items-start ">
        <div className="grid gap-4 content-start md:grid-cols-2 xl:grid-cols-4">
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
                "rounded-xl border p-4 shadow-sm flex flex-col justify-between",
                card.dark ? "border-border bg-card text-foreground" : "border-border bg-card text-foreground",
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn(
                      "text-[10px] font-bold uppercase tracking-wider",
                      card.dark ? "text-muted-foreground" : "text-muted-foreground",
                    )}>
                      {card.label}
                    </p>
                    <p className="mt-1 font-headline text-2xl font-bold tracking-tight">
                      {typeof card.value === "number" ? numberFormatter.format(card.value) : card.value}
                    </p>
                  </div>
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    card.dark ? "bg-muted text-primary" : "bg-muted text-foreground",
                  )}>
                    <card.icon className="h-4 w-4" />
                  </div>
                </div>
              </div>
              <p className={cn("mt-2 text-xs", card.dark ? "text-muted-foreground" : "text-muted-foreground")}>{card.helper}</p>
            </article>
          ))}
        </div>


      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-foreground">
              Account Monitoring Table
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Revenue is not shown here. This table focuses on active quality, category, and expiry readiness.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
              {numberFormatter.format(allRows.length)} rows in slice
            </p>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {["Account", "Owner", "Type", "Activation", "Expiry", "Open", "Quality", "Status", "Category", "Latest active"].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={`${row.account}:${row.customer_id || "na"}`} className="border-b border-border hover:bg-gray-50 transition-colors last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-bold text-foreground">{row.account}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.customer_id || "No customer ID"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.sale_owner || "Unassigned"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.account_type || row.customer_type || "N/A"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatDate(row.activation_date)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatDate(row.expiry_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="min-w-[42px] font-bold text-foreground">{numberFormatter.format(row.open_cnt)}</span>
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${Math.min(100, (row.open_cnt / 50) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">{formatPercent(row.quality_ratio * 100)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", getStatusTone(row.status))}>
                        {row.status || "N/A"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", getCategoryTone(row.category))}>
                        {row.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {row.latest_active_date || "N/A"}
                    </td>
                  </tr>
                ))}
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Không có tài khoản nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
            <p className="text-[13px] text-muted-foreground">
              Đang hiển thị trang <span className="font-bold text-foreground">{currentPage}</span> / <span className="font-bold text-foreground">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Trước
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
