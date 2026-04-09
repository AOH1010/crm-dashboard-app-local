import { DatabaseSync } from "node:sqlite";
import { CRM_DB_PATH } from "./dashboard-sales-db.js";

const SOURCE_GROUP_ORDER = ["Marketing Ads", "Marketing Other", "Event", "Affiliate", "Sale", "Other"];

const SOURCE_GROUP_ENTRIES = [
  ["Marketing Ads", [
    "Facebook_loại 1",
    "Website",
    "Zalo",
    "Hotline",
  ]],
  ["Marketing Other", [
    "Facebook_loại 2",
    "Phễu Marketing > Lead mua",
    "Phễu Marketing > Scan Google Map",
    "Phễu Marketing > Marketing Ucall",
    "Panex_facebook",
    "Tiktok",
    "Zalo > Simple Zalo",
    "Chat GPT",
    "GG",
    "https://jega.getflycrm.com",
    "Livestream",
  ]],
  ["Event", [
    "Vietbuild",
    "Events",
  ]],
  ["Affiliate", [
    "AFFILIATE - JEGA",
    "AFFILIATE - JEGA > AFF-Marketing",
    "AFFILIATE - JEGA > AFF-Sales",
    "Giới thiệu - Panex",
    "Đối tác",
  ]],
  ["Sale", [
    "Sale tự kiếm",
    "Đi Thị Trường",
    "Mã Số Thuế + Thông Tin Doanh Nghiệp",
    "Sale Chạy Ads Face, GG, Tiktok",
  ]],
  ["Other", [
    "Aihouse",
    "Email nội bộ Jega",
    "Lớp học Ai Nội Thất",
    "Lớp học Ai ngành Gạch",
  ]],
];

const SOURCE_GROUPS = new Map(
  SOURCE_GROUP_ENTRIES.map(([groupName, values]) => [groupName, new Set(values.map((value) => foldText(value)))]),
);

const LOST_RELATIONS = new Set([
  "Rác",
  "Sai Thông Tin",
  "Thất bại",
  "Không tiếp cận được",
].map((value) => foldText(value)));

const INACTIVE_RELATIONS = new Set([
  "Nhu cầu xa",
  "Không tái ký",
].map((value) => foldText(value)));

const DEMO_RELATIONS = new Set([
  "Demo",
  "Hẹn demo",
  "Báo giá",
  "Gửi hợp đồng",
  "Đặt cọc",
  "Kí hợp đồng",
  "Đã tái ký",
  "Khách hàng dùng Thử",
].map((value) => foldText(value)));

const DEMO_KEYWORDS = [
  "demo",
  "bao gia",
  "hop dong",
  "thanh toan",
  "dat coc",
  "pitching",
];

function foldText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[đĐ]/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function openDatabase(dbPath = CRM_DB_PATH) {
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
    // Ignore close errors.
  }
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
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateKey(date);
}

function compareDateKeys(left, right) {
  return left.localeCompare(right);
}

function isValidDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""));
}

function getCurrentDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(dateKey) {
  return `${dateKey.slice(0, 7)}-01`;
}

function getIsoWeekParts(dateKey) {
  const date = parseDateKey(dateKey);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, isoWeek };
}

function getWeekStart(dateKey) {
  const date = parseDateKey(dateKey);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return formatDateKey(date);
}

function addWeekStart(weekStartKey, amount) {
  return addDays(weekStartKey, amount * 7);
}

function diffWeeks(startWeekKey, endWeekKey) {
  const start = parseDateKey(startWeekKey);
  const end = parseDateKey(endWeekKey);
  return Math.round((end.getTime() - start.getTime()) / (7 * 86400000));
}

function monthKeyToIndex(monthKey) {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  return (year * 12) + (month - 1);
}

function diffMonths(startMonthKey, endMonthKey) {
  return monthKeyToIndex(endMonthKey) - monthKeyToIndex(startMonthKey);
}

