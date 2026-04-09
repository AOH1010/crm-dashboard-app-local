import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./dashboard-sales-db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendAppDir = path.resolve(__dirname, "..", "..");
const projectRoot = path.resolve(backendAppDir, "..", "..");
const DEFAULT_TIMEZONE = process.env.CRM_TIMEZONE || "Asia/Bangkok";
const EMPTY_CATEGORY = "N/A";
const TENURE_BUCKETS = ["all", "0-3", "3-6", "6-9", "9-12", "12+"];

export const OPERATIONS_DB_PATH = path.resolve(
  process.env.OPERATIONS_DB_PATH || path.join(DATA_DIR || path.join(projectRoot, "data"), "dashboard_operations.db"),
);

function openDatabase(dbPath = OPERATIONS_DB_PATH) {
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

function ensureOperationsDb() {
  if (!fs.existsSync(OPERATIONS_DB_PATH)) {
    throw new Error("Operations database is not available yet.");
  }
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
  return formatDateKey(date);
}

function endOfMonthKey(dateKey) {
  const [year, month] = String(dateKey).split("-").map((value) => Number.parseInt(value, 10));
  const nextMonth = month === 12 ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, month, 1));
  nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
  return formatDateKey(nextMonth);
}

function addMonthsToKey(monthEndKey, amount) {
  const date = parseDateKey(monthEndKey);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount + 1);
  date.setUTCDate(0);
  return formatDateKey(date);
}

