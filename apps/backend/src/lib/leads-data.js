import { DatabaseSync } from "node:sqlite";
import { CRM_DB_PATH } from "./dashboard-sales-db.js";

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

function normalizeProvinceKey(value) {
  const folded = foldText(value).replace(/\./g, " ");
  let normalized = folded;
  if (normalized.startsWith("tinh ")) {
    normalized = normalized.slice(5);
  } else if (normalized.startsWith("thanh pho ")) {
    normalized = normalized.slice(10);
  } else if (normalized.startsWith("tp ")) {
    normalized = normalized.slice(3);
  }
  return normalized.replace(/[^a-z0-9]/g, "");
}

function normalizeLabel(value) {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : "Unknown";
}

function sortByLeadsThenCustomers(left, right) {
  if (right.lead_count !== left.lead_count) {
    return right.lead_count - left.lead_count;
  }
  if (right.customer_count !== left.customer_count) {
    return right.customer_count - left.customer_count;
  }
  return String(left.name || left.province_key).localeCompare(String(right.name || right.province_key));
}

export function getLeadsPayload({ dbPath = CRM_DB_PATH } = {}) {
  const db = openDatabase(dbPath);

  try {
    const customerRows = db.prepare(
      `
        SELECT
          TRIM(COALESCE(id_1, '')) AS id_1,
          TRIM(COALESCE(province_name, '')) AS province_name,
          TRIM(COALESCE(industry_name, '')) AS industry_name,
          TRIM(COALESCE(customer_group_name, '')) AS customer_group_name
        FROM customers
      `,
    ).all();

    const orderRows = db.prepare(
      `
        SELECT
          TRIM(COALESCE(id_1, '')) AS id_1,
          TRIM(COALESCE(status_label, '')) AS status_label
        FROM orders
      `,
    ).all();

    const convertedCustomerIds = new Set();
    for (const row of orderRows) {
      if (!row.id_1) {
        continue;
      }
      const isCancelled = foldText(row.status_label).includes("huy");
      if (!isCancelled) {
        convertedCustomerIds.add(row.id_1);
      }
    }

    const seenCustomerIds = new Set();
    const provinceMap = new Map();
    const industryMap = new Map();
    const segmentMap = new Map();

    let totalLeads = 0;
    let totalCustomers = 0;
    let blankProvinceCount = 0;

    for (const row of customerRows) {
      if (!row.id_1 || seenCustomerIds.has(row.id_1)) {
        continue;
      }
      seenCustomerIds.add(row.id_1);

      totalLeads += 1;
      const isCustomer = convertedCustomerIds.has(row.id_1);
      if (isCustomer) {
        totalCustomers += 1;
      }

      const provinceRaw = String(row.province_name || "").trim();
      if (provinceRaw.length === 0) {
        blankProvinceCount += 1;
      } else {
        const provinceKey = normalizeProvinceKey(provinceRaw);
        if (provinceKey.length > 0) {
          const current = provinceMap.get(provinceKey) || {
            province_key: provinceKey,
            lead_count: 0,
            customer_count: 0,
          };
          current.lead_count += 1;
          if (isCustomer) {
            current.customer_count += 1;
          }
          provinceMap.set(provinceKey, current);
        } else {
          blankProvinceCount += 1;
        }
      }

      const industryName = normalizeLabel(row.industry_name);
      const industryEntry = industryMap.get(industryName) || {
        name: industryName,
        lead_count: 0,
        customer_count: 0,
      };
      industryEntry.lead_count += 1;
      if (isCustomer) {
        industryEntry.customer_count += 1;
      }
      industryMap.set(industryName, industryEntry);

      const segmentName = normalizeLabel(row.customer_group_name);
      const segmentEntry = segmentMap.get(segmentName) || {
        name: segmentName,
        lead_count: 0,
        customer_count: 0,
      };
      segmentEntry.lead_count += 1;
      if (isCustomer) {
        segmentEntry.customer_count += 1;
      }
      segmentMap.set(segmentName, segmentEntry);
    }

    const provinceCounts = Array.from(provinceMap.values()).sort(sortByLeadsThenCustomers);
    const topProvinces = {
      leads: provinceCounts
        .slice()
        .sort((left, right) => right.lead_count - left.lead_count || left.province_key.localeCompare(right.province_key))
        .slice(0, 5),
      customers: provinceCounts
        .slice()
        .sort((left, right) => right.customer_count - left.customer_count || left.province_key.localeCompare(right.province_key))
        .slice(0, 5),
    };

    const industryMix = Array.from(industryMap.values()).sort(sortByLeadsThenCustomers);
    const segmentConversion = Array.from(segmentMap.values())
      .map((segment) => ({
        segment_group: segment.name,
        lead_count: segment.lead_count,
        customer_count: segment.customer_count,
        conversion_rate: segment.lead_count > 0 ? Number(((segment.customer_count / segment.lead_count) * 100).toFixed(2)) : 0,
      }))
      .sort((left, right) => (
        right.conversion_rate - left.conversion_rate
        || right.customer_count - left.customer_count
        || right.lead_count - left.lead_count
        || left.segment_group.localeCompare(right.segment_group)
      ));

    return {
      as_of: new Date().toISOString(),
      summary: {
        total_leads: totalLeads,
        total_customers: totalCustomers,
        blank_province_count: blankProvinceCount,
      },
      map: {
        province_counts: provinceCounts,
        top_provinces: topProvinces,
      },
      industry_mix: industryMix,
      segment_conversion: segmentConversion,
    };
  } finally {
    closeDatabase(db);
  }
}
