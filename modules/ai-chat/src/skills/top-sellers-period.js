import { createUsage } from "../contracts/chat-contracts.js";
import { endOfMonthKey } from "../tooling/date-utils.js";
import { resolveCurrentPeriod, resolveMonthlyWindow } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";

function resolveRankingPeriod(context, connector) {
  const latestQuestion = String(context.latestQuestion || "");
  if (/thang\s*\d{1,2}|\bthang nay\b|\bthang truoc\b/.test(latestQuestion.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) {
    const monthWindow = resolveMonthlyWindow({
      question: latestQuestion,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });
    return {
      mode: "month",
      from: `${monthWindow.month_key}-01`,
      to: endOfMonthKey(`${monthWindow.month_key}-01`),
      label: monthWindow.label,
      month_key: monthWindow.month_key,
      inferred_year: monthWindow.inferred_year
    };
  }

  const period = resolveCurrentPeriod({
    selectedFilters: context.selectedFilters,
    latestDateKey: connector.getLatestOrderDateKey()
  });
  return {
    mode: "range",
    from: period.from,
    to: period.to,
    label: `${period.from} đến ${period.to}`,
    month_key: null,
    inferred_year: false
  };
}

export const topSellersPeriodSkill = {
  id: "top-sellers-period",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(top|xep hang)/.test(foldedQuestion)
      && /(seller|sale|nhan vien|nguoi ban)/.test(foldedQuestion);
  },
  run(context, connector) {
    const period = resolveRankingPeriod(context, connector);
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

    const rows = result.rows.slice(0, 5).map((row) => ({
      seller_name: row.seller_name,
      revenue_amount: Number(row.revenue_amount || 0),
      order_count: Number(row.order_count || 0)
    }));
    const leader = rows[0] || null;
    const table = formatMarkdownTable(
      ["Top", "Seller", "Doanh thu", "Số đơn"],
      rows.map((row, index) => [
        String(index + 1),
        row.seller_name,
        formatCurrency(row.revenue_amount),
        row.order_count.toLocaleString("vi-VN")
      ])
    );

    let reply;
    if (!leader) {
      reply = `Không tìm thấy dữ liệu xếp hạng seller trong ${period.label}.`;
    } else {
      const assumptionText = period.inferred_year ? " Tôi đang mặc định năm mới nhất trong dữ liệu." : "";
      reply = [
        `Người dẫn đầu doanh thu trong ${period.label} là ${leader.seller_name} với ${formatCurrency(leader.revenue_amount)} từ ${leader.order_count.toLocaleString("vi-VN")} đơn.${assumptionText}`,
        "Top 5 seller:",
        table
      ].join("\n\n");
    }

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? "ranking_table" : "no_data",
      summary_facts: leader ? {
        period_label: period.label,
        period_from: period.from,
        period_to: period.to,
        leader: leader
      } : {
        period_label: period.label,
        period_from: period.from,
        period_to: period.to,
        leader: null
      },
      data: {
        ranking: rows
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
