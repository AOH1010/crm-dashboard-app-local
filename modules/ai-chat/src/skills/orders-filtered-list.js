import { createUsage } from "../contracts/chat-contracts.js";
import { resolveMonthlyWindow } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";

function extractAmountThreshold(question) {
  const normalized = String(question || "").toLowerCase();
  const millionMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*trieu/);
  if (millionMatch) {
    return Math.round(Number.parseFloat(millionMatch[1].replace(",", ".")) * 1_000_000);
  }

  const billionMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*ty/);
  if (billionMatch) {
    return Math.round(Number.parseFloat(billionMatch[1].replace(",", ".")) * 1_000_000_000);
  }

  const plainMatch = normalized.match(/\b(\d{7,12})\b/);
  if (plainMatch) {
    return Number.parseInt(plainMatch[1], 10);
  }

  return 50_000_000;
}

export const ordersFilteredListSkill = {
  id: "orders-filtered-list",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(don hang|order)/.test(foldedQuestion)
      && /(liet ke|loc|filter|tren|duoi|it nhat|nho hon)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const amountThreshold = extractAmountThreshold(context.latestQuestion);
    const resolvedMonth = resolveMonthlyWindow({
      question: context.latestQuestion,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });

    const result = await connector.runReadQueryAsync({
      sql: `
        SELECT
          COALESCE(NULLIF(TRIM(order_code), ''), 'N/A') AS order_code,
          COALESCE(real_amount, 0) AS amount,
          COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned') AS seller_name,
          SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) AS order_date
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) = ?
          AND COALESCE(real_amount, 0) >= ?
        ORDER BY amount DESC, order_date DESC, order_code ASC
      `,
      params: [resolvedMonth.month_key, amountThreshold],
      allowPlaceholders: true,
      maxRows: 10
    });

    const rows = result.rows.map((row) => ({
      order_code: row.order_code,
      amount: Number(row.amount || 0),
      seller_name: row.seller_name,
      order_date: row.order_date
    }));

    const table = formatMarkdownTable(
      ["Mã đơn", "Ngày", "Seller", "Giá trị"],
      rows.map((row) => [
        row.order_code,
        row.order_date || "-",
        row.seller_name || "-",
        formatCurrency(row.amount)
      ])
    );

    const reply = rows.length > 0
      ? [
        `Tìm thấy ${rows.length.toLocaleString("vi-VN")} đơn hàng từ ${formatCurrency(amountThreshold)} trở lên trong ${resolvedMonth.label}.`,
        table
      ].join("\n\n")
      : `Không tìm thấy đơn hàng nào từ ${formatCurrency(amountThreshold)} trở lên trong ${resolvedMonth.label}.`;

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? "ranking_table" : "no_data",
      summary_facts: {
        month_key: resolvedMonth.month_key,
        month_label: resolvedMonth.label,
        amount_threshold: amountThreshold,
        order_count: rows.length
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