function compareDateKeys(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
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
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toMonthLabel(monthEndKey) {
  const date = parseDateKey(monthEndKey);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}/${year}`;
}

function toMonthShortLabel(monthEndKey) {
  const date = parseDateKey(monthEndKey);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(date).toUpperCase();
}

function sanitizeReportMonth(db, reportMonth) {
  const meta = getMetaMap(db);
  const fallback = isValidDateKey(meta.default_report_month)
    ? meta.default_report_month
    : endOfMonthKey(meta.latest_raw_date || getSystemTodayDateKey());

  if (!reportMonth) {
    return fallback;
  }

  if (!isValidDateKey(reportMonth)) {
    return fallback;
  }

  return endOfMonthKey(reportMonth);
}

function sanitizeYear(value, fallbackMonthKey) {
  const fallbackYear = Number.parseInt(String(fallbackMonthKey || "").slice(0, 4), 10) || new Date().getFullYear();
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallbackYear;
}

function getMetaMap(db) {
  const rows = db.prepare("SELECT key, value FROM operations_meta").all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function numberMeta(meta, key, fallback = 0) {
  const parsed = Number.parseFloat(String(meta[key] || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAsOf(meta) {
  return meta.latest_raw_date || null;
}

function foldText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

function compactLabel(value, fallback = null) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return fallback;
  }
  const firstLine = lines[0];
  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
}

function getStatusTone(status) {
  if (status === "Active") {
    return "active";
  }
  if (status === "Inactive") {
    return "inactive";
  }
  return "unknown";
}

function getCategoryColor(category) {
  switch (category) {
    case "Best":
      return "#B8FF68";
    case "Value":
      return "#60A5FA";
    case "Noise":
      return "#FDBA74";
    case "Ghost":
      return "#F87171";
    default:
      return "#CBD5E1";
  }
}

function getMetricColumn(metric) {
  switch (metric) {
    case "create":
      return "create_cnt";
    case "update":
      return "update_cnt";
    case "render":
      return "render_cnt";
    case "open":
    default:
      return "open_cnt";
  }
}

function sanitizeCohortMetric(metric) {
  return ["open", "create", "update", "render"].includes(String(metric)) ? metric : "open";
}

function sanitizeThreshold(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(0, Math.min(parsed, 9999));
}

function sanitizeTenureBucket(bucket) {
  return TENURE_BUCKETS.includes(bucket) ? bucket : "all";
}

function getTenureMonths(activationDateKey, reportMonthKey) {
  if (!activationDateKey || !reportMonthKey) {
    return null;
  }
  const activationDate = parseDateKey(activationDateKey);
  const reportDate = parseDateKey(reportMonthKey);
  return (reportDate.getUTCFullYear() - activationDate.getUTCFullYear()) * 12
    + (reportDate.getUTCMonth() - activationDate.getUTCMonth());
}

function matchesTenureBucket(months, bucket) {
  if (months === null) {
    return false;
  }
  switch (bucket) {
    case "0-3":
      return months >= 0 && months < 3;
    case "3-6":
      return months >= 3 && months < 6;
    case "6-9":
      return months >= 6 && months < 9;
    case "9-12":
      return months >= 9 && months < 12;
    case "12+":
      return months >= 12;
    case "all":
    default:
      return true;
  }
}

function formatBucketLabel(bucket) {
  switch (bucket) {
    case "0-3":
      return "0-3 months";
    case "3-6":
      return "3-6 months";
    case "6-9":
      return "6-9 months";
    case "9-12":
      return "9-12 months";
    case "12+":
      return "12+ months";
    default:
      return "All tenures";
  }
}

function buildUserMapPayload({ reportMonth } = {}) {
  ensureOperationsDb();
  const db = openDatabase();
  try {
    const meta = getMetaMap(db);
    const safeReportMonth = sanitizeReportMonth(db, reportMonth);

    const kpiRow = db.prepare(`
      SELECT
        SUM(CASE WHEN s.status = 'Active' THEN 1 ELSE 0 END) AS total_active,
        SUM(CASE WHEN s.status = 'Inactive' THEN 1 ELSE 0 END) AS total_inactive,
        SUM(CASE WHEN s.category IN ('Best', 'Value') THEN 1 ELSE 0 END) AS bv_count,
        SUM(CASE WHEN s.category IN ('Noise', 'Ghost') THEN 1 ELSE 0 END) AS ng_count
      FROM ops_activation_accounts a
      LEFT JOIN ops_monthly_status s
        ON s.account = a.account
       AND s.month_end_key = ?
    `).get(safeReportMonth);

    const pointRows = db.prepare(`
      SELECT
        a.account,
        a.customer_id,
        a.customer_name,
        a.sale_owner,
        a.account_type,
        a.customer_type,
        m.open_cnt,
        m.quality_ratio,
        m.latest_active_date,
        s.status,
        s.category
      FROM ops_activation_accounts a
      LEFT JOIN ops_monthly_metrics m
        ON m.account = a.account
       AND m.month_end_key = ?
      LEFT JOIN ops_monthly_status s
        ON s.account = a.account
       AND s.month_end_key = ?
      WHERE s.status = 'Active'
      ORDER BY m.open_cnt DESC, m.quality_ratio DESC, a.account ASC
    `).all(safeReportMonth, safeReportMonth);

    const segmentRows = db.prepare(`
      SELECT
        category,
        COUNT(*) AS account_count
      FROM ops_monthly_status
      WHERE month_end_key = ?
        AND category IN ('Best', 'Value', 'Noise', 'Ghost')
      GROUP BY category
    `).all(safeReportMonth);

    const totalActive = Number(kpiRow?.total_active || 0);
    const totalInactive = Number(kpiRow?.total_inactive || 0);
    const totalTracked = totalActive + totalInactive;
    const bvCount = Number(kpiRow?.bv_count || 0);
    const ngCount = Number(kpiRow?.ng_count || 0);

    return {
      as_of: getAsOf(meta),
      applied_filters: {
        report_month: safeReportMonth,
      },
      thresholds: {
        open_low: numberMeta(meta, "threshold_open_low", 1),
        open_high: numberMeta(meta, "threshold_open_high", 13),
        quality: numberMeta(meta, "threshold_quality", 0.35),
      },
      kpis: {
        total_active: totalActive,
        total_inactive: totalInactive,
        active_rate: totalTracked > 0 ? Number(((totalActive / totalTracked) * 100).toFixed(2)) : 0,
        bv_count: bvCount,
        ng_count: ngCount,
      },
      quadrants: {
        points: pointRows.map((row) => ({
          account: row.account,
          customer_id: row.customer_id,
          customer_name: compactLabel(row.customer_name),
          sale_owner: row.sale_owner,
          account_type: row.account_type,
          customer_type: row.customer_type,
          open_cnt: Number(row.open_cnt || 0),
          quality_ratio: Number(row.quality_ratio || 0),
          latest_active_date: row.latest_active_date || null,
          status: row.status || null,
          category: row.category || EMPTY_CATEGORY,
          color: getCategoryColor(row.category),
        })),
      },
      segment_breakdown: segmentRows
        .map((row) => ({
          category: row.category,
          account_count: Number(row.account_count || 0),
          share: totalTracked > 0 ? Number(((Number(row.account_count || 0) / totalTracked) * 100).toFixed(2)) : 0,
          color: getCategoryColor(row.category),
        }))
        .sort((left, right) => right.account_count - left.account_count),
      qa: {
        official_accounts: Number(meta.activation_unique_accounts || 0),
        raw_accounts_excluded: Number(meta.raw_accounts_excluded || 0),
        invalid_daily_rows: Number(meta.invalid_daily_rows || 0),
      },
    };
  } finally {
    closeDatabase(db);
  }
}

function buildActiveMapPayload({ reportMonth, tenureBucket } = {}) {
  ensureOperationsDb();
  const db = openDatabase();
  try {
    const meta = getMetaMap(db);
    const safeReportMonth = sanitizeReportMonth(db, reportMonth);
    const safeTenureBucket = sanitizeTenureBucket(tenureBucket);

    const latestActiveRows = db.prepare(`
      SELECT
        account,
        MAX(day_key) AS latest_active_date
      FROM ops_raw_daily
      WHERE day_key <= ?
        AND (open_cnt > 0 OR create_cnt > 0 OR update_cnt > 0 OR render_cnt > 0)
      GROUP BY account
    `).all(safeReportMonth);
    const latestActiveMap = new Map(latestActiveRows.map((row) => [row.account, row.latest_active_date]));

    const baseRows = db.prepare(`
      SELECT
        a.account,
        a.customer_type,
        a.customer_id,
        a.customer_name,
        a.sale_owner,
        a.activation_date,
        a.expiry_date,
        a.account_type,
        m.open_cnt,
        m.create_cnt,
        m.update_cnt,
        m.render_cnt,
        m.quality_ratio,
        s.status,
        s.category
      FROM ops_activation_accounts a
      LEFT JOIN ops_monthly_metrics m
        ON m.account = a.account
       AND m.month_end_key = ?
      LEFT JOIN ops_monthly_status s
        ON s.account = a.account
       AND s.month_end_key = ?
      ORDER BY a.account ASC
    `).all(safeReportMonth, safeReportMonth);

    const bucketCounts = {
      all: baseRows.length,
      "0-3": 0,
      "3-6": 0,
      "6-9": 0,
      "9-12": 0,
      "12+": 0,
    };

    const rows = baseRows
      .map((row) => {
        const tenureMonths = getTenureMonths(row.activation_date, safeReportMonth);
        if (tenureMonths !== null) {
          for (const bucket of TENURE_BUCKETS) {
            if (bucket !== "all" && matchesTenureBucket(tenureMonths, bucket)) {
              bucketCounts[bucket] += 1;
            }
          }
        }

        return {
          account: row.account,
          customer_type: row.customer_type,
          customer_id: row.customer_id,
          customer_name: compactLabel(row.customer_name),
          sale_owner: row.sale_owner,
          activation_date: row.activation_date,
          expiry_date: row.expiry_date,
          account_type: row.account_type,
          open_cnt: Number(row.open_cnt || 0),
          create_cnt: Number(row.create_cnt || 0),
          update_cnt: Number(row.update_cnt || 0),
          render_cnt: Number(row.render_cnt || 0),
          quality_ratio: Number(row.quality_ratio || 0),
          status: row.status || null,
          category: row.category || EMPTY_CATEGORY,
          tenure_months: tenureMonths,
          latest_active_date: latestActiveMap.get(row.account) || null,
        };
      })
      .filter((row) => matchesTenureBucket(row.tenure_months, safeTenureBucket))
      .sort((left, right) => {
        const riskOrder = ["Ghost", "Noise", "Value", "Best", EMPTY_CATEGORY];
        const leftIndex = riskOrder.indexOf(left.category);
        const rightIndex = riskOrder.indexOf(right.category);
        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex;
        }
        if (right.open_cnt !== left.open_cnt) {
          return right.open_cnt - left.open_cnt;
        }
        return String(left.account).localeCompare(String(right.account));
      });

    const totalAccounts = rows.length;
    const activeAccounts = rows.filter((row) => row.status === "Active").length;
    const riskAccounts = rows.filter((row) => row.category === "Noise" || row.category === "Ghost").length;
    const avgQuality = rows.length > 0
      ? Number((rows.reduce((sum, row) => sum + row.quality_ratio, 0) / rows.length).toFixed(2))
      : 0;

    return {
      as_of: getAsOf(meta),
      applied_filters: {
        report_month: safeReportMonth,
        tenure_bucket: safeTenureBucket,
      },
      bucket_summary: TENURE_BUCKETS.map((bucket) => ({
        key: bucket,
        label: formatBucketLabel(bucket),
        account_count: bucketCounts[bucket],
      })),
      kpis: {
        tracked_accounts: totalAccounts,
        active_accounts: activeAccounts,
        active_rate: totalAccounts > 0 ? Number(((activeAccounts / totalAccounts) * 100).toFixed(2)) : 0,
        risk_accounts: riskAccounts,
        avg_quality: avgQuality,
      },
      rows,
    };
  } finally {
    closeDatabase(db);
  }
}

function buildCohortPayload({ reportMonth, metric, threshold } = {}) {
  ensureOperationsDb();
  const db = openDatabase();
  try {
    const meta = getMetaMap(db);
    const safeReportMonth = sanitizeReportMonth(db, reportMonth);
    const safeMetric = sanitizeCohortMetric(metric);
    const safeThreshold = sanitizeThreshold(threshold);
    const metricColumn = getMetricColumn(safeMetric);

    const activationRows = db.prepare(`
      SELECT account, activation_month_end
      FROM ops_activation_accounts
      WHERE activation_month_end IS NOT NULL
        AND activation_month_end <= ?
      ORDER BY activation_month_end ASC, account ASC
    `).all(safeReportMonth);

    const metricRows = db.prepare(`
      SELECT
        account,
        month_end_key,
        open_cnt,
        create_cnt,
        update_cnt,
        render_cnt,
        invalid_daily_count
      FROM ops_monthly_metrics
      WHERE month_end_key <= ?
    `).all(safeReportMonth);

    const metricMap = new Map();
    for (const row of metricRows) {
      metricMap.set(`${row.account}:${row.month_end_key}`, row);
    }

    const cohortMap = new Map();
    let invalidAccountMonths = 0;
    const invalidAccounts = new Set();

    for (const row of activationRows) {
      const cohortMonth = row.activation_month_end;
      if (!cohortMap.has(cohortMonth)) {
        cohortMap.set(cohortMonth, {
          cohort_month: cohortMonth,
          lead_count: 0,
          cells: Array.from({ length: 13 }, (_, index) => ({
            offset: index,
            label: `T${index}`,
            active_count: 0,
            eligible_count: 0,
          })),
        });
      }

      const cohortRow = cohortMap.get(cohortMonth);
      cohortRow.lead_count += 1;

      for (let offset = 0; offset <= 12; offset += 1) {
        const monthKey = addMonthsToKey(cohortMonth, offset);
        if (compareDateKeys(monthKey, safeReportMonth) > 0) {
          continue;
        }

        const cell = cohortRow.cells[offset];
        const metricRow = metricMap.get(`${row.account}:${monthKey}`);
        const invalid = Number(metricRow?.invalid_daily_count || 0) > 0;
        if (invalid) {
          invalidAccountMonths += 1;
          invalidAccounts.add(row.account);
          continue;
        }

        cell.eligible_count += 1;
        const metricValue = Number(metricRow?.[metricColumn] || 0);
        if (metricValue >= safeThreshold) {
          cell.active_count += 1;
        }
      }
    }

    const cohortRows = [...cohortMap.values()].map((row) => ({
      cohort_month: row.cohort_month,
      label: toMonthLabel(row.cohort_month),
      account_count: row.lead_count,
      cells: row.cells.map((cell) => ({
        ...cell,
        active_rate: cell.eligible_count > 0 ? Number(((cell.active_count / cell.eligible_count) * 100).toFixed(2)) : null,
      })),
    }));

    const rangeSummary = (fromOffset, toOffset) => {
      let activeCount = 0;
      let eligibleCount = 0;
      for (const row of cohortRows) {
        for (const cell of row.cells) {
          if (cell.offset >= fromOffset && cell.offset <= toOffset && cell.active_rate !== null) {
            activeCount += cell.active_count;
            eligibleCount += cell.eligible_count;
          }
        }
      }
      return eligibleCount > 0 ? Number(((activeCount / eligibleCount) * 100).toFixed(2)) : 0;
    };

    return {
      as_of: getAsOf(meta),
      applied_filters: {
        report_month: safeReportMonth,
        metric: safeMetric,
        threshold: safeThreshold,
      },
      kpis: {
        t0_t3_rate: rangeSummary(0, 3),
        t3_t6_rate: rangeSummary(3, 6),
        t6_t12_rate: rangeSummary(6, 12),
      },
      qa: {
        invalid_daily_rows_total: Number(meta.invalid_daily_rows || 0),
        invalid_account_months: invalidAccountMonths,
        affected_accounts: invalidAccounts.size,
      },
      cohorts: cohortRows,
    };
  } finally {
    closeDatabase(db);
  }
}

function buildRenewPayload({ reportMonth, year } = {}) {
  ensureOperationsDb();
  const db = openDatabase();
  try {
    const meta = getMetaMap(db);
    const safeReportMonth = sanitizeReportMonth(db, reportMonth);
    const safeYear = sanitizeYear(year, safeReportMonth);
    const todayKey = getSystemTodayDateKey();
    const todayMonth = endOfMonthKey(todayKey);
    const previousMonth = addMonthsToKey(todayMonth, -1);
    const dueSoonEnd = addDays(todayKey, 10);

    const reportMonthRow = db.prepare(`
      SELECT
        COUNT(*) AS due_count,
        SUM(CASE WHEN renewed = 1 THEN 1 ELSE 0 END) AS renewed_count
      FROM ops_due_accounts
      WHERE due_month_key = ?
    `).get(safeReportMonth);

    const chartCounts = new Map(
      db.prepare(`
        SELECT
          due_month_key,
          COUNT(*) AS due_count,
          SUM(CASE WHEN renewed = 1 THEN 1 ELSE 0 END) AS renewed_count
        FROM ops_due_accounts
        WHERE SUBSTR(due_month_key, 1, 4) = ?
        GROUP BY due_month_key
      `).all(String(safeYear)).map((row) => [row.due_month_key, row]),
    );

    const chartPoints = Array.from({ length: 12 }, (_, index) => {
      const monthKey = endOfMonthKey(`${safeYear}-${String(index + 1).padStart(2, "0")}-01`);
      const row = chartCounts.get(monthKey);
      return {
        month_key: monthKey,
        label: toMonthShortLabel(monthKey),
        due_count: Number(row?.due_count || 0),
        renewed_count: Number(row?.renewed_count || 0),
        current: monthKey === todayMonth,
      };
    });

    const expiringRows = db.prepare(`
      SELECT
        account,
        customer_type,
        customer_id,
        customer_name,
        sale_owner,
        account_type,
        activation_date,
        expiry_date,
        contract_term
      FROM ops_activation_accounts
      WHERE expiry_date >= ?
        AND expiry_date <= ?
      ORDER BY expiry_date ASC, account ASC
    `).all(todayKey, dueSoonEnd);

    const historyMonthKeys = Array.from({ length: 12 }, (_, index) => addMonthsToKey(todayMonth, -index)).reverse();
    const categoryRows = db.prepare(`
      SELECT account, month_end_key, status, category
      FROM ops_monthly_status
      WHERE month_end_key >= ?
        AND month_end_key <= ?
    `).all(historyMonthKeys[0], historyMonthKeys[historyMonthKeys.length - 1]);
    const categoryMap = new Map();
    for (const row of categoryRows) {
      categoryMap.set(`${row.account}:${row.month_end_key}`, row);
    }

    const expiringAccounts = expiringRows.map((row) => {
      const history = historyMonthKeys.map((monthKey) => {
        const statusRow = categoryMap.get(`${row.account}:${monthKey}`);
        return {
          month_key: monthKey,
          label: toMonthLabel(monthKey),
          status: statusRow?.status || null,
          category: statusRow?.category || EMPTY_CATEGORY,
        };
      });

      return {
        account: row.account,
        customer_type: row.customer_type,
        customer_id: row.customer_id,
        customer_name: compactLabel(row.customer_name),
        sale_owner: row.sale_owner,
        account_type: row.account_type,
        activation_date: row.activation_date,
        expiry_date: row.expiry_date,
        contract_term: row.contract_term,
        days_left: Math.max(0, Math.round((parseDateKey(row.expiry_date).getTime() - parseDateKey(todayKey).getTime()) / 86400000)),
        current_category: categoryMap.get(`${row.account}:${todayMonth}`)?.category || EMPTY_CATEGORY,
        previous_category: categoryMap.get(`${row.account}:${previousMonth}`)?.category || EMPTY_CATEGORY,
        category_history: history,
      };
    });

    const dueCount = Number(reportMonthRow?.due_count || 0);
    const renewedCount = Number(reportMonthRow?.renewed_count || 0);

    return {
      as_of: getAsOf(meta),
      applied_filters: {
        report_month: safeReportMonth,
        year: safeYear,
      },
      kpis: {
        due_count: dueCount,
        renewed_count: renewedCount,
        renewal_rate: dueCount > 0 ? Number(((renewedCount / dueCount) * 100).toFixed(2)) : 0,
        expired_pending: Math.max(0, dueCount - renewedCount),
      },
      chart: {
        points: chartPoints,
      },
      expiring_window: {
        from: todayKey,
        to: dueSoonEnd,
      },
      expiring_accounts: expiringAccounts,
    };
  } finally {
    closeDatabase(db);
  }
}

export {
  ensureOperationsDb,
  buildUserMapPayload,
  buildActiveMapPayload,
  buildCohortPayload,
  buildRenewPayload,
};


