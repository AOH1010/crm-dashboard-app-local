import { createUsage } from "../contracts/chat-contracts.js";
import { getSystemTodayDateKey } from "../tooling/date-utils.js";
import { resolveMonthEndKey } from "../tooling/question-analysis.js";
import { formatMarkdownTable, formatPercent } from "./formatters.js";

function detectRequestedSlices(question) {
  const foldedQuestion = String(question || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return {
    wantsActive: /(active|hoat dong)/.test(foldedQuestion),
    wantsInactive: /(inactive|khong hoat dong)/.test(foldedQuestion),
    wantsGhost: /\bghost\b/.test(foldedQuestion),
    wantsMostGhost: /(ghost).{0,24}(nhieu nhat|cao nhat|nao nhieu nhat|nao cao nhat)/.test(foldedQuestion) || /(nhieu nhat|cao nhat).{0,24}(ghost)/.test(foldedQuestion),
    wantsBest: /\bbest\b/.test(foldedQuestion),
    wantsValue: /\bvalue\b/.test(foldedQuestion),
    wantsNoise: /\bnoise\b/.test(foldedQuestion),
    wantsBroadOverview: /(operations|tinh hinh|tong quan|tom tat)/.test(foldedQuestion)
  };
}

export const operationsStatusSummarySkill = {
  id: "operations-status-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    if (
      /(team|nhom|doi)/.test(foldedQuestion)
      && /(seller active|sale active)/.test(foldedQuestion)
      && /(doanh thu|doanh so|so sanh|hieu suat|so don)/.test(foldedQuestion)
    ) {
      return false;
    }
    return /(active|inactive|best|ghost|noise|value|hoat dong|operations)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const monthContext = resolveMonthEndKey({
      question: context.latestQuestion,
      selectedFilters: context.selectedFilters,
      latestDateKey: getSystemTodayDateKey()
    });
    const requestedSlices = detectRequestedSlices(context.latestQuestion);

    const statusResult = await connector.runReadQueryAsync({
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

    const categoryResult = await connector.runReadQueryAsync({
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
    const inactiveCount = Math.max(0, totalAccounts - activeCount);
    const activeRate = totalAccounts > 0 ? (activeCount / totalAccounts) * 100 : 0;
    const categoryMap = new Map(
      categoryResult.rows.map((row) => [String(row.category || "Unknown"), Number(row.account_count || 0)])
    );
    const ghostCount = Number(categoryMap.get("Ghost") || 0);
    const bestCount = Number(categoryMap.get("Best") || 0);
    const valueCount = Number(categoryMap.get("Value") || 0);
    const noiseCount = Number(categoryMap.get("Noise") || 0);

    const categoryTable = formatMarkdownTable(
      ["Category", "Accounts", "Share"],
      categoryResult.rows.map((row) => [
        row.category,
        Number(row.account_count || 0).toLocaleString("vi-VN"),
        totalAccounts > 0 ? formatPercent((Number(row.account_count || 0) / totalAccounts) * 100) : "-"
      ])
    );

    let reply;
    const asksOnlyActiveGhost = requestedSlices.wantsActive && requestedSlices.wantsGhost
      && !requestedSlices.wantsBroadOverview
      && !requestedSlices.wantsBest
      && !requestedSlices.wantsValue
      && !requestedSlices.wantsNoise
      && !requestedSlices.wantsInactive;

    if (requestedSlices.wantsMostGhost) {
      reply = [
        `Tôi chưa hiểu chính xác bạn đang định nghĩa "account ghost nhiều nhất" theo tiêu chí nào. Nếu ý bạn là muốn xem snapshot operations của ${monthContext.label}, tôi tổng hợp nhanh như dưới đây:`,
        `- Tổng account tracked: ${totalAccounts.toLocaleString("vi-VN")}.`,
        `- Active: ${activeCount.toLocaleString("vi-VN")} (${formatPercent(activeRate)}); Inactive: ${inactiveCount.toLocaleString("vi-VN")}.`,
        `- Ghost hiện có: ${ghostCount.toLocaleString("vi-VN")} account.`,
        categoryTable
      ].join("\n\n");
    } else if (asksOnlyActiveGhost) {
      reply = [
        `Trong ${monthContext.label}, có ${activeCount.toLocaleString("vi-VN")} account Active và ${ghostCount.toLocaleString("vi-VN")} account Ghost.`,
        `- Active chiếm ${formatPercent(activeRate)} trên tổng ${totalAccounts.toLocaleString("vi-VN")} account tracked.`
      ].join("\n");
    } else {
      reply = [
        `Tổng hợp operations trong ${monthContext.label}:`,
        `- Tổng account tracked: ${totalAccounts.toLocaleString("vi-VN")}.`,
        `- Active: ${activeCount.toLocaleString("vi-VN")} (${formatPercent(activeRate)}); Inactive: ${inactiveCount.toLocaleString("vi-VN")}.`,
        `- Best / Value / Noise / Ghost: ${bestCount.toLocaleString("vi-VN")} / ${valueCount.toLocaleString("vi-VN")} / ${noiseCount.toLocaleString("vi-VN")} / ${ghostCount.toLocaleString("vi-VN")}.`,
        categoryTable
      ].join("\n\n");
    }

    return {
      reply,
      fallback_reply: reply,
      format_hint: asksOnlyActiveGhost || requestedSlices.wantsMostGhost ? "summary" : "table",
      summary_facts: {
        month_label: monthContext.label,
        total_accounts: totalAccounts,
        active_count: activeCount,
        inactive_count: inactiveCount,
        active_rate: activeRate,
        ghost_count: ghostCount,
        best_count: bestCount,
        value_count: valueCount,
        noise_count: noiseCount
      },
      data: {
        categories: categoryResult.rows,
        statuses: statusResult.rows
      },
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
