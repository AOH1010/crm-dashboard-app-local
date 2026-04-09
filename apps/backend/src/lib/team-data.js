import { DatabaseSync } from "node:sqlite";
import { CRM_DB_PATH } from "./dashboard-sales-db.js";

const TEAM_DEFINITIONS = [
  { key: "fire", label: "Fire", color: "#B8FF68" },
  { key: "andes", label: "Andes", color: "#1C1D21" },
  { key: "ka", label: "KA", color: "#3C6600" },
  { key: "hcm", label: "HCM", color: "#64748B" },
];

const TEAM_LOOKUP = new Map(TEAM_DEFINITIONS.map((team) => [team.key, team]));
const DEFAULT_TIMEZONE = process.env.CRM_TIMEZONE || "Asia/Bangkok";

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 60000;
    `);
  } catch {
    // Ignore PRAGMA failures.
  }
  return db;
}

function closeDatabase(db) {
  try {
    db.close();
  } catch {
    // Ignore close errors.
  }
}

function foldText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getSystemTodayDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return formatDateParts(parts);
}

function startOfMonthKey(dateKey) {
  return `${String(dateKey).slice(0, 7)}-01`;
}

function isValidDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""));
}

function compareDateKeys(left, right) {
  return String(left).localeCompare(String(right));
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map((value) => Number.parseInt(value, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, amount) {
  const date = typeof dateKey === "string" ? parseDateKey(dateKey) : new Date(dateKey.getTime());
  date.setUTCDate(date.getUTCDate() + amount);
  return date;
}

function addMonthsToKey(monthKey, amount) {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${month}/${year.slice(-2)}`;
}

function getIsoWeekParts(dateKey) {
  const date = parseDateKey(dateKey);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return {
    isoYear: date.getUTCFullYear(),
    isoWeek: week,
  };
}