function addMonths(monthKey, amount) {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatCohortMonthLabel(monthKey) {
  return `${monthKey.slice(5, 7)}/${monthKey.slice(2, 4)}`;
}

function formatWeekLabel(dateKey) {
  const { isoYear, isoWeek } = getIsoWeekParts(dateKey);
  return `W${String(isoWeek).padStart(2, "0")}/${isoYear}`;
}

function normalizeSourceGroup(sourceName) {
  const normalized = foldText(sourceName);
  for (const groupName of SOURCE_GROUP_ORDER) {
    if (SOURCE_GROUPS.get(groupName)?.has(normalized)) {
      return groupName;
    }
  }
  return "Other";
}

function sanitizeFilters({ from, to, selectedSourceGroups, sourceMode, cohortGrain }) {
  const todayKey = getCurrentDateKey();
  let safeFrom = isValidDateKey(from) ? from : startOfMonth(todayKey);
  let safeTo = isValidDateKey(to) ? to : todayKey;
  if (compareDateKeys(safeFrom, safeTo) > 0) {
    [safeFrom, safeTo] = [safeTo, safeFrom];
  }

  const groups = Array.isArray(selectedSourceGroups)
    ? selectedSourceGroups.filter((item) => SOURCE_GROUP_ORDER.includes(item))
    : [];

  return {
    from: safeFrom,
    to: safeTo,
    sourceGroups: sourceMode === "custom" ? groups : SOURCE_GROUP_ORDER,
    sourceMode: sourceMode === "custom" ? "custom" : "all",
    cohortGrain: cohortGrain === "week" ? "week" : "month",
  };
}

function isDateInRange(dateKey, from, to) {
  return isValidDateKey(dateKey) && compareDateKeys(dateKey, from) >= 0 && compareDateKeys(dateKey, to) <= 0;
}

function matchesSources(sourceGroup, selectedSourceGroups) {
  return selectedSourceGroups.includes(sourceGroup);
}

function isLostRelation(relationName) {
  return LOST_RELATIONS.has(foldText(relationName));
}

function isInactiveRelation(relationName) {
  return INACTIVE_RELATIONS.has(foldText(relationName));
}

function isCancelledStatus(statusLabel) {
  return foldText(statusLabel).includes("huy");
}

function isDemoLead(relationName, latestInteraction, hasAnyNonCancelledOrder) {
  if (hasAnyNonCancelledOrder) {
    return true;
  }

  if (DEMO_RELATIONS.has(foldText(relationName))) {
    return true;
  }

  const normalizedInteraction = foldText(latestInteraction);
  return DEMO_KEYWORDS.some((keyword) => normalizedInteraction.includes(keyword));
}

function getCohortBuckets(endDateKey, grain) {
  if (grain === "week") {
    const endWeekStart = getWeekStart(endDateKey);
    return Array.from({ length: 6 }, (_, index) => addWeekStart(endWeekStart, index - 5)).map((weekStart) => ({
      key: weekStart,
      label: formatWeekLabel(weekStart),
    }));
  }

  const endMonthKey = endDateKey.slice(0, 7);
  return Array.from({ length: 6 }, (_, index) => addMonths(endMonthKey, index - 5)).map((monthKey) => ({
    key: monthKey,
    label: formatCohortMonthLabel(monthKey),
  }));
}

function buildCohortRows(customers, selectedSourceGroups, cohortGrain, endDateKey) {
  const buckets = getCohortBuckets(endDateKey, cohortGrain);
  const bucketMap = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        label: bucket.label,
        leadCount: 0,
        conversions: Array.from({ length: 9 }, () => ({ count: 0 })),
      },
    ]),
  );

  for (const customer of customers.values()) {
    if (!matchesSources(customer.sourceGroup, selectedSourceGroups) || !isValidDateKey(customer.createdDate)) {
      continue;
    }

    const cohortKey = cohortGrain === "week" ? customer.createdWeekStart : customer.createdMonthKey;
    const row = bucketMap.get(cohortKey);
    if (!row) {
      continue;
    }

    row.leadCount += 1;

    if (!customer.firstNonCancelledOrderDate) {
      continue;
    }

    const bucketOffset = cohortGrain === "week"
      ? diffWeeks(customer.createdWeekStart, customer.firstNonCancelledOrderWeekStart)
      : diffMonths(customer.createdMonthKey, customer.firstNonCancelledOrderMonthKey);

    if (bucketOffset >= 0 && bucketOffset <= 8) {
      row.conversions[bucketOffset].count += 1;
    }
  }

  return buckets.map((bucket) => {
    const row = bucketMap.get(bucket.key);
    const leadCount = row?.leadCount || 0;
    return {
      label: bucket.label,
      lead_count: leadCount,
      values: Array.from({ length: 9 }, (_, index) => {
        const convertedCount = row?.conversions[index].count || 0;
        return {
          count: convertedCount,
          rate: leadCount > 0 ? Number(((convertedCount / leadCount) * 100).toFixed(1)) : null,
        };
      }),
    };
  });
}

