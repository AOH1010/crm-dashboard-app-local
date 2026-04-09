import { createUsage } from "../contracts/chat-contracts.js";
import { resolveMonthEndKey } from "../tooling/question-analysis.js";
import { formatMarkdownTable, formatPercent } from "./formatters.js";

export const operationsStatusSummarySkill = {
  id: "operations-status-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(active|inactive|best|ghost|noise|value|hoat dong|operations)/.test(foldedQuestion);
  },
  run(context, connector) {
    const monthContext = resolveMonthEndKey({
      question: context.latestQuestion,
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOperationsMonthEndKey() || connector.getLatestOrderDateKey()
    });

    const statusResult = connector.runReadQuery({
      sql: `
        SELECT
          COALESCE(status, 'Unknown') AS status,
          COUNT(*) AS account_count
        FROM monthly_status
        WHERE month_end_key = ?
        GROUP BY status
        ORDER BY account_count DESC, status ASC
      `,
      params: [monthContext.month_end_key],
      allowPlaceholders: true,
      maxRows: 10
    });

    const categoryResult = connector.runReadQuery({
      sql: `
        SELECT
          COALESCE(category, 'Unknown') AS category,
          COUNT(*) AS account_count
        FROM monthly_status
        WHERE month_end_key = ?
        GROUP BY category
        ORDER BY account_count DESC, category ASC
      `,
      params: [monthContext.month_end_key],
      allowPlaceholders: true,
      maxRows: 10
    });

    const totalAccounts = statusResult.rows.reduce((sum, row) => sum + Number(row.account_count || 0), 0);
    const activeCount = Number(statusResult.rows.find((row) => String(row.status) === "Active")?.account_count || 0);
    const activeRate = totalAccounts > 0 ? (activeCount / totalAccounts) * 100 : 0;

    const categoryTable = formatMarkdownTable(
      ["Category", "Accounts", "Share"],
      categoryResult.rows.map((row) => [
        row.category,
        Number(row.account_count || 0).toLocaleString("vi-VN"),
        totalAccounts > 0 ? formatPercent((Number(row.account_count || 0) / totalAccounts) * 100) : "-"
      ])
    );

    return {
      reply: [
        `Tong hop operations trong ky ${monthContext.label}:`,
        `- Tong account tracked: ${totalAccounts.toLocaleString("vi-VN")}.`,
        `- Active: ${activeCount.toLocaleString("vi-VN")} (${formatPercent(activeRate)}).`,
        categoryTable
      ].join("\n\n"),
      sqlLogs: [
        {
          name: `${this.id}_status`,
          sql: statusResult.sql,
          row_count: statusResult.row_count,
          row_limit: statusResult.row_limit
        },
        {
          name: `${this.id}_category`,
          sql: categoryResult.sql,
          row_count: categoryResult.row_count,
          row_limit: categoryResult.row_limit
        }
      ],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
