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
    <div className="flex h-full min-h-48 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-sm font-medium text-gray-400">
      {label}
    </div>
  );
}

function getTeamCardTone(teamKey: string, selected: boolean) {
  const tones: Record<string, { shell: string; glow: string; pill: string; accent: string; rail: string }> = {
    fire: {
      shell: selected ? "border-[#B8FF68]/25 bg-[#202126]" : "border-white/5 bg-[#2A2B31]",
      glow: "rgba(184,255,104,0.18)",
      pill: "bg-[#B8FF68]/16 text-[#B8FF68]",
      accent: "#B8FF68",
      rail: "from-[#B8FF68] to-[#DDF9A5]",
    },
    andes: {
      shell: selected ? "border-[#8CA2FF]/25 bg-[#202126]" : "border-white/5 bg-[#2A2B31]",
      glow: "rgba(140,162,255,0.18)",
      pill: "bg-[#8CA2FF]/16 text-[#B5C3FF]",
      accent: "#8CA2FF",
      rail: "from-[#8CA2FF] to-[#C8D2FF]",
    },
    ka: {
      shell: selected ? "border-[#50C878]/25 bg-[#202126]" : "border-white/5 bg-[#2A2B31]",
      glow: "rgba(80,200,120,0.18)",
      pill: "bg-[#50C878]/16 text-[#8CE3A8]",
      accent: "#50C878",
      rail: "from-[#50C878] to-[#9AE6B4]",
    },
    hcm: {
      shell: selected ? "border-[#FFB95C]/25 bg-[#202126]" : "border-white/5 bg-[#2A2B31]",
      glow: "rgba(255,185,92,0.18)",
      pill: "bg-[#FFB95C]/16 text-[#FFD59A]",
      accent: "#FFB95C",
      rail: "from-[#FFB95C] to-[#FFE0B5]",
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
    <div className="min-w-[220px] rounded-2xl border border-white/10 bg-[#1C1D21] px-4 py-3 text-white shadow-2xl">
      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/45">{label}</p>
      <div className="mt-3 space-y-2.5">
        {sortedPayload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color || "#fff" }} />
              <span className="font-semibold text-white/75">{entry.name}</span>
            </div>
            <span className="font-bold text-white">{formatCurrency(Number(entry.value || 0))}</span>
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
          <h1 className="font-headline text-[length:var(--font-size-h-page)] font-bold tracking-tight text-[#1C1D21]">
            Team Performance
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Current month by default. The selected range drives team totals, member breakdown, and the team trend.
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

      <section className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-ambient">
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

      <section className="rounded-[30px] bg-[#1C1D21] p-6 text-white shadow-ambient">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#B8FF68]">Team Revenue Board</h2>
            <p className="text-sm text-white/55">
              Revenue follows the Dashboard from <strong>{fromDate}</strong> to <strong>{toDate}</strong>.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-white/55">
            <RefreshCcw className={cn("h-4 w-4 text-[#B8FF68]", isRefreshing || isPending ? "animate-spin" : "")} />
            {isRefreshing || isPending ? "Refreshing" : "Live Snapshot"}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {teams.map((team) => {
              const isSelected = selectedTeam?.team_key === team.team_key;
              const tone = getTeamCardTone(team.team_key, isSelected);

              return (
                <button
                  key={team.team_key}
                  type="button"
                  onClick={() => setSelectedTeamKey(team.team_key)}
                  className={cn(
                    "group relative w-full overflow-visible rounded-[24px] border px-5 py-4 text-left transition-all duration-500 ease-out will-change-transform",
                    tone.shell,
                    isSelected ? "translate-x-1 scale-[1.01]" : "hover:-translate-y-0.5 hover:scale-[1.003]",
                  )}
                  style={{
                    boxShadow: isSelected ? `0 24px 50px -34px ${tone.glow}` : undefined,
                  }}
                >
                  <div
                    className="absolute inset-0 rounded-[24px] transition-opacity duration-500 ease-out"
                    style={{
                      background: `radial-gradient(circle at right, ${tone.glow}, transparent 58%)`,
                      opacity: isSelected ? 1 : 0.72,
                    }}
                  />
                  {isSelected ? (
                    <div className={cn("absolute right-[-56px] top-1/2 hidden h-0.5 w-14 -translate-y-1/2 rounded-full bg-gradient-to-r lg:block animate-in fade-in duration-300", tone.rail)} />
                  ) : null}

                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/35">
                        {team.team_label}
                      </p>
                      <p className="mt-3 text-3xl font-bold tracking-tight text-white">
                        {formatCompactCurrency(team.revenue_amount)}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]", tone.pill)}>
                          {team.order_count.toLocaleString("vi-VN")} orders
                        </span>
                        <span className="rounded-full bg-white/6 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
                          {team.member_count.toLocaleString("vi-VN")} sellers
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{
                            width: `${Math.max((team.revenue_amount / maxRevenue) * 100, 8)}%`,
                            backgroundColor: tone.accent,
                          }}
                        />
                      </div>
                    </div>

                    <div
                      className="mt-1 h-3.5 w-3.5 rounded-full ring-4 ring-white/10"
                      style={{ backgroundColor: tone.accent }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div
            key={selectedTeam?.team_key || "empty-team"}
            className="rounded-[24px] border border-white/8 bg-[#24252B] p-5 animate-in fade-in zoom-in-[0.99] duration-300"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/35">
                  Selected team
                </p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">
                  {selectedTeam?.team_label || "No team selected"}
                </h3>
                <p className="mt-2 text-sm text-white/55">
                  Members listed here roll up to the selected team total for {fromDate} to {toDate}.
                </p>
              </div>
              {selectedTeam ? (
                <div className="rounded-2xl border border-white/8 bg-[#1D1E23] px-4 py-3 text-right shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/35">Team total</p>
                  <p className="mt-1 text-xl font-bold text-[#B8FF68]">{formatCompactCurrency(selectedTeam.revenue_amount)}</p>
                </div>
              ) : null}
            </div>

            {selectedTeamMembers.length === 0 ? (
              <EmptyState label="No seller revenue found for this team in the selected range." />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[72px_minmax(0,1fr)_100px_120px] gap-3 px-2 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-white/30">
                  <span>Rank</span>
                  <span>Seller</span>
                  <span className="text-right">Orders</span>
                  <span className="text-right">Revenue</span>
                </div>
                <div className="max-h-[308px] overflow-y-auto">
                  {selectedTeamMembers.map((member, index) => (
                    <div
                      key={`${selectedTeam?.team_key}-${member.seller_name}`}
                      className="mb-2.5 grid grid-cols-[72px_minmax(0,1fr)_100px_120px] gap-3 rounded-[20px] border border-white/6 bg-[#2B2C32] px-4 py-3.5 text-sm last:mb-0"
                    >
                      <div className="flex items-center">
                        <span className="inline-flex min-w-10 items-center justify-center rounded-full bg-white/6 px-3 py-1 text-xs font-black text-white/60">
                          #{index + 1}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-white">{member.seller_name}</p>
                        <p className="mt-1 text-xs text-white/45">{selectedTeam?.team_label}</p>
                      </div>
                      <div className="text-right font-semibold text-white/55">
                        {member.order_count.toLocaleString("vi-VN")}
                      </div>
                      <div className="text-right font-bold text-[#B8FF68]">
                        {formatCompactCurrency(member.revenue_amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[30px] bg-white p-6 shadow-ambient">
        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-[#1C1D21]">
              {trendGrain === "month" ? "Monthly Team Trend" : "Weekly Team Trend"}
            </h2>
            <p className="text-sm text-gray-500">
              {trendGrain === "month"
                ? "A clearer line view with the selected team highlighted against the other teams across the same 12-month window."
                : "A clearer line view with the selected team highlighted against the other teams across the same 12-week window."}
            </p>
          </div>

          <div className="justify-self-start lg:justify-self-center">
            <div className="inline-flex rounded-full border border-gray-200 bg-[#F6F6F8] p-1">
              {(["month", "week"] as TeamTrendGrain[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTrendGrain(option)}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                    trendGrain === option ? "bg-[#1C1D21] text-[#B8FF68]" : "text-gray-500 hover:text-[#1C1D21]",
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
                    ? "border-transparent bg-[#F6F6F8] text-[#1C1D21] shadow-sm"
                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600",
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
                <CartesianGrid stroke="#eef0f2" strokeDasharray="3 3" vertical={false} />
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
