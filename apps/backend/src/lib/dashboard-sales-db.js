import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendAppDir = path.resolve(__dirname, "..", "..");
const projectRoot = path.resolve(backendAppDir, "..", "..");

const BUILDER_VERSION = "dashboard-v1";
const DEFAULT_TIMEZONE = process.env.CRM_TIMEZONE || "Asia/Bangkok";

const defaultDataDir = path.join(projectRoot, "data");

export const DATA_DIR = path.resolve(process.env.CRM_DATA_DIR || defaultDataDir);
export const CRM_DB_PATH = path.resolve(process.env.CRM_DB_PATH || path.join(DATA_DIR, "crm.db"));
export const DASHBOARD_DB_PATH = path.resolve(
  process.env.DASHBOARD_DB_PATH || path.join(DATA_DIR, "dashboard_sales.db"),
);

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

function getSourceMaxDateKey(sourceDbPath = CRM_DB_PATH) {
  const sourceDb = openDatabase(sourceDbPath);
  try {
    const row = sourceDb
      .prepare(
        `
          SELECT MAX(day_value) AS max_day
          FROM (
            SELECT MAX(SUBSTR(TRIM(created_at_1), 1, 10)) AS day_value
            FROM customers
            WHERE LENGTH(TRIM(COALESCE(created_at_1, ''))) >= 10

            UNION ALL

            SELECT MAX(SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10)) AS day_value
            FROM orders
            WHERE LENGTH(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10))) >= 10
          )
        `,
      )
      .get();
    return row?.max_day || null;
  } finally {
    closeDatabase(sourceDb);
  }
}

function getEffectiveTodayKey(sourceDbPath = CRM_DB_PATH) {
  const systemToday = getSystemTodayDateKey();
  const sourceMaxDate = getSourceMaxDateKey(sourceDbPath);

  if (!sourceMaxDate) {
    return systemToday;
  }

  return compareDateKeys(sourceMaxDate, systemToday) < 0 ? sourceMaxDate : systemToday;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map((part) => Number.parseInt(part, 10));
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

function startOfMonthKey(dateKey) {
  return `${String(dateKey).slice(0, 7)}-01`;
}

function isValidDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""));
}

function compareDateKeys(left, right) {
  return left.localeCompare(right);
}

function listDateKeys(startKey, endKey) {
  const keys = [];
  let cursor = startKey;

  while (compareDateKeys(cursor, endKey) <= 0) {
    keys.push(cursor);
    cursor = formatDateKey(addDays(cursor, 1));
  }

  return keys;
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

function toMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${month}/${year}`;
}

function toDayLabel(dateKey) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function toWeekLabel(dateKey) {
  const { isoYear, isoWeek } = getIsoWeekParts(dateKey);
  return `W${String(isoWeek).padStart(2, "0")}/${isoYear}`;
}

function toWeekKey(dateKey) {
  const { isoYear, isoWeek } = getIsoWeekParts(dateKey);
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function getStatusLabels(sourceDb) {
  const rows = sourceDb
    .prepare(
      `
        SELECT TRIM(COALESCE(status_label, '')) AS status_label, COUNT(*) AS row_count
        FROM orders
        GROUP BY TRIM(COALESCE(status_label, ''))
      `,
    )
    .all();

  const duyetLabels = rows.filter((row) => foldText(row.status_label).includes("duyet"));
  const cancelled = rows.find((row) => foldText(row.status_label).includes("huy"))?.status_label || "Đã hủy";

  let pending = "Chờ duyệt";
  let approved = "Đã duyệt";

  if (duyetLabels.length > 0) {
    duyetLabels.sort((left, right) => right.row_count - left.row_count);
    approved = duyetLabels[0].status_label || approved;
    pending = duyetLabels[duyetLabels.length - 1].status_label || pending;
  }

  return {
    approved,
    pending,
    cancelled,
  };
}

function getValueMap(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows) {
    map.set(row[keyField], row[valueField]);
  }
  return map;
}

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 60000;
    `);
  } catch {
    // Ignore PRAGMA failures and continue with default settings.
  }
  return db;
}

