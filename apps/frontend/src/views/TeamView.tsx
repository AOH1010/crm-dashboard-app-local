import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarRange,
  Filter,
  RefreshCcw,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/src/lib/utils";
import { LOAD_LIVE_DATA_EVENT } from "@/src/lib/liveDataEvents";
import { fetchTeam, type TeamResponse } from "@/src/lib/teamApi";
import { readViewCache, writeViewCache } from "@/src/lib/viewCache";

type TeamTrendGrain = "month" | "week";

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

function buildTeamCacheKey(params: { from: string; to: string }) {
  return `crm_cache_team:${params.from}:${params.to}`;
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-sm font-medium text-muted-foreground">
      {label}
    </div>
  );
}

function getTeamCardTone(teamKey: string, selected: boolean) {
  const tones: Record<string, { shell: string; glow: string; pill: string; accent: string; rail: string }> = {
    fire: {
      shell: selected ? "border-primary/20 bg-muted/30" : "border-border bg-card",
      glow: "rgba(20,20,20,0.05)",
      pill: "bg-chart-1/10 text-chart-1",
      accent: "var(--color-chart-1)",
      rail: "from-chart-1 to-transparent",
    },
    andes: {
      shell: selected ? "border-primary/20 bg-muted/30" : "border-border bg-card",
      glow: "rgba(20,20,20,0.05)",
      pill: "bg-chart-2/10 text-chart-2",
      accent: "var(--color-chart-2)",
      rail: "from-chart-2 to-transparent",
    },
    ka: {
      shell: selected ? "border-primary/20 bg-muted/30" : "border-border bg-card",
      glow: "rgba(20,20,20,0.05)",
      pill: "bg-chart-3/10 text-chart-3",
      accent: "var(--color-chart-3)",
      rail: "from-chart-3 to-transparent",
    },
    hcm: {
      shell: selected ? "border-primary/20 bg-muted/30" : "border-border bg-card",
      glow: "rgba(20,20,20,0.05)",
      pill: "bg-chart-4/10 text-chart-4",
      accent: "var(--color-chart-4)",
      rail: "from-chart-4 to-transparent",
    },
  };

  return tones[teamKey] || tones.fire;
}

function TeamTrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; color?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const sortedPayload = [...payload].sort((left, right) => Number(right.value || 0) - Number(left.value || 0));

  return (
    <div className="min-w-[220px] rounded-2xl border border-border bg-card text-card-foreground px-4 py-3  shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
      <div className="mt-3 space-y-2.5">
        {sortedPayload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color || "#fff" }} />
              <span className="font-semibold text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-bold ">{formatCurrency(Number(entry.value || 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getTeamAccentColor(teamKey: string) {
  return getTeamCardTone(teamKey, false).accent;
}

export default function TeamView() {
  const initialToday = getTodayKey();
  const [fromDate, setFromDate] = useState(startOfMonth(initialToday));
  const [toDate, setToDate] = useState(initialToday);
  const [draftFromDate, setDraftFromDate] = useState(startOfMonth(initialToday));
  const [draftToDate, setDraftToDate] = useState(initialToday);
  const [showFilters, setShowFilters] = useState(false);
  const [teamData, setTeamData] = useState<TeamResponse | null>(null);
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null);
  const [activeChartTeamKeys, setActiveChartTeamKeys] = useState<string[]>([]);
  const [trendGrain, setTrendGrain] = useState<TeamTrendGrain>("month");
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const skipFirstFetchRef = useRef(true);

  const loadTeamData = async (params: { from: string; to: string }) => {
    setIsRefreshing(true);
    try {
      const payload = await fetchTeam(params);
      const cached = writeViewCache(buildTeamCacheKey(params), payload);
      setTeamData(payload);
      setCacheSavedAt(cached.savedAt);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load team data.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = readViewCache<TeamResponse>(
      buildTeamCacheKey({
        from: fromDate,
        to: toDate,
      }),
    );

    if (cached) {
      setTeamData(cached.data);
      setCacheSavedAt(cached.savedAt);
      return;
    }

    setTeamData(null);
    setCacheSavedAt(null);
  }, [fromDate, toDate]);

  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }

    void loadTeamData({
      from: fromDate,
      to: toDate,
    });
  }, [fromDate, toDate]);

  useEffect(() => {
    const teams = teamData?.team_summaries || [];
    if (teams.length === 0) {
      setSelectedTeamKey(null);
      return;
    }

    const stillValid = selectedTeamKey && teams.some((team) => team.team_key === selectedTeamKey);
    if (stillValid) {
      return;
    }

    const defaultTeam = [...teams].sort((left, right) => right.revenue_amount - left.revenue_amount)[0];
    setSelectedTeamKey(defaultTeam?.team_key || teams[0].team_key);
  }, [teamData, selectedTeamKey]);

  useEffect(() => {
    const keys = (teamData?.teams || []).map((team) => team.key);
    if (keys.length === 0) {
      setActiveChartTeamKeys([]);
      return;
    }

    setActiveChartTeamKeys((currentKeys) => {
      if (currentKeys.length === 0) {
        return keys;
      }

      const nextKeys = currentKeys.filter((key) => keys.includes(key));
      return nextKeys.length === 0 ? keys : nextKeys;
    });
  }, [teamData]);

  useEffect(() => {
    const onLoadLiveData = () => {
      void loadTeamData({
        from: fromDate,
        to: toDate,
      });
    };

    window.addEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    return () => {
      window.removeEventListener(LOAD_LIVE_DATA_EVENT, onLoadLiveData);
    };
  }, [fromDate, toDate]);

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

  const handleToggleChartTeam = (teamKey: string) => {
    setActiveChartTeamKeys((currentKeys) => (
      currentKeys.includes(teamKey)
        ? currentKeys.filter((key) => key !== teamKey)
        : [...currentKeys, teamKey]
    ));
  };

  const teams = teamData?.team_summaries || [];
  const teamDefinitions = teamData?.teams || [];
  const selectedTeam = teams.find((team) => team.team_key === selectedTeamKey) || teams[0] || null;
  const selectedTeamMembers = useMemo(
    () => (selectedTeam ? teamData?.team_members[selectedTeam.team_key] || [] : []),
    [selectedTeam, teamData],
  );
  const maxRevenue = Math.max(...teams.map((team) => team.revenue_amount), 1);
  const trendPoints = useMemo(
    () => (
      trendGrain === "month"
        ? (teamData?.trend.monthly_points || []).map((point) => ({
          label: point.label,
          fire: point.fire,
          andes: point.andes,
          ka: point.ka,
          hcm: point.hcm,
        }))
        : (teamData?.trend.weekly_points || []).map((point) => ({
          label: point.label,
          fire: point.fire,
          andes: point.andes,
          ka: point.ka,
          hcm: point.hcm,
        }))
    ),
    [teamData, trendGrain],
  );

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-foreground">
            Team Performance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Current month by default. The selected range drives team totals, member breakdown, and the team trend.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleResetToCurrentMonth}
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
            Filter
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        {cacheSavedAt ? (
          <span>
            Dang hien cache local duoc luu luc <strong>{formatDateTime(cacheSavedAt)}</strong>. Bam <strong>Load live data</strong> tren top bar de cap nhat man Team tu server.
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
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>From</span>
                <input
                  type="date"
                  value={draftFromDate}
                  onChange={(event) => setDraftFromDate(event.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>

              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>To</span>
                <input
                  type="date"
                  value={draftToDate}
                  onChange={(event) => setDraftToDate(event.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
            </div>

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

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">Team Revenue Board</h2>
            <p className="text-sm text-muted-foreground">
              Revenue follows the Dashboard from <strong>{fromDate}</strong> to <strong>{toDate}</strong>.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card shadow-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <RefreshCcw className={cn("h-3.5 w-3.5 text-primary", isRefreshing || isPending ? "animate-spin" : "")} />
            {isRefreshing || isPending ? "Refreshing" : "Live Snapshot"}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {teams.map((team) => {
            const isSelected = selectedTeam?.team_key === team.team_key;
            const tone = getTeamCardTone(team.team_key, isSelected);

            return (
              <button
                key={team.team_key}
                type="button"
                onClick={() => setSelectedTeamKey(team.team_key)}
                className={cn(
                  "group relative overflow-visible rounded-xl border bg-card px-4 py-4 text-left transition-all duration-300 ease-out will-change-transform shadow-sm",
                  tone.shell,
                  isSelected ? "ring-2 ring-primary/20 scale-[1.02] -translate-y-1" : "hover:-translate-y-0.5",
                )}
                style={{
                  boxShadow: isSelected ? `0 12px 30px -15px ${tone.glow}` : undefined,
                }}
              >
                <div
                  className="absolute inset-0 rounded-xl transition-opacity duration-500 ease-out pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at top right, ${tone.glow}, transparent 70%)`,
                    opacity: isSelected ? 0.8 : 0.2,
                  }}
                />

                <div className="relative flex flex-col">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {team.team_label}
                    </p>
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tone.accent }}
                    />
                  </div>

                  <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                    {formatCompactCurrency(team.revenue_amount)}
                  </p>

                  <div className="mt-3 flex items-center gap-1.5">
                    <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", tone.pill)}>
                      {team.order_count.toLocaleString("vi-VN")} orders
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {team.member_count.toLocaleString("vi-VN")} sellers
                    </span>
                  </div>

                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${Math.max((team.revenue_amount / maxRevenue) * 100, 4)}%`,
                        backgroundColor: tone.accent,
                      }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div
          key={selectedTeam?.team_key || "empty-team"}
          className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col animate-in fade-in zoom-in-[0.99] duration-300"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Selected team
              </p>
              <h3 className="mt-1 text-xl font-bold tracking-tight text-foreground">
                {selectedTeam?.team_label || "No team selected"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Members listed here roll up to the selected team total.
              </p>
            </div>
            {selectedTeam ? (
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-right shadow-sm shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team total</p>
                <p className="mt-0.5 text-lg font-bold text-foreground">{formatCompactCurrency(selectedTeam.revenue_amount)}</p>
              </div>
            ) : null}
          </div>

          {selectedTeamMembers.length === 0 ? (
            <EmptyState label="No seller revenue found for this team in the selected range." />
          ) : (
            <div className="mt-1 flex-1 overflow-hidden rounded-xl border border-border bg-card">
              <div className="h-full overflow-auto max-h-[360px]">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm border-b border-border z-10">
                    <tr>
                      <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[48px]">#</th>
                      <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Orders</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-28">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeamMembers.map((member, index) => (
                      <tr
                        key={`${selectedTeam?.team_key}-${member.seller_name}`}
                        className="border-b border-border transition-colors hover:bg-muted/50 last:border-0"
                      >
                        <td className="px-3 py-2 text-center align-middle">
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted/80 text-[10px] font-bold text-muted-foreground">
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <p className="text-sm font-bold text-foreground leading-tight">{member.seller_name}</p>
                        </td>
                        <td className="px-3 py-2 text-right align-middle text-sm font-semibold text-muted-foreground">
                          {member.order_count.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-2 text-right align-middle text-sm font-bold text-foreground">
                          {formatCompactCurrency(member.revenue_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-xl bg-card p-6 shadow-sm">
        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {trendGrain === "month" ? "Monthly Team Trend" : "Weekly Team Trend"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {trendGrain === "month"
                ? "A clearer line view with the selected team highlighted against the other teams across the same 12-month window."
                : "A clearer line view with the selected team highlighted against the other teams across the same 12-week window."}
            </p>
          </div>

          <div className="justify-self-start lg:justify-self-center">
            <div className="inline-flex rounded-full border border-border bg-muted p-1">
              {(["month", "week"] as TeamTrendGrain[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTrendGrain(option)}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                    trendGrain === option ? "bg-card text-card-foreground text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {teamDefinitions.map((team) => (
              <button
                key={team.key}
                type="button"
                onClick={() => handleToggleChartTeam(team.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-all duration-300",
                  activeChartTeamKeys.includes(team.key)
                    ? "border-transparent bg-muted text-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-border hover:text-muted-foreground",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getTeamAccentColor(team.key) }} />
                {team.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[360px]">
          {trendPoints.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendPoints}>
                <defs>
                  {teamDefinitions.map((team) => (
                    <filter key={team.key} id={`team-glow-${team.key}`} x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={getTeamAccentColor(team.key)} floodOpacity="0.35" />
                    </filter>
                  ))}
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: "#94A3B8" }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: "#94A3B8" }}
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  width={90}
                />
                <Tooltip content={<TeamTrendTooltip />} />
                {teamDefinitions.map((team) => (
                  <Line
                    key={team.key}
                    dataKey={team.key}
                    name={team.label}
                    stroke={getTeamAccentColor(team.key)}
                    strokeWidth={activeChartTeamKeys.includes(team.key) ? 4 : 2}
                    strokeOpacity={activeChartTeamKeys.includes(team.key) ? 1 : 0.16}
                    filter={activeChartTeamKeys.includes(team.key) ? `url(#team-glow-${team.key})` : undefined}
                    dot={false}
                    activeDot={{
                      r: activeChartTeamKeys.includes(team.key) ? 6 : 4,
                      stroke: "#fff",
                      strokeWidth: 2,
                      fill: getTeamAccentColor(team.key),
                    }}
                    type="monotone"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No monthly team revenue available yet." />
          )}
        </div>
      </section>
    </div>
  );
}
