import { createUsage } from "../contracts/chat-contracts.js";
import { resolveCurrentPeriod } from "../tooling/question-analysis.js";
import { formatMarkdownTable, formatPercent } from "./formatters.js";
import { buildSourceGroupCaseSql } from "./business-mappings.js";

const sourceGroupCaseSql = buildSourceGroupCaseSql("c.account_source_full_name");

export const conversionSourceSummarySkill = {
  id: "conversion-source-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(nguon|source)/.test(foldedQuestion)
      && /(conversion|chuyen doi|khach moi|lead)/.test(foldedQuestion);
  },
  run(context, connector) {
    const period = resolveCurrentPeriod({
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOrderDateKey()
    });

    const result = connector.runReadQuery({
      sql: `
        WITH customer_base AS (
          SELECT
            TRIM(COALESCE(c.id_1, '')) AS customer_id,
            ${sourceGroupCaseSql} AS source_group,
            SUBSTR(TRIM(COALESCE(c.created_at_1, '')), 1, 10) AS created_date
          FROM customers c
          WHERE LENGTH(TRIM(COALESCE(c.id_1, ''))) > 0
            AND LENGTH(SUBSTR(TRIM(COALESCE(c.created_at_1, '')), 1, 10)) = 10
        ),
        order_customers AS (
          SELECT DISTINCT TRIM(COALESCE(o.id_1, '')) AS customer_id
          FROM orders o
          WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
            AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        )
        SELECT
          source_group,
          COUNT(*) AS lead_count,
          SUM(CASE WHEN oc.customer_id IS NOT NULL THEN 1 ELSE 0 END) AS customer_count
        FROM customer_base cb
        LEFT JOIN order_customers oc
          ON oc.customer_id = cb.customer_id
        WHERE cb.created_date BETWEEN ? AND ?
        GROUP BY source_group
        HAVING COUNT(*) > 0
        ORDER BY (SUM(CASE WHEN oc.customer_id IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) DESC,
                 customer_count DESC,
                 lead_count DESC,
                 source_group ASC
      `,
      params: [period.from, period.to, period.from, period.to],
      allowPlaceholders: true,
      maxRows: 6
    });

    const rows = result.rows.map((row) => {
      const leadCount = Number(row.lead_count || 0);
      const customerCount = Number(row.customer_count || 0);
      const conversionRate = leadCount > 0 ? (customerCount / leadCount) * 100 : 0;
      return {
        source_group: row.source_group,
        lead_count: leadCount,
        customer_count: customerCount,
        conversion_rate: conversionRate
      };
    });

    const topGroup = rows[0];
    const table = formatMarkdownTable(
      ["Nhom nguon", "Lead", "Khach moi", "Conversion"],
      rows.map((row) => [
        row.source_group,
        row.lead_count.toLocaleString("vi-VN"),
        row.customer_count.toLocaleString("vi-VN"),
        formatPercent(row.conversion_rate)
      ])
    );

    const intro = topGroup
      ? `Nhom nguon co conversion cao nhat trong giai doan ${period.from} den ${period.to} la ${topGroup.source_group} voi ${formatPercent(topGroup.conversion_rate)}.`
      : `Khong tim thay du lieu conversion theo nguon trong giai doan ${period.from} den ${period.to}.`;

    return {
      reply: [intro, table].join("\n\n"),
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