function closeDatabase(db) {
  try {
    db.close();
  } catch {
    // Ignore close errors on shutdown path.
  }
}

function buildRevenueRows(sourceDb, cancelledLabel) {
  return sourceDb
    .prepare(
      `
        SELECT
          SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) AS day,
          ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> ?
          AND LENGTH(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10))) >= 10
        GROUP BY day
        ORDER BY day
      `,
    )
    .all(cancelledLabel);
}

function buildLeadRows(sourceDb) {
  return sourceDb
    .prepare(
      `
        SELECT
          SUBSTR(TRIM(created_at_1), 1, 10) AS day,
          COUNT(*) AS new_leads_count
        FROM customers
        WHERE LENGTH(TRIM(COALESCE(created_at_1, ''))) >= 10
        GROUP BY day
        ORDER BY day
      `,
    )
    .all();
}

function buildNewCustomerRows(sourceDb, cancelledLabel) {
  return sourceDb
    .prepare(
      `
        WITH first_orders AS (
          SELECT
            TRIM(id_1) AS customer_id,
            MIN(SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10)) AS first_order_day
          FROM orders
          WHERE TRIM(COALESCE(status_label, '')) <> ?
            AND LENGTH(TRIM(COALESCE(id_1, ''))) > 0
            AND LENGTH(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10))) >= 10
          GROUP BY TRIM(id_1)
        )
        SELECT first_order_day AS day, COUNT(*) AS new_customers_count
        FROM first_orders
        GROUP BY first_order_day
        ORDER BY first_order_day
      `,
    )
    .all(cancelledLabel);
}

function buildLeaderboardRows(sourceDb, cancelledLabel) {
  return sourceDb
    .prepare(
      `
        WITH order_base AS (
          SELECT
            SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 7) AS month_key,
            COALESCE(NULLIF(TRIM(o.saler_name), ''), 'Unassigned') AS seller_name,
            COALESCE(NULLIF(TRIM(s.dept_name), ''), 'Unmapped team') AS team_name,
            COALESCE(o.real_amount, 0) AS amount
          FROM orders o
          LEFT JOIN staffs s ON TRIM(o.saler_name) = TRIM(s.contact_name)
          WHERE TRIM(COALESCE(o.status_label, '')) <> ?
            AND LENGTH(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10))) >= 7
        )
        SELECT
          month_key,
          seller_name,
          team_name,
          ROUND(revenue_amount, 2) AS revenue_amount,
          order_count,
          rank_order
        FROM (
          SELECT
            month_key,
            seller_name,
            team_name,
            SUM(amount) AS revenue_amount,
            COUNT(*) AS order_count,
            ROW_NUMBER() OVER (
              PARTITION BY month_key
              ORDER BY SUM(amount) DESC, seller_name ASC
            ) AS rank_order
          FROM order_base
          GROUP BY month_key, seller_name, team_name
        )
        ORDER BY month_key, rank_order
      `,
    )
    .all(cancelledLabel);
}

function buildRecentOrderRows(sourceDb, cancelledLabel) {
  return sourceDb
    .prepare(
      `
        SELECT
          o.order_id,
          o.order_code,
          TRIM(COALESCE(o.id_1, '')) AS customer_id,
          COALESCE(NULLIF(TRIM(c.title), ''), 'Unknown customer') AS customer_title,
          SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) AS order_date,
          COALESCE(NULLIF(TRIM(o.created_at), ''), SUBSTR(NULLIF(TRIM(o.order_date), ''), 1, 10) || ' 00:00:00') AS created_at,
          COALESCE(o.real_amount, 0) AS amount,
          COALESCE(NULLIF(TRIM(o.saler_name), ''), 'Unassigned') AS seller_name,
          COALESCE(NULLIF(TRIM(s.dept_name), ''), 'Unmapped team') AS team_name,
          TRIM(COALESCE(o.status_label, '')) AS status_label,
          CASE WHEN TRIM(COALESCE(o.status_label, '')) = ? THEN 1 ELSE 0 END AS is_cancelled,
          COALESCE(NULLIF(TRIM(o.created_at), ''), SUBSTR(NULLIF(TRIM(o.order_date), ''), 1, 10) || ' 00:00:00') AS sort_timestamp
        FROM orders o
        LEFT JOIN customers c ON TRIM(o.id_1) = TRIM(c.id_1)
        LEFT JOIN staffs s ON TRIM(o.saler_name) = TRIM(s.contact_name)
        ORDER BY sort_timestamp DESC, o.order_id DESC
      `,
    )
    .all(cancelledLabel);
}

