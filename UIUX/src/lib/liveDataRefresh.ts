import { fetchConversion } from "./conversionApi";
import { fetchDashboard } from "./dashboardApi";
import { fetchLeads } from "./leadsApi";
import {
  fetchOperationsActiveMap,
  fetchOperationsCohort,
  fetchOperationsRenew,
  fetchOperationsUserMap,
} from "./operationsApi";
import { fetchTeam } from "./teamApi";
import { writeViewCache } from "./viewCache";

const LEADS_CACHE_KEY = "crm_cache_leads";
const OPERATIONS_ACTIVE_MAP_CACHE_KEY_PREFIX = "crm_cache_ops_active_map";
const OPERATIONS_COHORT_CACHE_KEY_PREFIX = "crm_cache_ops_cohort";
const OPERATIONS_RENEW_CACHE_KEY_PREFIX = "crm_cache_ops_renew";
const OPERATIONS_USER_MAP_CACHE_KEY_PREFIX = "crm_cache_ops_user_map";
const TEAM_CACHE_KEY_PREFIX = "crm_cache_team";

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

function buildTeamCacheKey(params: { from: string; to: string }) {
  return `${TEAM_CACHE_KEY_PREFIX}:${params.from}:${params.to}`;
}

function buildOperationsUserMapCacheKey(reportMonth: string) {
  return `${OPERATIONS_USER_MAP_CACHE_KEY_PREFIX}:${reportMonth}`;
}

function buildOperationsActiveMapCacheKey(reportMonth: string, tenureBucket: string) {
  return `${OPERATIONS_ACTIVE_MAP_CACHE_KEY_PREFIX}:${reportMonth}:${tenureBucket}`;
}

function buildOperationsCohortCacheKey(reportMonth: string, metric: string, threshold: number) {
  return `${OPERATIONS_COHORT_CACHE_KEY_PREFIX}:${reportMonth}:${metric}:${threshold}`;
}

function buildOperationsRenewCacheKey(reportMonth: string, year: number) {
  return `${OPERATIONS_RENEW_CACHE_KEY_PREFIX}:${reportMonth}:${year}`;
}

export async function refreshCoreViewCaches() {
  const today = getTodayKey();
  const from = startOfMonth(today);
  const reportMonth = today;
  const reportYear = Number.parseInt(today.slice(0, 4), 10);

  const results = await Promise.allSettled([
    fetchDashboard({ from, to: today, grain: "month" }).then((payload) => {
      writeViewCache(buildDashboardCacheKey({ from, to: today, grain: "month" }), payload);
    }),
    fetchLeads().then((payload) => {
      writeViewCache(LEADS_CACHE_KEY, payload);
    }),
    fetchTeam({ from, to: today }).then((payload) => {
      writeViewCache(buildTeamCacheKey({ from, to: today }), payload);
    }),
    fetchOperationsUserMap(reportMonth).then((payload) => {
      writeViewCache(buildOperationsUserMapCacheKey(reportMonth), payload);
    }),
    fetchOperationsActiveMap({
      reportMonth,
      tenureBucket: "all",
    }).then((payload) => {
      writeViewCache(buildOperationsActiveMapCacheKey(reportMonth, "all"), payload);
    }),
    fetchOperationsCohort({
      reportMonth,
      metric: "open",
      threshold: 1,
    }).then((payload) => {
      writeViewCache(buildOperationsCohortCacheKey(reportMonth, "open", 1), payload);
    }),
    fetchOperationsRenew({
      reportMonth,
      year: reportYear,
    }).then((payload) => {
      writeViewCache(buildOperationsRenewCacheKey(reportMonth, reportYear), payload);
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
