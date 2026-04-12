import { createUsage } from "../contracts/chat-contracts.js";
import { endOfMonthKey } from "../tooling/date-utils.js";
import { resolveCurrentPeriod, resolveMonthlyWindowFromContext } from "../tooling/question-analysis.js";
import { formatMarkdownTable, formatPercent } from "./formatters.js";
import { buildSourceGroupCaseSql } from "./business-mappings-v2.js";

const sourceGroupCaseSql = buildSourceGroupCaseSql("c.account_source_full_name");

export const conversionSourceSummarySkill = {
  id: "conversion-source-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(nguon|source|kenh)/.test(foldedQuestion)
      && /(conversion|chuyen doi|\bcr\b|khach moi|lead)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const latestDateKey = connector.getLatestOrderDateKey();
    const latestMonthKey = connector.getLatestMonthKey();
    const latestYear = connector.getLatestOrderYear();
    const hasConversationContext = Array.isArray(context.normalizedMessages) && context.normalizedMessages.length > 1;
    const period = hasConversationContext
      ? (() => {
        const monthWindow = resolveMonthlyWindowFromContext({
          question: context.routingQuestion || context.latestQuestion,
          context,
          selectedFilters: context.selectedFilters,
          latestMonthKey,
          latestYear
        });
        return {
          from: `${monthWindow.month_key}-01`,
          to: monthWindow.month_key === latestMonthKey ? latestDateKey : endOfMonthKey(`${monthWindow.month_key}-01`)
        };
      })()
      : resolveCurrentPeriod({
        selectedFilters: context.selectedFilters,
        latestDateKey
      });

    const result = await connector.runReadQueryAsync({
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

    const topGroup = rows[0] || null;
    const table = formatMarkdownTable(
      ["Nhóm nguồn", "Lead", "Khách mới", "Conversion"],
      rows.map((row) => [
        row.source_group,
        row.lead_count.toLocaleString("vi-VN"),
        row.customer_count.toLocaleString("vi-VN"),
        formatPercent(row.conversion_rate)
      ])
    );

    const reply = topGroup
      ? [
        `Nhóm nguồn có conversion cao nhất trong giai đoạn ${period.from} đến ${period.to} là ${topGroup.source_group} với ${formatPercent(topGroup.conversion_rate)}.`,
        table
      ].join("\n\n")
      : `Không tìm thấy dữ liệu conversion theo nguồn trong giai đoạn ${period.from} đến ${period.to}.`;

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? "ranking_table" : "no_data",
      summary_facts: {
        period_from: period.from,
        period_to: period.to,
        top_source_group: topGroup
      },
      data: {
        sources: rows
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