function toWeekKey(dateKey) {
  const { isoYear, isoWeek } = getIsoWeekParts(dateKey);
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function toWeekLabel(dateKey) {
  const { isoYear, isoWeek } = getIsoWeekParts(dateKey);
  return `W${String(isoWeek).padStart(2, "0")}/${isoYear}`;
}

function addWeeks(dateKey, amount) {
  return formatDateKey(addDays(dateKey, amount * 7));
}

function sanitizeFilters({ from, to, todayKey }) {
  const defaultTo = todayKey;
  const defaultFrom = startOfMonthKey(todayKey);
  let safeFrom = isValidDateKey(from) ? from : defaultFrom;
  let safeTo = isValidDateKey(to) ? to : defaultTo;

  if (compareDateKeys(safeFrom, safeTo) > 0) {
    [safeFrom, safeTo] = [safeTo, safeFrom];
  }

  return {
    from: safeFrom,
    to: safeTo,
  };
}

function getSourceMaxDateKey(db) {
  const row = db.prepare(`
    SELECT MAX(day_value) AS max_day
    FROM (
      SELECT MAX(SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10)) AS day_value
      FROM orders
      WHERE LENGTH(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10))) >= 10
    )
  `).get();

  return row?.max_day || null;
}

function getEffectiveTodayKey(sourceDbPath = CRM_DB_PATH) {
  const db = openDatabase(sourceDbPath);
  try {
    const systemToday = getSystemTodayDateKey();
    const sourceMaxDate = getSourceMaxDateKey(db);
    if (!sourceMaxDate) {
      return systemToday;
    }
    return compareDateKeys(sourceMaxDate, systemToday) < 0 ? sourceMaxDate : systemToday;
  } finally {
    closeDatabase(db);
  }
}

function getCancelledStatusLabel(db) {
  const rows = db.prepare(`
    SELECT TRIM(COALESCE(status_label, '')) AS status_label, COUNT(*) AS row_count
    FROM orders
    GROUP BY TRIM(COALESCE(status_label, ''))
  `).all();

  return rows.find((row) => foldText(row.status_label).includes("huy"))?.status_label || "Đã hủy";
}

function mapDeptToTeamKey(deptName) {
  const value = foldText(deptName);
  if (!value) {
    return null;
  }
  if (value.includes("fire")) {
    return "fire";
  }
  if (value.includes("andes")) {
    return "andes";
  }
  if (value.includes("hcm")) {
    return "hcm";
  }
  if (/(^|[^a-z])ka([^a-z]|$)/.test(value) || value.includes("jega lite")) {
    return "ka";
  }
  return null;
}

function buildTeamOrderRows(db, cancelledStatusLabel) {
  return db.prepare(`
    SELECT
      SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) AS day,
      SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 7) AS month_key,
      COALESCE(NULLIF(TRIM(o.saler_name), ''), 'Unassigned') AS seller_name,
      COALESCE(NULLIF(TRIM(s.dept_name), ''), '') AS dept_name,
      ROUND(SUM(COALESCE(o.real_amount, 0)), 2) AS revenue_amount,
      COUNT(*) AS order_count
    FROM orders o
    LEFT JOIN staffs s
      ON TRIM(o.saler_name) = TRIM(s.contact_name)
    WHERE TRIM(COALESCE(o.status_label, '')) <> ?
      AND LENGTH(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10))) >= 10
    GROUP BY day, month_key, seller_name, dept_name
    ORDER BY day, seller_name
  `).all(cancelledStatusLabel);
}

function createEmptyTeamSummary(team) {
  return {
    team_key: team.key,
    team_label: team.label,
    color: team.color,
    revenue_amount: 0,
    order_count: 0,
    member_count: 0,
  };
}

export function getTeamPayload({
  from,
  to,
  sourceDbPath = CRM_DB_PATH,
  todayKey = getEffectiveTodayKey(sourceDbPath),
} = {}) {
  const filters = sanitizeFilters({ from, to, todayKey });
  const db = openDatabase(sourceDbPath);

  try {
    const cancelledStatusLabel = getCancelledStatusLabel(db);
    const orderRows = buildTeamOrderRows(db, cancelledStatusLabel);
    const asOf = getSourceMaxDateKey(db) || todayKey;

    const teamSummaries = new Map(TEAM_DEFINITIONS.map((team) => [team.key, createEmptyTeamSummary(team)]));
    const memberMaps = new Map(TEAM_DEFINITIONS.map((team) => [team.key, new Map()]));
    const monthlyTrendMap = new Map();
    const weeklyTrendMap = new Map();
    const endMonthKey = filters.to.slice(0, 7);
    const trendMonthKeys = [];
    const trendWeekDateKeys = [];

    for (let offset = 11; offset >= 0; offset -= 1) {
      const monthKey = addMonthsToKey(endMonthKey, -offset);
      trendMonthKeys.push(monthKey);
      monthlyTrendMap.set(monthKey, Object.fromEntries(TEAM_DEFINITIONS.map((team) => [team.key, 0])));
    }

    for (let offset = 11; offset >= 0; offset -= 1) {
      const weekDateKey = addWeeks(filters.to, -offset);
      trendWeekDateKeys.push(weekDateKey);
      weeklyTrendMap.set(toWeekKey(weekDateKey), {
        label: toWeekLabel(weekDateKey),
        values: Object.fromEntries(TEAM_DEFINITIONS.map((team) => [team.key, 0])),
      });
    }

    for (const row of orderRows) {
      const teamKey = mapDeptToTeamKey(row.dept_name);
      if (!teamKey) {
        continue;
      }

      const revenueAmount = Number(row.revenue_amount || 0);
      const orderCount = Number(row.order_count || 0);

      if (compareDateKeys(row.day, filters.from) >= 0 && compareDateKeys(row.day, filters.to) <= 0) {
        const teamSummary = teamSummaries.get(teamKey);
        const teamMembers = memberMaps.get(teamKey);
        const existingMember = teamMembers.get(row.seller_name) || {
          seller_name: row.seller_name,
          revenue_amount: 0,
          order_count: 0,
        };

        teamSummary.revenue_amount += revenueAmount;
        teamSummary.order_count += orderCount;

        existingMember.revenue_amount += revenueAmount;
        existingMember.order_count += orderCount;
        teamMembers.set(row.seller_name, existingMember);
      }

      if (monthlyTrendMap.has(row.month_key)) {
        const monthEntry = monthlyTrendMap.get(row.month_key);
        monthEntry[teamKey] += revenueAmount;
      }

      const rowWeekKey = toWeekKey(row.day);
      if (weeklyTrendMap.has(rowWeekKey)) {
        weeklyTrendMap.get(rowWeekKey).values[teamKey] += revenueAmount;
      }
    }

    const summaryList = TEAM_DEFINITIONS.map((team) => {
      const summary = teamSummaries.get(team.key);
      summary.member_count = memberMaps.get(team.key).size;
      summary.revenue_amount = Number(summary.revenue_amount.toFixed(2));
      return summary;
    });

    const membersByTeam = Object.fromEntries(
      TEAM_DEFINITIONS.map((team) => [
        team.key,
        [...memberMaps.get(team.key).values()]
          .map((member) => ({
            seller_name: member.seller_name,
            revenue_amount: Number(member.revenue_amount.toFixed(2)),
            order_count: member.order_count,
          }))
          .sort((left, right) => {
            if (right.revenue_amount !== left.revenue_amount) {
              return right.revenue_amount - left.revenue_amount;
            }
            return left.seller_name.localeCompare(right.seller_name);
          }),
      ]),
    );

    const trendPoints = trendMonthKeys.map((monthKey) => ({
      month_key: monthKey,
      label: toMonthLabel(monthKey),
      ...monthlyTrendMap.get(monthKey),
    }));

    const weeklyTrendPoints = trendWeekDateKeys.map((weekDateKey) => {
      const weekKey = toWeekKey(weekDateKey);
      const weekEntry = weeklyTrendMap.get(weekKey);

      return {
        week_key: weekKey,
        label: weekEntry.label,
        ...weekEntry.values,
      };
    });

    return {
      as_of: asOf,
      applied_filters: filters,
      teams: TEAM_DEFINITIONS,
      team_summaries: summaryList,
      team_members: membersByTeam,
      trend: {
        monthly_points: trendPoints,
        weekly_points: weeklyTrendPoints,
      },
    };
  } finally {
    closeDatabase(db);
  }
}