function createSchema(targetDb) {
  targetDb.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE dashboard_kpis_daily (
      day TEXT PRIMARY KEY,
      revenue_amount REAL NOT NULL,
      new_leads_count INTEGER NOT NULL,
      new_customers_count INTEGER NOT NULL
    );

    CREATE TABLE dashboard_revenue_series (
      day TEXT PRIMARY KEY,
      month_key TEXT NOT NULL,
      month_label TEXT NOT NULL,
      iso_week_key TEXT NOT NULL,
      iso_week_label TEXT NOT NULL,
      day_label TEXT NOT NULL,
      revenue_amount REAL NOT NULL
    );

    CREATE TABLE dashboard_sales_leaderboard_monthly (
      month_key TEXT NOT NULL,
      seller_name TEXT NOT NULL,
      team_name TEXT NOT NULL,
      revenue_amount REAL NOT NULL,
      order_count INTEGER NOT NULL,
      rank_order INTEGER NOT NULL,
      PRIMARY KEY (month_key, seller_name)
    );

    CREATE TABLE dashboard_recent_orders (
      order_id INTEGER PRIMARY KEY,
      order_code TEXT,
      customer_id TEXT,
      customer_title TEXT NOT NULL,
      order_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      amount REAL NOT NULL,
      seller_name TEXT NOT NULL,
      team_name TEXT NOT NULL,
      status_label TEXT NOT NULL,
      is_cancelled INTEGER NOT NULL,
      sort_timestamp TEXT NOT NULL
    );

    CREATE TABLE dashboard_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT NOT NULL
    );

    CREATE INDEX idx_dashboard_kpis_day ON dashboard_kpis_daily(day);
    CREATE INDEX idx_dashboard_revenue_month_key ON dashboard_revenue_series(month_key);
    CREATE INDEX idx_dashboard_revenue_week_key ON dashboard_revenue_series(iso_week_key);
    CREATE INDEX idx_dashboard_leaderboard_month_key ON dashboard_sales_leaderboard_monthly(month_key, rank_order);
    CREATE INDEX idx_dashboard_recent_orders_sort ON dashboard_recent_orders(sort_timestamp DESC, order_id DESC);
  `);
}

export function buildDashboardSalesDb({
  sourceDbPath = CRM_DB_PATH,
  analyticsDbPath = DASHBOARD_DB_PATH,
  todayKey = getEffectiveTodayKey(sourceDbPath),
} = {}) {
  fs.mkdirSync(path.dirname(analyticsDbPath), { recursive: true });

  const sourceDb = openDatabase(sourceDbPath);
  const { approved, pending, cancelled } = getStatusLabels(sourceDb);
  const revenueRows = buildRevenueRows(sourceDb, cancelled);
  const leadRows = buildLeadRows(sourceDb);
  const newCustomerRows = buildNewCustomerRows(sourceDb, cancelled);
  const leaderboardRows = buildLeaderboardRows(sourceDb, cancelled);
  const recentOrderRows = buildRecentOrderRows(sourceDb, cancelled);

  const allStartCandidates = [
    revenueRows[0]?.day,
    leadRows[0]?.day,
    newCustomerRows[0]?.day,
    todayKey,
  ].filter(Boolean);
  const firstDay = [...allStartCandidates].sort()[0] || todayKey;

  const revenueByDay = getValueMap(revenueRows, "day", "revenue_amount");
  const leadsByDay = getValueMap(leadRows, "day", "new_leads_count");
  const customersByDay = getValueMap(newCustomerRows, "day", "new_customers_count");
  const builtAt = new Date().toISOString();
  const sourceMtimeMs = String(Math.trunc(fs.statSync(sourceDbPath).mtimeMs));

  const tempDbPath = `${analyticsDbPath}.${process.pid}.${Date.now()}.tmp`;

  const targetDb = openDatabase(tempDbPath);
  createSchema(targetDb);

  const insertDaily = targetDb.prepare(
    `
      INSERT INTO dashboard_kpis_daily (
        day,
        revenue_amount,
        new_leads_count,
        new_customers_count
      ) VALUES (?, ?, ?, ?)
    `,
  );
  const insertSeries = targetDb.prepare(
    `
      INSERT INTO dashboard_revenue_series (
        day,
        month_key,
        month_label,
        iso_week_key,
        iso_week_label,
        day_label,
        revenue_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const insertLeaderboard = targetDb.prepare(
    `
      INSERT INTO dashboard_sales_leaderboard_monthly (
        month_key,
        seller_name,
        team_name,
        revenue_amount,
        order_count,
        rank_order
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  );
  const insertRecentOrder = targetDb.prepare(
    `
      INSERT INTO dashboard_recent_orders (
        order_id,
        order_code,
        customer_id,
        customer_title,
        order_date,
        created_at,
        amount,
        seller_name,
        team_name,
        status_label,
        is_cancelled,
        sort_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const insertMeta = targetDb.prepare(`INSERT INTO dashboard_meta (meta_key, meta_value) VALUES (?, ?)`);

  targetDb.exec("BEGIN");
  try {
    for (const day of listDateKeys(firstDay, todayKey)) {
      const monthKey = day.slice(0, 7);
      const weekLabel = toWeekLabel(day);
      const weekParts = getIsoWeekParts(day);
      const weekKey = `${weekParts.isoYear}-W${String(weekParts.isoWeek).padStart(2, "0")}`;
      const revenueAmount = Number(revenueByDay.get(day) || 0);
      const newLeadsCount = Number(leadsByDay.get(day) || 0);
      const newCustomersCount = Number(customersByDay.get(day) || 0);

      insertDaily.run(day, revenueAmount, newLeadsCount, newCustomersCount);
      insertSeries.run(
        day,
        monthKey,
        toMonthLabel(monthKey),
        weekKey,
        weekLabel,
        toDayLabel(day),
        revenueAmount,
      );
    }

    for (const row of leaderboardRows) {
      insertLeaderboard.run(
        row.month_key,
        row.seller_name,
        row.team_name,
        Number(row.revenue_amount || 0),
        Number(row.order_count || 0),
        Number(row.rank_order || 0),
      );
    }

    for (const row of recentOrderRows) {
      insertRecentOrder.run(
        Number(row.order_id),
        row.order_code || "",
        row.customer_id || "",
        row.customer_title,
        row.order_date,
        row.created_at,
        Number(row.amount || 0),
        row.seller_name,
        row.team_name,
        row.status_label,
        Number(row.is_cancelled || 0),
        row.sort_timestamp,
      );
    }

    const metaEntries = [
      ["builder_version", BUILDER_VERSION],
      ["built_at", builtAt],
      ["today_key", todayKey],
      ["source_db_path", sourceDbPath],
      ["source_mtime_ms", sourceMtimeMs],
      ["approved_status_label", approved],
      ["pending_status_label", pending],
      ["cancelled_status_label", cancelled],
    ];

    for (const [key, value] of metaEntries) {
      insertMeta.run(key, String(value));
    }

    targetDb.exec("COMMIT");
  } catch (error) {
    targetDb.exec("ROLLBACK");
    closeDatabase(targetDb);
    closeDatabase(sourceDb);
    fs.rmSync(tempDbPath, { force: true });
    throw error;
  }

  closeDatabase(targetDb);
  closeDatabase(sourceDb);

  fs.rmSync(analyticsDbPath, { force: true });
  fs.renameSync(tempDbPath, analyticsDbPath);

  return {
    analyticsDbPath,
    sourceDbPath,
    builtAt,
  };
}

function readMetaValue(db, metaKey) {
  const row = db.prepare(`SELECT meta_value FROM dashboard_meta WHERE meta_key = ?`).get(metaKey);
  return row?.meta_value || null;
}

export function ensureDashboardSalesDb({
  sourceDbPath = CRM_DB_PATH,
  analyticsDbPath = DASHBOARD_DB_PATH,
  todayKey = getEffectiveTodayKey(sourceDbPath),
} = {}) {
  const sourceMtimeMs = String(Math.trunc(fs.statSync(sourceDbPath).mtimeMs));

  if (!fs.existsSync(analyticsDbPath)) {
    return buildDashboardSalesDb({ sourceDbPath, analyticsDbPath, todayKey });
  }

  const analyticsDb = openDatabase(analyticsDbPath);
  const builderVersion = readMetaValue(analyticsDb, "builder_version");
  const storedSourceMtimeMs = readMetaValue(analyticsDb, "source_mtime_ms");
  const storedTodayKey = readMetaValue(analyticsDb, "today_key");
  closeDatabase(analyticsDb);

  if (
    builderVersion !== BUILDER_VERSION ||
    storedSourceMtimeMs !== sourceMtimeMs ||
    storedTodayKey !== todayKey
  ) {
    return buildDashboardSalesDb({ sourceDbPath, analyticsDbPath, todayKey });
  }

  return {
    analyticsDbPath,
    sourceDbPath,
    builtAt: null,
  };
}

function sanitizeFilters({ from, to, grain, todayKey }) {
  const defaultTo = todayKey;
  const defaultFrom = startOfMonthKey(todayKey);
  let safeFrom = isValidDateKey(from) ? from : defaultFrom;
  let safeTo = isValidDateKey(to) ? to : defaultTo;
  let safeGrain = grain === "day" || grain === "week" || grain === "month" ? grain : "month";

  if (compareDateKeys(safeFrom, safeTo) > 0) {
    [safeFrom, safeTo] = [safeTo, safeFrom];
  }

  return {
    from: safeFrom,
    to: safeTo,
    grain: safeGrain,
  };
}

function getMonthSeries(db, to) {
  const monthRows = db
    .prepare(
      `
        SELECT
          month_key,
          ROUND(SUM(revenue_amount), 2) AS revenue_amount
        FROM dashboard_revenue_series
        GROUP BY month_key
      `,
    )
    .all();
  const monthlyMap = new Map(monthRows.map((row) => [row.month_key, Number(row.revenue_amount || 0)]));
  const endMonthKey = to.slice(0, 7);
  const points = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const key = addMonthsToKey(endMonthKey, -offset);
    points.push({
      key,
      label: toMonthLabel(key),
      current: Number(monthlyMap.get(key) || 0),
      previous: Number(monthlyMap.get(addMonthsToKey(key, -12)) || 0),
    });
  }

  return points;
}

function getWeekSeries(db, to) {
  const weekRows = db
    .prepare(
      `
        SELECT
          iso_week_key,
          ROUND(SUM(revenue_amount), 2) AS revenue_amount
        FROM dashboard_revenue_series
        GROUP BY iso_week_key
      `,
    )
    .all();
  const weekMap = new Map(weekRows.map((row) => [row.iso_week_key, Number(row.revenue_amount || 0)]));
  const points = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const anchorDateKey = formatDateKey(addDays(to, -(offset * 7)));
    const key = toWeekKey(anchorDateKey);
    points.push({
      key,
      label: toWeekLabel(anchorDateKey),
      current: Number(weekMap.get(key) || 0),
      previous: null,
    });
  }

  return points;
}

