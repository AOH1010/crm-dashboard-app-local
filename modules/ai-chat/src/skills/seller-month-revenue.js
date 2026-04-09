import { foldText } from "../tooling/common.js";
import { resolveMonthlyWindow } from "../tooling/question-analysis.js";
import { createUsage } from "../contracts/chat-contracts.js";
import { formatCurrency } from "./formatters.js";

export const sellerMonthRevenueSkill = {
  id: "seller-month-revenue",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    if (!/(doanh so|doanh thu|revenue|ban duoc bao nhieu)/.test(foldedQuestion)) {
      return false;
    }
    return Boolean(context.connector.detectSellerName(context.latestQuestion));
  },
  run(context, connector) {
    const sellerName = connector.detectSellerName(context.latestQuestion);
    if (!sellerName) {
      return null;
    }

    const resolvedMonth = resolveMonthlyWindow({
      question: context.latestQuestion,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });

    const result = connector.runReadQuery({
      sql: `
        SELECT
          COALESCE(real_amount, 0) AS amount,
          TRIM(COALESCE(status_label, '')) AS status_label,
          COALESCE(NULLIF(TRIM(order_code), ''), 'N/A') AS order_code
        FROM orders
        WHERE TRIM(COALESCE(saler_name, '')) = ?
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) = ?
      `,
      params: [sellerName, resolvedMonth.month_key],
      allowPlaceholders: true,
      maxRows: 200
    });

    const nonCancelledRows = result.rows.filter((row) => !foldText(row.status_label).includes("huy"));
    const totalRevenue = nonCancelledRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const orderCount = nonCancelledRows.length;

    let reply;
    if (orderCount === 0) {
      reply = `Khong tim thay doanh so cua ${sellerName} trong ${resolvedMonth.label}.`;
    } else {
      const assumptionText = resolvedMonth.inferred_year ? " (mac dinh nam moi nhat trong du lieu)" : "";
      reply = [
        `${sellerName} dat doanh so ${formatCurrency(totalRevenue)} trong ${resolvedMonth.label}${assumptionText}.`,
        `- So don khong huy: ${orderCount}.`,
        `- Doanh thu binh quan/don: ${formatCurrency(totalRevenue / orderCount)}.`
      ].join("\n");
    }

    return {
      reply,
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
