import { createUsage } from "../contracts/chat-contracts.js";
import { endOfMonthKey } from "../tooling/date-utils.js";
import { extractMonthYear, resolveCurrentPeriod, resolveMonthlyWindowFromContext } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";
import { buildTeamCaseSql } from "./business-mappings-v2.js";

const teamCaseSql = buildTeamCaseSql("s.dept_name");

function resolveSellerActivityPeriod(context, connector) {
  const latestQuestion = context.latestQuestion || "";
  if (extractMonthYear(latestQuestion)) {
    const monthWindow = resolveMonthlyWindowFromContext({
      question: latestQuestion,
      context,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });
    return {
      from: `${monthWindow.month_key}-01`,
      to: endOfMonthKey(`${monthWindow.month_key}-01`),
      label: monthWindow.label
    };
  }

  const period = resolveCurrentPeriod({
    selectedFilters: context.selectedFilters,
    latestDateKey: connector.getLatestOrderDateKey()
  });
  return {
    ...period,
    label: `${period.from} đến ${period.to}`
  };
}

export const activeSellersListSkill = {
  id: "active-sellers-list",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(seller|sale|nhan vien sale|nguoi ban)/.test(foldedQuestion)
      && /(active|hoat dong)/.test(foldedQuestion)
      && /(ten|danh sach|liet ke|nhung ai|gom ai|seller nao|ai dang|bao nhieu)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const period = resolveSellerActivityPeriod(context, connector);
    const result = await connector.runReadQueryAsync({
      sql: `
        WITH active_sellers AS (
          SELECT
            COALESCE(NULLIF(TRIM(o.saler_name), ''), 'Unassigned') AS seller_name,
            ${teamCaseSql} AS team_label,
            COUNT(*) AS order_count,
            ROUND(SUM(COALESCE(o.real_amount, 0)), 2) AS revenue_amount
          FROM orders o
          LEFT JOIN staffs s
            ON TRIM(o.saler_name) = TRIM(s.contact_name)
          WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
            AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
          GROUP BY seller_name, team_label
        )
        SELECT
          seller_name,
          team_label,
          order_count,
          revenue_amount
        FROM active_sellers
        WHERE seller_name <> 'Unassigned'
        ORDER BY revenue_amount DESC, order_count DESC, seller_name ASC
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 40
    });

    const rows = result.rows.map((row) => ({
      seller_name: row.seller_name,
      team_label: row.team_label,
      order_count: Number(row.order_count || 0),
      revenue_amount: Number(row.revenue_amount || 0)
    }));

    const table = formatMarkdownTable(
      ["Seller", "Team", "Số đơn", "Doanh thu"],
      rows.map((row) => [
        row.seller_name,
        row.team_label || "Other",
        row.order_count.toLocaleString("vi-VN"),
        formatCurrency(row.revenue_amount)
      ])
    );

    const asksCountOnly = /(bao nhieu|tong so|co may)/.test(context.foldedQuestion || "");
    const reply = rows.length === 0
      ? `Không có seller active nào trong ${period.label}.`
      : asksCountOnly
        ? [
          `Trong ${period.label}, có ${rows.length.toLocaleString("vi-VN")} seller active.`,
          `Tôi đang tính "seller active" là seller có ít nhất 1 đơn không hủy trong kỳ.`,
          table
        ].join("\n\n")
        : [
          `Danh sách seller active trong ${period.label}:`,
          `Tôi đang tính "seller active" là seller có ít nhất 1 đơn không hủy trong kỳ.`,
          table
        ].join("\n\n");

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? "table" : "no_data",
      summary_facts: {
        period_label: period.label,
        period_from: period.from,
        period_to: period.to,
        active_seller_count: rows.length,
        definition_key: "seller_active_has_non_cancelled_order_in_period"
      },
      data: {
        sellers: rows
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
