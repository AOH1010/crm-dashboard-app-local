import { createUsage } from "../contracts/chat-contracts.js";
import { resolveCurrentPeriod } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";

export const topSellersPeriodSkill = {
  id: "top-sellers-period",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(top|xep hang)/.test(foldedQuestion)
      && /(seller|sale|nhan vien|nguoi ban)/.test(foldedQuestion);
  },
  run(context, connector) {
    const period = resolveCurrentPeriod({
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOrderDateKey()
    });

    const result = connector.runReadQuery({
      sql: `
        SELECT
          COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned') AS seller_name,
          ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount,
          COUNT(*) AS order_count
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        GROUP BY seller_name
        ORDER BY revenue_amount DESC, seller_name ASC
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 5
    });

    const rows = result.rows.slice(0, 5);
    const table = formatMarkdownTable(
      ["Top", "Seller", "Doanh thu", "So don"],
      rows.map((row, index) => [
        String(index + 1),
        row.seller_name,
        formatCurrency(row.revenue_amount),
        String(row.order_count)
      ])
    );

    return {
      reply: [
        `Top seller trong giai doan ${period.from} den ${period.to}:`,
        table
      ].join("\n\n"),
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