function getDaySeries(db, to) {
  const dayRows = db
    .prepare(
      `
        SELECT day AS key, revenue_amount AS current
        FROM dashboard_revenue_series
        ORDER BY day
      `,
    )
    .all();
  const dayMap = new Map(dayRows.map((row) => [row.key, Number(row.current || 0)]));
  const points = [];

  for (let offset = 13; offset >= 0; offset -= 1) {
    const key = formatDateKey(addDays(to, -offset));
    points.push({
      key,
      label: toDayLabel(key),
      current: Number(dayMap.get(key) || 0),
      previous: null,
    });
  }

  return points;
}

export function getDashboardPayload({
  from,
  to,
  grain,
  analyticsDbPath = DASHBOARD_DB_PATH,
  todayKey = getEffectiveTodayKey(CRM_DB_PATH),
} = {}) {
  const filters = sanitizeFilters({ from, to, grain, todayKey });
  const db = openDatabase(analyticsDbPath);

  try {
    const kpiRow = db
      .prepare(
        `
          SELECT
            ROUND(COALESCE(SUM(revenue_amount), 0), 2) AS total_revenue,
            COALESCE(SUM(new_leads_count), 0) AS new_leads,
            COALESCE(SUM(new_customers_count), 0) AS new_customers
          FROM dashboard_kpis_daily
          WHERE day BETWEEN ? AND ?
        `,
      )
      .get(filters.from, filters.to);

    const newLeads = Number(kpiRow?.new_leads || 0);
    const newCustomers = Number(kpiRow?.new_customers || 0);
    const totalRevenue = Number(kpiRow?.total_revenue || 0);
    const conversionRate = newLeads > 0 ? Number(((newCustomers / newLeads) * 100).toFixed(2)) : 0;
    const currentMonthKey = filters.to.slice(0, 7);

    const leaderboard = db
      .prepare(
        `
          SELECT seller_name, team_name, revenue_amount, order_count, rank_order
          FROM dashboard_sales_leaderboard_monthly
          WHERE month_key = ?
          ORDER BY rank_order ASC
          LIMIT 5
        `,
      )
      .all(currentMonthKey)
      .map((row) => ({
        seller_name: row.seller_name,
        team_name: row.team_name,
        revenue_amount: Number(row.revenue_amount || 0),
        order_count: Number(row.order_count || 0),
        rank: Number(row.rank_order || 0),
      }));

    const recentOrders = db
      .prepare(
        `
          SELECT
            order_id,
            order_code,
            customer_id,
            customer_title,
            order_date,
            created_at,
            amount,
            seller_name,
            team_name,
            status_label
          FROM dashboard_recent_orders
          ORDER BY sort_timestamp DESC, order_id DESC
          LIMIT 5
        `,
      )
      .all()
      .map((row) => ({
        order_id: Number(row.order_id),
        order_code: row.order_code,
        customer_id: row.customer_id,
        customer_title: row.customer_title,
        order_date: row.order_date,
        created_at: row.created_at,
        amount: Number(row.amount || 0),
        seller_name: row.seller_name,
        team_name: row.team_name,
        status_label: row.status_label,
      }));

    let revenuePoints = [];
    if (filters.grain === "day") {
      revenuePoints = getDaySeries(db, filters.to);
    } else if (filters.grain === "week") {
      revenuePoints = getWeekSeries(db, filters.to);
    } else {
      revenuePoints = getMonthSeries(db, filters.to);
    }

    return {
      as_of: readMetaValue(db, "built_at"),
      applied_filters: filters,
      kpis: {
        total_revenue: totalRevenue,
        new_leads: newLeads,
        new_customers: newCustomers,
        conversion_rate: conversionRate,
      },
      revenue_series: {
        grain: filters.grain,
        compare_enabled: filters.grain === "month",
        points: revenuePoints,
      },
      leaderboard,
      recent_orders: recentOrders,
    };
  } finally {
    closeDatabase(db);
  }
}


