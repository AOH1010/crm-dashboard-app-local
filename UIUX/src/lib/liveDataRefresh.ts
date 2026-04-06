import { fetchConversion } from "./conversionApi";
import { fetchDashboard } from "./dashboardApi";
import { fetchLeads } from "./leadsApi";
import { writeViewCache } from "./viewCache";

const LEADS_CACHE_KEY = "crm_cache_leads";

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

function buildDashboardCacheKey(params: { from: string; to: string; grain: "month" | "week" | "day" }) {
  return `crm_cache_dashboard:${params.from}:${params.to}:${params.grain}`;
}

function buildConversionCacheKey(params: {
  from: string;
  to: string;
  cohortGrain: "month" | "week";
  sourceGroups: string[] | null;
}) {
  const sourceKey = params.sourceGroups === null ? "all" : [...params.sourceGroups].sort().join("|") || "none";
  return `crm_cache_conversion:${params.from}:${params.to}:${params.cohortGrain}:${sourceKey}`;
}

export async function refreshCoreViewCaches() {
  const today = getTodayKey();
  const from = startOfMonth(today);

  const results = await Promise.allSettled([
    fetchDashboard({ from, to: today, grain: "month" }).then((payload) => {
      writeViewCache(buildDashboardCacheKey({ from, to: today, grain: "month" }), payload);
    }),
    fetchLeads().then((payload) => {
      writeViewCache(LEADS_CACHE_KEY, payload);
    }),
    fetchConversion({
      from,
      to: today,
      cohortGrain: "month",
      sourceGroups: null,
    }).then((payload) => {
      writeViewCache(
        buildConversionCacheKey({
          from,
          to: today,
          cohortGrain: "month",
          sourceGroups: null,
        }),
        payload,
      );
    }),
  ]);

  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : "Unknown refresh error"));

  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }
}
