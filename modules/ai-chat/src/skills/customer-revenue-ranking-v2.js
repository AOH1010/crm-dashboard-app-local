import { createUsage } from "../contracts/chat-contracts.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";

function extractYear(question, fallbackYear) {
  const match = String(question || "").match(/\b(20\d{2})\b/);
  if (!match) {
    return fallbackYear;
  }
  const year = Number.parseInt(match[1], 10);
  return Number.isFinite(year) ? year : fallbackYear;
}

export const customerRevenueRankingSkillV2 = {
  id: "customer-revenue-ranking",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(khach hang|customer)/.test(foldedQuestion)
      && /(mua nhieu nhat|chi nhieu nhat|top customer|cao nhat|lon nhat)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const latestDateKey = connector.getLatestOrderDateKey();
    const latestYear = Number.parseInt(latestDateKey.slice(0, 4), 10) || new Date().getFullYear();
    const year = extractYear(context.latestQuestion, latestYear);
    const from = `${year}-01-01`;
    const to = year === latestYear ? latestDateKey : `${year}-12-31`;

    const result = await connector.runReadQueryAsync({
      sql: `
        SELECT
          TRIM(COALESCE(o.id_1, '')) AS customer_id,
          COALESCE(NULLIF(TRIM(c.title), ''), 'Unknown customer') AS customer_name,
          ROUND(SUM(COALESCE(o.real_amount, 0)), 2) AS revenue_amount,
          COUNT(*) AS order_count
        FROM orders o
        LEFT JOIN customers c ON TRIM(o.id_1) = TRIM(c.id_1)
        WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        GROUP BY customer_id, customer_name
        HAVING LENGTH(customer_id) > 0
        ORDER BY revenue_amount DESC, order_count DESC, customer_name ASC
      `,
      params: [from, to],
      allowPlaceholders: true,
      maxRows: 5
    });

    const rows = result.rows.map((row) => ({
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      revenue_amount: Number(row.revenue_amount || 0),
      order_count: Number(row.order_count || 0)
    }));
    const leader = rows[0] || null;

    const table = formatMarkdownTable(
      ["Top", "Mã KH", "Khách hàng", "Doanh thu", "Số đơn"],
      rows.map((row, index) => [
        String(index + 1),
        row.customer_id || "-",
        row.customer_name,
        formatCurrency(row.revenue_amount),
        row.order_count.toLocaleString("vi-VN")
      ])
    );

    const reply = leader
      ? [
        `Khách hàng mua nhiều nhất từ đầu năm ${year} đến ${to} là ${leader.customer_name}, mã ${leader.customer_id}, mang về ${formatCurrency(leader.revenue_amount)} từ ${leader.order_count.toLocaleString("vi-VN")} đơn.`,
        "Top 5 khách hàng:",
        table
      ].join("\n\n")
      : `Không tìm thấy dữ liệu mua hàng theo customer trong giai đoạn ${from} đến ${to}.`;

    return {
      reply,
      fallback_reply: reply,
      format_hint: leader ? "ranking_table" : "no_data",
      summary_facts: {
        year,
        period_from: from,
        period_to: to,
        leader
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