function buildSourceRows(customers, filteredCustomers, selectedSourceGroups) {
  return SOURCE_GROUP_ORDER
    .filter((groupName) => selectedSourceGroups.includes(groupName))
    .map((groupName) => {
      const leadCount = filteredCustomers.filter((customer) => customer.sourceGroup === groupName).length;
      const customerCount = filteredCustomers.filter((customer) => (
        customer.sourceGroup === groupName && customer.hasNonCancelledOrderInRange
      )).length;

      return {
        source_group: groupName,
        lead_count: leadCount,
        customer_count: customerCount,
        conversion_rate: leadCount > 0 ? Number(((customerCount / leadCount) * 100).toFixed(2)) : 0,
      };
    });
}

function buildOverallMetrics(leadCount, customerCount) {
  return {
    lead_count: leadCount,
    customer_count: customerCount,
    conversion_rate: leadCount > 0 ? Number(((customerCount / leadCount) * 100).toFixed(2)) : 0,
  };
}

export function getConversionPayload({
  from,
  to,
  selectedSourceGroups,
  sourceMode,
  cohortGrain,
  dbPath = CRM_DB_PATH,
} = {}) {
  const db = openDatabase(dbPath);

  try {
    const filters = sanitizeFilters({ from, to, selectedSourceGroups, sourceMode, cohortGrain });

    const customerRows = db.prepare(
      `
        SELECT
          TRIM(COALESCE(id_1, '')) AS id_1,
          TRIM(COALESCE(account_source_full_name, '')) AS account_source_full_name,
          TRIM(COALESCE(relation_name, '')) AS relation_name,
          COALESCE(latest_interaction, '') AS latest_interaction,
          SUBSTR(TRIM(COALESCE(created_at_1, '')), 1, 10) AS created_date
        FROM customers
      `,
    ).all();

    const orderRows = db.prepare(
      `
        SELECT
          TRIM(COALESCE(id_1, '')) AS id_1,
          TRIM(COALESCE(status_label, '')) AS status_label,
          TRIM(COALESCE(CAST(payment_status AS TEXT), '')) AS payment_status,
          SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) AS order_date
        FROM orders
      `,
    ).all();

    const customers = new Map();
    for (const row of customerRows) {
      if (!row.id_1 || !isValidDateKey(row.created_date)) {
        continue;
      }

      customers.set(row.id_1, {
        id: row.id_1,
        sourceGroup: normalizeSourceGroup(row.account_source_full_name),
        relationName: row.relation_name,
        latestInteraction: row.latest_interaction,
        createdDate: row.created_date,
        createdMonthKey: row.created_date.slice(0, 7),
        createdWeekStart: getWeekStart(row.created_date),
        firstNonCancelledOrderDate: null,
        firstNonCancelledOrderMonthKey: null,
        firstNonCancelledOrderWeekStart: null,
        hasNonCancelledOrderInRange: false,
        orderCountInRange: 0,
        hasAnyNonCancelledOrder: false,
      });
    }

    for (const row of orderRows) {
      const customer = customers.get(row.id_1);
      if (!customer || !isValidDateKey(row.order_date)) {
        continue;
      }

      const cancelled = isCancelledStatus(row.status_label);
      if (!cancelled) {
        customer.hasAnyNonCancelledOrder = true;
        if (!customer.firstNonCancelledOrderDate || compareDateKeys(row.order_date, customer.firstNonCancelledOrderDate) < 0) {
          customer.firstNonCancelledOrderDate = row.order_date;
          customer.firstNonCancelledOrderMonthKey = row.order_date.slice(0, 7);
          customer.firstNonCancelledOrderWeekStart = getWeekStart(row.order_date);
        }

        if (isDateInRange(row.order_date, filters.from, filters.to)) {
          customer.orderCountInRange += 1;
          customer.hasNonCancelledOrderInRange = true;
        }
      }
    }

    const customersInRange = Array.from(customers.values()).filter((customer) => (
      isDateInRange(customer.createdDate, filters.from, filters.to)
    ));

    const newLeads = customersInRange.length;
    const callMeetCount = customersInRange.filter((customer) => !isLostRelation(customer.relationName)).length;
    const demoCount = customersInRange.filter((customer) => (
      !isLostRelation(customer.relationName)
      && isDemoLead(customer.relationName, customer.latestInteraction, customer.hasAnyNonCancelledOrder)
    )).length;
    const saleOrderCount = customersInRange.filter((customer) => customer.hasNonCancelledOrderInRange).length;
    const lostCount = customersInRange.filter((customer) => isLostRelation(customer.relationName)).length;
    const inactiveCount = customersInRange.filter((customer) => isInactiveRelation(customer.relationName)).length;
    const sourceRows = buildSourceRows(customers, customersInRange, SOURCE_GROUP_ORDER);
    const overallConversion = buildOverallMetrics(newLeads, saleOrderCount);

    return {
      as_of: new Date().toISOString(),
      applied_filters: {
        from: filters.from,
        to: filters.to,
        source_groups: filters.sourceGroups,
        source_mode: filters.sourceMode,
        cohort_grain: filters.cohortGrain,
      },
      source_group_options: SOURCE_GROUP_ORDER,
      funnel: {
        stages: [
          { key: "new_leads", label: "New Leads", value: newLeads, rate: newLeads > 0 ? 100 : 0 },
          {
            key: "call_meet",
            label: "Call / Meet",
            value: callMeetCount,
            rate: newLeads > 0 ? Number(((callMeetCount / newLeads) * 100).toFixed(1)) : 0,
          },
          {
            key: "demo",
            label: "Demo",
            value: demoCount,
            rate: newLeads > 0 ? Number(((demoCount / newLeads) * 100).toFixed(1)) : 0,
          },
          {
            key: "sale_order",
            label: "Sale Order",
            value: saleOrderCount,
            rate: newLeads > 0 ? Number(((saleOrderCount / newLeads) * 100).toFixed(1)) : 0,
          },
        ],
        side_metrics: [
          {
            key: "lost",
            label: "Lost",
            value: lostCount,
            rate: newLeads > 0 ? Number(((lostCount / newLeads) * 100).toFixed(1)) : 0,
          },
          {
            key: "inactive",
            label: "Inactive",
            value: inactiveCount,
            rate: newLeads > 0 ? Number(((inactiveCount / newLeads) * 100).toFixed(1)) : 0,
          },
        ],
      },
      source_conversion: sourceRows,
      overall_conversion: overallConversion,
      cohort: {
        grain: filters.cohortGrain,
        rows: buildCohortRows(customers, filters.sourceGroups, filters.cohortGrain, filters.to),
      },
    };
  } finally {
    closeDatabase(db);
  }
}
