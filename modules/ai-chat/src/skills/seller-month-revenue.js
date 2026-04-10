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

    const monthTotalResult = connector.runReadQuery({
      sql: `
        SELECT
          ROUND(SUM(COALESCE(real_amount, 0)), 2) AS total_revenue
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) = ?
      `,
      params: [resolvedMonth.month_key],
      allowPlaceholders: true,
      maxRows: 1
    });

    const nonCancelledRows = result.rows.filter((row) => !foldText(row.status_label).includes("huy"));
    const totalRevenue = nonCancelledRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const orderCount = nonCancelledRows.length;
    const monthTotalRevenue = Number(monthTotalResult.rows[0]?.total_revenue || 0);
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    const sellerSharePercent = monthTotalRevenue > 0 ? (totalRevenue / monthTotalRevenue) * 100 : 0;

    let reply;
    if (orderCount === 0) {
      reply = `Không tìm thấy doanh số của ${sellerName} trong ${resolvedMonth.label}.`;
    } else {
      const assumptionText = resolvedMonth.inferred_year ? " Tôi đang mặc định năm mới nhất trong dữ liệu." : "";
      const replyLines = [
        `Trong ${resolvedMonth.label}, ${sellerName} đạt doanh số ${formatCurrency(totalRevenue)} từ ${orderCount.toLocaleString("vi-VN")} đơn không huỷ.${assumptionText}`,
        `- Bình quân mỗi đơn: ${formatCurrency(averageOrderValue)}.`
      ];

      if (monthTotalRevenue > 0) {
        replyLines.push(`- Tỷ trọng trong tổng doanh thu toàn kỳ: ${sellerSharePercent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%.`);
      }

      reply = replyLines.join("\n");
    }

    return {
      reply,
      fallback_reply: reply,
      format_hint: orderCount > 0 ? "summary" : "no_data",
      summary_facts: {
        seller_name: sellerName,
        month_label: resolvedMonth.label,
        month_key: resolvedMonth.month_key,
        inferred_year: resolvedMonth.inferred_year,
        total_revenue: totalRevenue,
        order_count: orderCount,
        average_order_value: averageOrderValue,
        month_total_revenue: monthTotalRevenue,
        seller_share_percent: sellerSharePercent
      },
      data: orderCount > 0 ? {
        non_cancelled_orders: nonCancelledRows.map((row) => ({
          amount: Number(row.amount || 0),
          order_code: row.order_code
        }))
      } : null,
      sqlLogs: [{
        name: this.id,
        sql: result.sql,
        row_count: result.row_count,
        row_limit: result.row_limit
      }, {
        name: `${this.id}_month_total`,
        sql: monthTotalResult.sql,
        row_count: monthTotalResult.row_count,
        row_limit: monthTotalResult.row_limit
      }],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
