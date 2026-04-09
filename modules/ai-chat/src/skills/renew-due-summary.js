import { createUsage } from "../contracts/chat-contracts.js";
import { resolveMonthEndKey } from "../tooling/question-analysis.js";
import { formatPercent } from "./formatters.js";

export const renewDueSummarySkill = {
  id: "renew-due-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(renew|gia han|sap het han|den han)/.test(foldedQuestion);
  },
  run(context, connector) {
    const monthContext = resolveMonthEndKey({
      question: context.latestQuestion,
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOperationsMonthEndKey() || connector.getLatestOrderDateKey()
    });

    const result = connector.runReadQuery({
      sql: `
        SELECT
          COUNT(*) AS due_count,
          SUM(CASE WHEN renewed = 1 THEN 1 ELSE 0 END) AS renewed_count
        FROM due_accounts
        WHERE due_month_key = ?
      `,
      params: [monthContext.month_end_key],
      allowPlaceholders: true,
      maxRows: 1
    });

    const expiringSoon = connector.runReadQuery({
      sql: `
        SELECT
          customer_name,
          account,
          due_date,
          sale_owner
        FROM due_accounts
        WHERE due_month_key = ?
        ORDER BY due_date ASC, account ASC
      `,
      params: [monthContext.month_end_key],
      allowPlaceholders: true,
      maxRows: 5
    });

    const row = result.rows[0] || {};
    const dueCount = Number(row.due_count || 0);
    const renewedCount = Number(row.renewed_count || 0);
    const renewalRate = dueCount > 0 ? (renewedCount / dueCount) * 100 : 0;
    const expiringText = expiringSoon.rows.length > 0
      ? `- Mau 5 account dau: ${expiringSoon.rows.map((item) => item.account).join(", ")}.`
      : "- Chua co account mau trong ky nay.";

    return {
      reply: [
        `Tong hop renew trong ky ${monthContext.label}:`,
        `- So account den han: ${dueCount.toLocaleString("vi-VN")}.`,
        `- So account da renew: ${renewedCount.toLocaleString("vi-VN")} (${formatPercent(renewalRate)}).`,
        `- Chua renew: ${Math.max(0, dueCount - renewedCount).toLocaleString("vi-VN")}.`,
        expiringText
      ].join("\n"),
      sqlLogs: [
        {
          name: `${this.id}_summary`,
          sql: result.sql,
          row_count: result.row_count,
          row_limit: result.row_limit
        },
        {
          name: `${this.id}_sample`,
          sql: expiringSoon.sql,
          row_count: expiringSoon.row_count,
          row_limit: expiringSoon.row_limit
        }
      ],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
