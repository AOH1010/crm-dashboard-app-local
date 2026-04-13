import { createUsage } from "../contracts/chat-contracts.js";
import { endOfMonthKey } from "../tooling/date-utils.js";
import { extractMonthYear, resolveCurrentPeriod, resolveMonthlyWindowFromContext } from "../tooling/question-analysis.js";

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

export const sellerActivityDefinitionSkill = {
  id: "seller-activity-definition",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(seller|sale|nhan vien sale|nguoi ban)/.test(foldedQuestion)
      && /(active|hoat dong)/.test(foldedQuestion)
      && /(la gi|la nhung gi|nghia la gi|duoc tinh nhu nao|tieu chi gi|criteria)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const period = resolveSellerActivityPeriod(context, connector);
    const countResult = await connector.runReadQueryAsync({
      sql: `
        SELECT
          COUNT(DISTINCT COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned')) AS active_seller_count
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
          AND COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned') <> 'Unassigned'
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 1
    });

    const activeSellerCount = Number(countResult.rows[0]?.active_seller_count || 0);
    const reply = [
      `Trong runtime hiện tại, "seller active" được hiểu là seller có ít nhất 1 đơn không hủy trong kỳ đang xét.`,
      `Nếu bạn không nói rõ kỳ, tôi sẽ ưu tiên kỳ hiện tại từ filter hoặc ngữ cảnh câu hỏi.`,
      `Với ${period.label}, hiện có ${activeSellerCount.toLocaleString("vi-VN")} seller active theo định nghĩa này.`
    ].join("\n\n");

    return {
      reply,
      fallback_reply: reply,
      format_hint: "definition",
      summary_facts: {
        definition_key: "seller_active_has_non_cancelled_order_in_period",
        definition_text: "seller có ít nhất 1 đơn không hủy trong kỳ đang xét",
        period_label: period.label,
        period_from: period.from,
        period_to: period.to,
        active_seller_count: activeSellerCount
      },
      data: {
        definition: {
          key: "seller_active_has_non_cancelled_order_in_period",
          text: "seller có ít nhất 1 đơn không hủy trong kỳ đang xét"
        }
      },
      sqlLogs: [{
        name: this.id,
        sql: countResult.sql,
        row_count: countResult.row_count,
        row_limit: countResult.row_limit
      }],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
