import { createUsage } from "../contracts/chat-contracts.js";
import { foldText } from "../tooling/common.js";
import { formatMarkdownTable, formatPercent } from "./formatters.js";

function normalizeProvinceKey(value) {
  return foldText(value)
    .replace(/\b(tp|tp\.|thanh pho)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProvinceLabel(value) {
  const lower = String(value || "")
    .trim()
    .toLocaleLowerCase("vi-VN");
  return lower.replace(/\p{L}+/gu, (word) => (
    word.charAt(0).toLocaleUpperCase("vi-VN") + word.slice(1)
  ));
}

export const leadGeographySkill = {
  id: "lead-geography",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(tinh|thanh pho|province|dia ly)/.test(foldedQuestion)
      && /\blead\b|khach moi/.test(foldedQuestion);
  },
  async run(context, connector) {
    const result = await connector.runReadQueryAsync({
      sql: `
        WITH converted_customers AS (
          SELECT DISTINCT TRIM(COALESCE(id_1, '')) AS customer_id
          FROM orders
          WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
        )
        SELECT
          TRIM(COALESCE(c.province_name, '')) AS province_name,
          COUNT(*) AS lead_count,
          SUM(CASE WHEN cc.customer_id IS NOT NULL THEN 1 ELSE 0 END) AS customer_count
        FROM customers c
        LEFT JOIN converted_customers cc ON cc.customer_id = TRIM(COALESCE(c.id_1, ''))
        WHERE LENGTH(TRIM(COALESCE(c.province_name, ''))) > 0
        GROUP BY TRIM(COALESCE(c.province_name, ''))
        ORDER BY lead_count DESC, customer_count DESC, province_name ASC
      `,
      maxRows: 200
    });

    const provinceMap = new Map();
    for (const row of result.rows) {
      const leadCount = Number(row.lead_count || 0);
      const customerCount = Number(row.customer_count || 0);
      const provinceKey = normalizeProvinceKey(row.province_name);
      if (!provinceKey) {
        continue;
      }
      const displayLabel = formatProvinceLabel(row.province_name);
      const current = provinceMap.get(provinceKey) || {
        province_name: displayLabel,
        lead_count: 0,
        customer_count: 0
      };
      const shouldReplaceLabel = leadCount > current.lead_count;
      current.lead_count += leadCount;
      current.customer_count += customerCount;
      if (shouldReplaceLabel) {
        current.province_name = displayLabel;
      }
      provinceMap.set(provinceKey, current);
    }

    const rows = Array.from(provinceMap.values())
      .map((row) => ({
        ...row,
        conversion_rate: row.lead_count > 0 ? (row.customer_count / row.lead_count) * 100 : 0
      }))
      .sort((left, right) => (
        right.lead_count - left.lead_count
        || right.customer_count - left.customer_count
        || left.province_name.localeCompare(right.province_name, "vi")
      ))
      .slice(0, 5);
    const leader = rows[0] || null;

    const table = formatMarkdownTable(
      ["Tỉnh", "Lead", "Khách đã mua", "Conversion"],
      rows.map((row) => [
        row.province_name,
        row.lead_count.toLocaleString("vi-VN"),
        row.customer_count.toLocaleString("vi-VN"),
        formatPercent(row.conversion_rate)
      ])
    );

    const reply = leader
      ? [
        `Tỉnh đang có nhiều lead nhất hiện tại là ${leader.province_name} với ${leader.lead_count.toLocaleString("vi-VN")} lead.`,
        "Top 5 tỉnh/thành:",
        table
      ].join("\n\n")
      : "Không tìm thấy dữ liệu lead theo tỉnh/thành.";

    return {
      reply,
      fallback_reply: reply,
      format_hint: leader ? "ranking_table" : "no_data",
      summary_facts: {
        top_province: leader,
        province_count: rows.length
      },
      data: {
        provinces: rows
      },
      sqlLogs: [{
        name: this.id,
        sql: result.sql,
        row_count: result.row_count,
        row_limit: result.row_limit
      }],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
