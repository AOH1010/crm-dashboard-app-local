import { createUsage } from "../contracts/chat-contracts.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";

function extractLimit(question) {
  const match = String(question || "").match(/\b(\d{1,2})\b/);
  const parsed = Number.parseInt(match?.[1] || "5", 10);
  if (!Number.isFinite(parsed)) {
    return 5;
  }
  return Math.min(Math.max(parsed, 1), 20);
}

export const recentOrdersListSkill = {
  id: "recent-orders-list",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /((\d+\s+)?don hang moi nhat|recent orders?|order moi nhat)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const limit = extractLimit(context.latestQuestion);
    const result = await connector.runReadQueryAsync({
      sql: `
        SELECT
          order_code,
          customer_title,
          order_date,
          amount,
          seller_name,
          team_name,
          status_label
        FROM recent_orders
        ORDER BY sort_timestamp DESC, order_id DESC
      `,
      maxRows: limit
    });

    const rows = result.rows.map((row) => ({
      order_code: row.order_code,
      customer_title: row.customer_title,
      order_date: row.order_date,
      amount: Number(row.amount || 0),
      seller_name: row.seller_name,
      team_name: row.team_name,
      status_label: row.status_label
    }));

    const table = formatMarkdownTable(
      ["Mã đơn", "Ngày", "Khách hàng", "Seller", "Giá trị", "Trạng thái"],
      rows.map((row) => [
        row.order_code || "N/A",
        row.order_date || "-",
        row.customer_title || "-",
        row.seller_name || "-",
        formatCurrency(row.amount),
        row.status_label || "-"
      ])
    );

    const reply = rows.length > 0
      ? [
        `${rows.length.toLocaleString("vi-VN")} đơn hàng mới nhất hiện tại:`,
        table
      ].join("\n\n")
      : "Không tìm thấy đơn hàng mới nhất trong dữ liệu hiện tại.";

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? "ranking_table" : "no_data",
      summary_facts: {
        limit,
        order_count: rows.length,
        latest_order: rows[0] || null
      },
      data: {
        orders: rows
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
