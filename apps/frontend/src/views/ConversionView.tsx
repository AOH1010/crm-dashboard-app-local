import React, { useEffect, useRef, useState, useTransition } from "react";
import {
  CalendarRange,
  ChevronDown,
  Filter,
  Grid3X3,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { fetchConversion, type CohortGrain, type ConversionResponse } from "@/src/lib/conversionApi";
import { LOAD_LIVE_DATA_EVENT } from "@/src/lib/liveDataEvents";
import { readViewCache, writeViewCache } from "@/src/lib/viewCache";

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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function buildConversionCacheKey(params: {
  from: string;
  to: string;
  cohortGrain: CohortGrain;
  sourceGroups: string[] | null;
}) {
  const sourceKey = params.sourceGroups === null ? "all" : [...params.sourceGroups].sort().join("|") || "none";
  return `crm_cache_conversion:${params.from}:${params.to}:${params.cohortGrain}:${sourceKey}`;
}

function getCellBackground(rate: number | null) {
  if (rate === null) {
    return "bg-muted/30 text-muted-foreground";
  }
  if (rate >= 25) {
    return "bg-primary text-primary-foreground";
  }
  if (rate >= 10) {
    return "bg-primary/40 text-foreground";
  }
  if (rate > 0) {
    return "bg-primary/20 text-foreground";
  }
  return "bg-muted/50 text-muted-foreground";
}

export default function ConversionView() {
  const initialToday = getTodayKey();
  const [fromDate, setFromDate] = useState(startOfMonth(initialToday));
  const [toDate, setToDate] = useState(initialToday);
  const [draftFromDate, setDraftFromDate] = useState(startOfMonth(initialToday));
  const [draftToDate, setDraftToDate] = useState(initialToday);
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [showSourceFilters, setShowSourceFilters] = useState(false);
  const [cohortGrain, setCohortGrain] = useState<CohortGrain>("month");
  const [conversion, setConversion] = useState<ConversionResponse | null>(null);
  const [selectedSourceGroups, setSelectedSourceGroups] = useState<string[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, startTransition] = useTransition();
  const skipFirstFetchRef = useRef(true);

  const availableSourceGroups = conversion?.source_group_options || ["Marketing Ads", "Marketing Other", "Event", "Affiliate", "Sale", "Other"];
  const activeSourceGroups = selectedSourceGroups === null ? availableSourceGroups : selectedSourceGroups;

  const loadConversion = async (params: {
    from: string;
    to: string;
    cohortGrain: CohortGrain;
    sourceGroups: string[] | null;
  }) => {
    setIsRefreshing(true);
    try {
      const payload = await fetchConversion(params);
      const cached = writeViewCache(buildConversionCacheKey(params), payload);
      setConversion(payload);
      setCacheSavedAt(cached.savedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load conversion data.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = readViewCache<ConversionResponse>(
      buildConversionCacheKey({
        from: fromDate,
        to: toDate,
        cohortGrain,
        sourceGroups: selectedSourceGroups,
      }),
    );

    if (cached) {
      setConversion(cached.data);
      setCacheSavedAt(cached.savedAt);
      return;
    }

    setConversion(null);
    setCacheSavedAt(null);
  }, [fromDate, toDate, cohortGrain, selectedSourceGroups]);

  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }

    void loadConversion({
      from: fromDate,
      to: toDate,
      cohortGrain,
      sourceGroups: selectedSourceGroups,
    });
  }, [fromDate, toDate, cohortGrain, selectedSourceGroups]);

  const sourceButtonLabel = selectedSourceGroups === null || activeSourceGroups.length === availableSourceGroups.length
    ? "All Sources"
    : activeSourceGroups.length === 0
      ? "No Sources"
      : `${activeSourceGroups.length} Sources`;

  const applyDateFilters = () => {
    startTransition(() => {
      setFromDate(draftFromDate);
      setToDate(draftToDate);
      setShowDateFilters(false);
    });
  };

  const resetToCurrentMonth = () => {
    const today = getTodayKey();
    const monthStart = startOfMonth(today);
    startTransition(() => {
      setDraftFromDate(monthStart);
      setDraftToDate(today);
      setFromDate(monthStart);
      setToDate(today);
      setShowDateFilters(false);
    });
  };

  const toggleSourceGroup = (sourceGroup: string) => {
    startTransition(() => {
      setSelectedSourceGroups((current) => {
        const base = current === null ? [...availableSourceGroups] : [...current];
        return base.includes(sourceGroup)
          ? base.filter((item) => item !== sourceGroup)
          : [...base, sourceGroup];
      });
    });
  };

  const selectAllSources = () => {
    startTransition(() => {
      setSelectedSourceGroups([...availableSourceGroups]);
    });
  };

  const clearAllSources = () => {
    startTransition(() => {
      setSelectedSourceGroups([]);
    });
  };

  const handleRefreshNow = () => {
    void loadConversion({
      from: fromDate,
      to: toDate,
      cohortGrain,
      sourceGroups: selectedSourceGroups,
    });
  };

  useEffect(() => {
    const onLoadLiveData = () => {
      handleRefreshNow();
    };

    window.addEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    return () => {
      window.removeEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    };
  }, [fromDate, toDate, cohortGrain, selectedSourceGroups]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-foreground">
            Conversion Dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current month by default. Funnel, cohort, and source metrics follow the same report window.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={resetToCurrentMonth}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-card px-4 py-2 text-sm font-bold text-foreground shadow-ambient transition-colors hover:bg-gray-50"
          >
            <CalendarRange className="h-4 w-4 text-primary" />
            Current month
          </button>

          <button
            type="button"
            onClick={() => setShowDateFilters((value) => !value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold shadow-ambient transition-colors",
              showDateFilters
                ? "border-primary bg-primary/20 text-foreground"
                : "border-gray-200 bg-card text-foreground hover:bg-gray-50",
            )}
          >
            <CalendarRange className="h-4 w-4 text-primary" />
            Filter
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-card p-4 text-sm text-gray-600 shadow-ambient">
        {cacheSavedAt ? (
          <span>
            Dang hien cache luu luc <strong>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(cacheSavedAt))}</strong>.
            {" "}
            Khi ban doi filter hoac bam <strong>Load live data</strong> tren top bar, backend moi bi danh thuc.
          </span>
        ) : (
          <span>
            Chua co cache local cho man Conversion nay. Bam <strong>Load live data</strong> tren top bar de lay du lieu tu server.
          </span>
        )}
      </section>

      {showDateFilters ? (
        <section className="rounded-2xl border border-gray-200 bg-card p-5 shadow-ambient">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>From</span>
                <input
                  type="date"
                  value={draftFromDate}
                  onChange={(event) => setDraftFromDate(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>To</span>
                <input
                  type="date"
                  value={draftToDate}
                  onChange={(event) => setDraftToDate(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDateFilters(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={applyDateFilters}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.01]"
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

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-ambient">
        <div className="flex flex-col gap-4 border-b border-gray-50 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/30">
              <Grid3X3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-headline text-[length:var(--font-size-h-bento)] font-bold text-foreground">
                Conversion Cohort
              </h3>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {conversion?.cohort.grain === "week" ? "Lead created week to first order week" : "Lead created month to first order month"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSourceFilters((value) => !value)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-card px-4 py-2 text-sm font-bold text-foreground shadow-ambient transition-colors hover:bg-gray-50"
              >
                <Filter className="h-4 w-4 text-primary" />
                {sourceButtonLabel}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>

              {showSourceFilters ? (
                <div className="absolute right-0 top-[calc(100%+12px)] z-20 w-72 rounded-2xl border border-gray-200 bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-bold text-foreground">Cohort Sources</p>
                    <button
                      type="button"
                      onClick={() => setShowSourceFilters(false)}
                      className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mb-3 flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllSources}
                      className="rounded-lg bg-muted/30 px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-gray-100"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearAllSources}
                      className="rounded-lg bg-muted/30 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-gray-100"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="space-y-2">
                    {availableSourceGroups.map((sourceGroup) => {
                      const checked = activeSourceGroups.includes(sourceGroup);
                      return (
                        <label
                          key={sourceGroup}
                          className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-gray-50"
                        >
                          <span>{sourceGroup}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSourceGroup(sourceGroup)}
                            className="h-4 w-4 rounded border-gray-300 accent-[#1C1D21]"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="inline-flex rounded-full border border-gray-200 bg-muted/30 p-1">
              {(["month", "week"] as CohortGrain[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => startTransition(() => setCohortGrain(option))}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                    cohortGrain === option ? "bg-card text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto p-6">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="w-36 pb-4 pl-2 text-left font-headline">
                  {cohortGrain === "week" ? "Lead Week" : "Lead Month"}
                </th>
                <th className="w-24 pb-4 text-center">Leads</th>
                {Array.from({ length: 9 }, (_, index) => (
                  <th key={index} className="pb-4 text-center">
                    {cohortGrain === "week" ? `W${index}` : `T${index}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-xs font-semibold">
              {conversion?.cohort.rows.map((row) => (
                <tr key={row.label} className="border-b border-border">
                  <td className="py-2 pl-2 font-headline font-semibold text-muted-foreground">{row.label}</td>
                  <td className="bg-muted/30 px-3 py-3 text-center font-bold text-foreground">
                    {formatNumber(row.lead_count)}
                  </td>
                  {row.values.map((value, index) => (
                    <td key={`${row.label}-${index}`} className="p-0">
                      <div
                        title={`${formatNumber(value.count)} converted from ${formatNumber(row.lead_count)} leads`}
                        className={cn(
                          "flex h-12 w-full items-center justify-center text-center transition-colors",
                          getCellBackground(value.rate),
                        )}
                      >
                        {value.rate === null ? "-" : `${value.rate.toFixed(1)}%`}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card shadow-ambient">
          <div className="border-b border-gray-50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/30">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-headline text-[length:var(--font-size-h-bento)] font-bold text-foreground uppercase">
                  Source Conversion
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  All source groups in the selected date range
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto p-6">
            <table className="w-full min-w-[520px]">
              <thead className="border-b border-border">
                <tr>
                  <th className="pb-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source</th>
                  <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Leads</th>
                  <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Customers</th>
                  <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(conversion?.source_conversion || []).map((row) => (
                  <tr key={row.source_group}>
                    <td className="py-4 pr-4">
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-foreground">{row.source_group}</p>
                        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(row.conversion_rate, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-right text-sm font-semibold text-foreground">{formatNumber(row.lead_count)}</td>
                    <td className="py-4 text-right text-sm font-semibold text-foreground">{formatNumber(row.customer_count)}</td>
                    <td className="py-4 text-right text-sm font-black text-foreground">{formatPercent(row.conversion_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card shadow-ambient">
          <div className="border-b border-gray-50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/30">
                <Filter className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-headline text-[length:var(--font-size-h-bento)] font-bold text-foreground uppercase">
                  Funnel
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Stages from leads created in the selected report window
                </p>
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col gap-6 p-6">
            <div className="space-y-6">
              {conversion?.funnel.stages.map((stage) => (
                <div key={stage.key} className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-foreground">
                    <span>{stage.label}</span>
                    <span>
                      {formatNumber(stage.value)}
                      <span className="ml-2 font-medium text-muted-foreground">{formatPercent(stage.rate)}</span>
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${Math.min(stage.rate, 100)}%`, opacity: stage.key === "sale_order" ? 1 : 0.85 }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {conversion?.funnel.side_metrics.map((metric) => (
                <div key={metric.key} className="rounded-2xl bg-muted/30 p-5">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-3xl font-black text-foreground">{formatNumber(metric.value)}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">{formatPercent(metric.rate)} of new leads</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">Overall Conv. Rate</p>
                  <p className="mt-3 text-4xl font-black text-primary">
                    {formatPercent(conversion?.overall_conversion.conversion_rate || 0)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-primary">
                    {formatNumber(conversion?.overall_conversion.customer_count || 0)} / {formatNumber(conversion?.overall_conversion.lead_count || 0)}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Customers / Leads
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
