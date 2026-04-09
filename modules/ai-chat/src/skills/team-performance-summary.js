import { createUsage } from "../contracts/chat-contracts.js";
import { resolveCurrentPeriod } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";
import { buildTeamCaseSql } from "./business-mappings.js";

const teamCaseSql = buildTeamCaseSql("s.dept_name");

export const teamPerformanceSummarySkill = {
  id: "team-performance-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(team|nhom)/.test(foldedQuestion)
      && /(doanh thu|doanh so|revenue|dan dau|xep hang|so sanh)/.test(foldedQuestion);
  },
  run(context, connector) {
    const period = resolveCurrentPeriod({
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOrderDateKey()
    });

    const result = connector.runReadQuery({
      sql: `
        WITH team_orders AS (
          SELECT
            ${teamCaseSql} AS team_label,
            COALESCE(NULLIF(TRIM(o.saler_name), ''), 'Unassigned') AS seller_name,
            COALESCE(o.real_amount, 0) AS revenue_amount
          FROM orders o
          LEFT JOIN staffs s
            ON TRIM(o.saler_name) = TRIM(s.contact_name)
          WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
            AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        )
        SELECT
          team_label,
          ROUND(SUM(revenue_amount), 2) AS revenue_amount,
          COUNT(*) AS order_count,
          COUNT(DISTINCT seller_name) AS seller_count
        FROM team_orders
        WHERE team_label <> 'Other'
        GROUP BY team_label
        ORDER BY revenue_amount DESC, order_count DESC, team_label ASC
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 10
    });

    const rows = result.rows.map((row) => ({
      team_label: row.team_label,
      revenue_amount: Number(row.revenue_amount || 0),
      order_count: Number(row.order_count || 0),
      seller_count: Number(row.seller_count || 0)
    }));
    const topTeam = rows[0];
    const table = formatMarkdownTable(
      ["Team", "Doanh thu", "So don", "Seller active"],
      rows.map((row) => [
        row.team_label,
        formatCurrency(row.revenue_amount),
        row.order_count.toLocaleString("vi-VN"),
        row.seller_count.toLocaleString("vi-VN")
      ])
    );

    const intro = topTeam
      ? `Team dan dau doanh thu trong giai doan ${period.from} den ${period.to} la ${topTeam.team_label} voi ${formatCurrency(topTeam.revenue_amount)}.`
      : `Khong tim thay du lieu team trong giai doan ${period.from} den ${period.to}.`;

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
