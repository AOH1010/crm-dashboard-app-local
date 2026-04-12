import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  CalendarRange,
  Filter,
  RefreshCcw,
  RotateCcw,
  Timer,
  X,
  Download,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { LOAD_LIVE_DATA_EVENT } from "@/src/lib/liveDataEvents";
import { fetchOperationsRenew, type OperationsRenewResponse } from "@/src/lib/operationsApi";
import { readViewCache, writeViewCache } from "@/src/lib/viewCache";

const RENEW_CACHE_KEY_PREFIX = "crm_cache_ops_renew";
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

function buildRenewCacheKey(reportMonth: string, year: number) {
  return `${RENEW_CACHE_KEY_PREFIX}:${reportMonth}:${year}`;
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

function RenewTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground px-4 py-3  shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <div className="mt-3 space-y-2 text-sm">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color || "#fff" }} />
              <span className="text-muted-foreground">{entry.dataKey === "due_count" ? "Due" : "Renewed"}</span>
            </div>
            <span className="font-bold ">{numberFormatter.format(Number(entry.value || 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

export default function RenewView() {
  const initialToday = getTodayKey();
  const [reportMonth, setReportMonth] = useState(initialToday);
  const [draftMonth, setDraftMonth] = useState(monthInputFromDate(initialToday));
  const [showFilters, setShowFilters] = useState(false);
  const [selectedYear, setSelectedYear] = useState(Number.parseInt(initialToday.slice(0, 4), 10));
  const [draftYear, setDraftYear] = useState(Number.parseInt(initialToday.slice(0, 4), 10));
  const [payload, setPayload] = useState<OperationsRenewResponse | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [, startTransition] = useTransition();

  const loadRenew = async (nextReportMonth: string, nextYear: number) => {
    try {
      const nextPayload = await fetchOperationsRenew({
        reportMonth: nextReportMonth,
        year: nextYear,
      });
      const cached = writeViewCache(buildRenewCacheKey(nextReportMonth, nextYear), nextPayload);
      setPayload(nextPayload);
      setCacheSavedAt(cached.savedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load renew data.");
    }
  };

  useEffect(() => {
    const cached = readViewCache<OperationsRenewResponse>(buildRenewCacheKey(reportMonth, selectedYear));
    if (cached) {
      setPayload(cached.data);
      setCacheSavedAt(cached.savedAt);
      return;
    }
    setPayload(null);
    setCacheSavedAt(null);
    void loadRenew(reportMonth, selectedYear);
  }, [reportMonth, selectedYear]);

  useEffect(() => {
    setCurrentPage(1);
  }, [payload]);

  useEffect(() => {
    const onLoadLiveData = () => {
      void loadRenew(reportMonth, selectedYear);
    };
    window.addEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    return () => {
      window.removeEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    };
  }, [reportMonth, selectedYear]);

  useEffect(() => {
    const accounts = payload?.expiring_accounts || [];
    if (accounts.length === 0) {
      setSelectedAccount(null);
      return;
    }

    if (selectedAccount && accounts.some((account) => account.account === selectedAccount)) {
      return;
    }

    setSelectedAccount(accounts[0].account);
  }, [payload, selectedAccount]);

  const handleResetCurrentMonth = () => {
    const today = getTodayKey();
    const year = Number.parseInt(today.slice(0, 4), 10);
    startTransition(() => {
      setDraftMonth(monthInputFromDate(today));
      setReportMonth(today);
      setSelectedYear(year);
      setDraftYear(year);
      setShowFilters(false);
    });
  };

  const handleApplyFilters = () => {
    startTransition(() => {
      setReportMonth(dateFromMonthInput(draftMonth));
      setSelectedYear(draftYear);
      setShowFilters(false);
    });
  };

  const selectedAccountDetail = (payload?.expiring_accounts || []).find((account) => account.account === selectedAccount)
    || payload?.expiring_accounts?.[0]
    || null;

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    (payload?.chart.points || []).forEach((point) => {
      years.add(Number.parseInt(point.month_key.slice(0, 4), 10));
    });
    years.add(selectedYear);
    return [...years].sort((left, right) => right - left);
  }, [payload, selectedYear]);

  const allRows = useMemo(() => payload?.expiring_accounts || [], [payload]);
  const totalPages = Math.ceil(allRows.length / rowsPerPage) || 1;
  const tableRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return allRows.slice(start, start + rowsPerPage);
  }, [allRows, currentPage]);

  const handleExportCsv = () => {
    if (allRows.length === 0) return;
    const headers = ["Account", "Owner", "Expiry", "Days Left", "Current Category", "Previous Category"];
    const csvContent = [
      headers.join(","),
      ...allRows.map(row => [
        `"${row.account || ''}"`,
        `"${row.sale_owner || ''}"`,
        `"${row.expiry_date || ''}"`,
        row.days_left || 0,
        `"${row.current_category || ''}"`,
        `"${row.previous_category || ''}"`
      ].join(","))
    ].join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `expiring_accounts_${reportMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-foreground">
            Renew
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track renewal due batches, renewal success, and accounts expiring soon from operations data.
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
            Dang hien cache local duoc luu luc <strong>{formatDateTime(cacheSavedAt)}</strong>. Bam <strong>Load live data</strong> tren top bar de cap nhat Renew tu server.
          </span>
        ) : (
          <span>
            Chua co cache local cho bo loc nay. Bam <strong>Load live data</strong> tren top bar de lay snapshot moi tu server.
          </span>
        )}
      </section>

      {showFilters ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Report month</span>
              <input
                type="month"
                value={draftMonth}
                onChange={(event) => setDraftMonth(event.target.value)}
                className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>

            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Chart year</span>
              <select
                value={draftYear}
                onChange={(event) => setDraftYear(Number.parseInt(event.target.value, 10))}
                className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
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

      <section className="grid gap-4 items-start">
        <div className="grid gap-4 content-start md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Due This Month",
              value: payload?.kpis.due_count || 0,
              helper: formatMonthLabel(payload?.applied_filters.report_month || reportMonth),
              icon: CalendarDays,
            },
            {
              label: "Renewed",
              value: payload?.kpis.renewed_count || 0,
              helper: "Same due batch renewed",
              icon: RotateCcw,
            },
            {
              label: "Renewal Rate",
              value: formatPercent(payload?.kpis.renewal_rate || 0),
              helper: "Renewed / due",
              icon: RefreshCcw,
            },
            {
              label: "Expired Pending",
              value: payload?.kpis.expired_pending || 0,
              helper: "Due but not renewed yet",
              icon: Timer,
              dark: true,
            },
          ].map((card) => (
            <article
              key={card.label}
              className={cn(
                "rounded-xl border p-4 shadow-sm flex flex-col justify-between",
                card.dark ? "border-border bg-card text-foreground " : "border-border bg-card text-foreground",
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
              Renewal Progress
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Due vs renewed by month for {selectedYear}. The current month bar is highlighted in black.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
            {selectedYear}
          </div>
        </div>

        <div className="mt-8 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={payload?.chart.points || []} barGap={8}>
              <CartesianGrid stroke="#E9EDF3" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fontWeight: 700, fill: "#98A1B2" }}
              />
              <YAxis hide />
              <Tooltip content={<RenewTooltip />} cursor={{ fill: "#F8FAFC" }} />
              <Bar dataKey="due_count" radius={[8, 8, 8, 8]} fill="#E5E7EB" />
              <Bar dataKey="renewed_count" radius={[8, 8, 8, 8]} fill="var(--color-primary)">
                {(payload?.chart.points || []).map((point) => (
                  <Cell
                    key={point.month_key}
                    fill={point.current ? "#1C1D21" : "var(--color-primary)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <article className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-headline text-[length:var(--font-size-h-bento)] font-bold tracking-tight text-foreground">
                Due Accounts
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Accounts due for renewal, sorted by nearest expiry date.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                {numberFormatter.format(allRows.length)} rows
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
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {["Account", "Owner", "Expiry", "Days left", "Current category", "Previous category"].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr
                      key={row.account}
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors last:border-0",
                        selectedAccount === row.account ? "bg-primary/5" : "hover:bg-gray-50"
                      )}
                      onClick={() => setSelectedAccount(row.account)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-foreground">{row.account}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{row.customer_id || "No customer ID"}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{row.sale_owner || "Unassigned"}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{formatDate(row.expiry_date)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-foreground">{row.days_left} days</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", getCategoryTone(row.current_category))}>
                          {row.current_category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", getCategoryTone(row.previous_category))}>
                          {row.previous_category}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {tableRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Không có tài khoản nào sắp hết hạn.
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
        </article>

        <aside className="rounded-xl border border-border bg-card text-card-foreground p-6  shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-primary">Selected Account</p>
          <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight">
            {selectedAccountDetail?.account || "No account selected"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Detailed renewal context with category history over the latest 12 months.
          </p>

          {selectedAccountDetail ? (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-[22px] bg-muted p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Owner</p>
                  <p className="mt-2 text-sm font-semibold ">{selectedAccountDetail.sale_owner || "Unassigned"}</p>
                </div>
                <div className="rounded-[22px] bg-muted p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Type</p>
                  <p className="mt-2 text-sm font-semibold ">{selectedAccountDetail.account_type || selectedAccountDetail.customer_type || "N/A"}</p>
                </div>
                <div className="rounded-[22px] bg-muted p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Activation</p>
                  <p className="mt-2 text-sm font-semibold ">{formatDate(selectedAccountDetail.activation_date)}</p>
                </div>
                <div className="rounded-[22px] bg-muted p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Expiry</p>
                  <p className="mt-2 text-sm font-semibold ">{formatDate(selectedAccountDetail.expiry_date)}</p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-muted p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Contract term</p>
                <p className="mt-2 text-sm text-muted-foreground">{selectedAccountDetail.contract_term || "N/A"}</p>
              </div>

              <div className="mt-6">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Category history</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {selectedAccountDetail.category_history.map((item) => (
                    <div key={item.month_key} className="rounded-2xl border border-border bg-muted px-3 py-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                      <span className={cn("mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]", getCategoryTone(item.category))}>
                        {item.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-border bg-muted p-5 text-sm text-muted-foreground">
              No expiring account is available in the current 10-day window.
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
