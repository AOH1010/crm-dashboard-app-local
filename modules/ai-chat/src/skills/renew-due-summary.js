import { createUsage } from "../contracts/chat-contracts.js";
import { resolveMonthEndKey } from "../tooling/question-analysis.js";
import { formatPercent } from "./formatters.js";

function shouldIncludeSampleAccounts(question) {
  const foldedQuestion = String(question || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /(account nao|danh sach|mau|chi tiet|liet ke)/.test(foldedQuestion);
}

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
    const pendingCount = Math.max(0, dueCount - renewedCount);
    const renewalRate = dueCount > 0 ? (renewedCount / dueCount) * 100 : 0;
    const replyLines = [
      `Trong ${monthContext.label}, có ${dueCount.toLocaleString("vi-VN")} account sắp đến hạn.`,
      `- Đã renew: ${renewedCount.toLocaleString("vi-VN")} account (${formatPercent(renewalRate)}).`,
      `- Chưa renew: ${pendingCount.toLocaleString("vi-VN")} account.`
    ];

    if (shouldIncludeSampleAccounts(context.latestQuestion)) {
      replyLines.push(
        expiringSoon.rows.length > 0
          ? `- Mẫu account gần hạn: ${expiringSoon.rows.map((item) => item.account).join(", ")}.`
          : "- Chưa có account mẫu trong kỳ này."
      );
    }

    const reply = replyLines.join("\n");

    return {
      reply,
      fallback_reply: reply,
      format_hint: "summary",
      summary_facts: {
        month_label: monthContext.label,
        due_count: dueCount,
        renewed_count: renewedCount,
        pending_count: pendingCount,
        renewal_rate: renewalRate
      },
      data: shouldIncludeSampleAccounts(context.latestQuestion) ? {
        sample_accounts: expiringSoon.rows
      } : null,
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
