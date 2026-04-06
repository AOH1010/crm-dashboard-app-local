import React, { useEffect, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BarChart3,
  CalendarRange,
  Filter,
  MoreVertical,
  RefreshCcw,
  TrendingUp,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { fetchDashboard, type DashboardGrain, type DashboardResponse } from "@/src/lib/dashboardApi";

interface DashboardViewProps {
  onNavigate: (id: string) => void;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatCompactCurrency(value: number) {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  return formatCurrency(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
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

function getStatusTone(statusLabel: string) {
  const text = statusLabel.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (text.includes("huy")) {
    return "bg-red-100 text-red-700";
  }
  if (text.includes("cho")) {
    return "bg-yellow-100 text-yellow-700";
  }
  return "bg-green-100 text-green-700";
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-sm font-medium text-gray-400">
      No revenue data in this range.
    </div>
  );
}

export default function DashboardView({ onNavigate }: DashboardViewProps) {
  const initialToday = getTodayKey();
  const [fromDate, setFromDate] = useState(startOfMonth(initialToday));
  const [toDate, setToDate] = useState(initialToday);
  const [grain, setGrain] = useState<DashboardGrain>("month");
  const [draftFromDate, setDraftFromDate] = useState(startOfMonth(initialToday));
  const [draftToDate, setDraftToDate] = useState(initialToday);
  const [showFilters, setShowFilters] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const payload = await fetchDashboard({
          from: fromDate,
          to: toDate,
          grain,
        });

        if (!cancelled) {
          setDashboard(payload);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard data.");
        }
      }
    }

    void loadDashboard();
    const intervalId = window.setInterval(() => {
      void loadDashboard();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [fromDate, toDate, grain]);

  const revenuePoints = dashboard?.revenue_series.points || [];
  const kpis = dashboard?.kpis;

  const handleApplyFilters = () => {
    startTransition(() => {
      setFromDate(draftFromDate);
      setToDate(draftToDate);
      setShowFilters(false);
    });
  };

  const handleResetToCurrentMonth = () => {
    const today = getTodayKey();
    const currentMonthStart = startOfMonth(today);
    startTransition(() => {
      setDraftFromDate(currentMonthStart);
      setDraftToDate(today);
      setFromDate(currentMonthStart);
      setToDate(today);
      setShowFilters(false);
    });
  };

  const handleGrainChange = (nextGrain: DashboardGrain) => {
    startTransition(() => {
      setGrain(nextGrain);
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-[#1C1D21]">
            Sales Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Current month by default. KPIs and revenue trend respond to the selected range.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleResetToCurrentMonth}
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
            Filter
          </button>
        </div>
      </div>

      {showFilters ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-ambient">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-[#1C1D21]">
                <span>From</span>
                <input
                  type="date"
                  value={draftFromDate}
                  onChange={(event) => setDraftFromDate(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#B8FF68]"
                />
              </label>

              <label className="space-y-2 text-sm font-semibold text-[#1C1D21]">
                <span>To</span>
                <input
                  type="date"
                  value={draftToDate}
                  onChange={(event) => setDraftToDate(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#B8FF68]"
                />
              </label>
            </div>

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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <KpiCard
          title="Total Revenue"
          value={formatCurrency(kpis?.total_revenue || 0)}
          subValue={`${fromDate} -> ${toDate}`}
          icon={TrendingUp}
          active
        />
        <KpiCard
          title="New Leads"
          value={String(kpis?.new_leads || 0)}
          subValue="created_at_1 in range"
          icon={UserPlus}
        />
        <KpiCard
          title="New Customers"
          value={String(kpis?.new_customers || 0)}
          subValue="first non-cancelled order"
          icon={RefreshCcw}
        />
        <KpiCard
          title="Conversion Rate"
          value={formatPercent(kpis?.conversion_rate || 0)}
          subValue="new customers / new leads"
          icon={BarChart3}
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-10">
        <div className="lg:col-span-7 flex h-full flex-col gap-6">
          <section className="rounded-2xl bg-white p-8 shadow-ambient">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#1C1D21]">Revenue Trend</h2>
                <p className="text-sm text-gray-500">
                  {dashboard?.revenue_series.compare_enabled
                    ? "Month view compares against the previous 12-month window."
                    : "Week and day views show fixed windows ending at the selected end date."}
                </p>
              </div>

              <div className="inline-flex rounded-full border border-gray-200 bg-[#F6F6F8] p-1">
                {(["month", "week", "day"] as DashboardGrain[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleGrainChange(option)}
                    className={cn(
                      "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                      grain === option ? "bg-[#1C1D21] text-[#B8FF68]" : "text-gray-500 hover:text-[#1C1D21]",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-72">
              {revenuePoints.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenuePoints}>
                    <defs>
                      <linearGradient id="dashboardRevenueCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#B8FF68" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#B8FF68" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f0f1f3" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: "#9ca3af" }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: "#9ca3af" }}
                      tickFormatter={(value) => formatCompactCurrency(Number(value))}
                      width={90}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(Number(value))}
                      labelFormatter={(label) => `Bucket: ${label}`}
                      contentStyle={{
                        border: "none",
                        borderRadius: "16px",
                        boxShadow: "0 20px 25px -5px rgba(15, 23, 42, 0.12)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="current"
                      stroke="#B8FF68"
                      strokeWidth={4}
                      fill="url(#dashboardRevenueCurrent)"
                      activeDot={{ r: 5, fill: "#B8FF68", stroke: "#fff", strokeWidth: 2 }}
                    />
                    {dashboard?.revenue_series.compare_enabled ? (
                      <Line
                        type="monotone"
                        dataKey="previous"
                        stroke="#acadaf"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                      />
                    ) : null}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-ambient">
            <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#1C1D21]">Latest Orders Feed</h2>
                <p className="text-sm text-gray-500">Realtime list, independent from KPI filters. Refresh target: every 5 minutes.</p>
              </div>
              <div className="rounded-full bg-[#B8FF68]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#3c6600]">
                {isPending ? "Refreshing..." : "Live"}
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead className="border-b border-gray-100 bg-gray-50/30">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Customer</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Order Time</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Amount</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Seller</th>
                    <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dashboard?.recent_orders?.map((order) => (
                    <tr key={order.order_id} className="transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-[11px] font-black text-gray-500">
                            {order.customer_title.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-[#1C1D21]">{order.customer_title}</div>
                            <div className="text-[11px] text-gray-500">
                              {order.order_code || order.customer_id || `Order #${order.order_id}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-gray-500">{formatDateTime(order.created_at)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-[#1C1D21]">{formatCurrency(order.amount)}</td>
                      <td className="px-6 py-4 text-xs font-medium text-gray-500">{order.seller_name}</td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                            getStatusTone(order.status_label),
                          )}
                        >
                          {order.status_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="lg:col-span-3 flex h-full flex-col rounded-2xl bg-[#1C1D21] p-6 shadow-xl">
          <div className="mb-8">
            <h2 className="text-xl font-bold text-[#B8FF68]">Top 5 Sales</h2>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-400">
              leaderboard for selected month
            </p>
          </div>

          <div className="flex-1 space-y-4">
            {dashboard?.leaderboard?.map((entry) => (
              <div key={`${entry.rank}-${entry.seller_name}`} className="rounded-2xl border border-white/5 bg-white/5 p-3.5">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">#{entry.rank}</p>
                    <p className="mt-1 text-sm font-bold text-white">{entry.seller_name}</p>
                    <p className="text-xs text-zinc-400">{entry.team_name}</p>
                  </div>
                  <button className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="text-zinc-400">{entry.order_count} orders</span>
                  <span className="text-[#B8FF68]">{formatCompactCurrency(entry.revenue_amount)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-white/5 pt-5">
            <button
              type="button"
              onClick={() => onNavigate("team")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#B8FF68]/30 py-3 text-xs font-bold uppercase tracking-[0.25em] text-[#B8FF68] transition-colors hover:bg-[#B8FF68]/10"
            >
              Team details
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subValue,
  icon: Icon,
  active = false,
}: {
  title: string;
  value: string;
  subValue: string;
  icon: React.ElementType;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border-b-4 bg-white p-6 shadow-ambient transition-transform hover:-translate-y-0.5",
        active ? "border-[#B8FF68]" : "border-transparent",
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={cn("rounded-xl p-2.5", active ? "bg-[#B8FF68]/20" : "bg-gray-100")}>
          <Icon className={cn("h-5 w-5", active ? "text-[#3c6600]" : "text-gray-500")} />
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
          live
        </span>
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">{title}</p>
      <h3 className="mt-2 text-3xl font-extrabold text-[#1C1D21]">{value}</h3>
      <p className="mt-2 text-xs font-medium text-gray-500">{subValue}</p>
    </div>
  );
}
