import { createUsage } from "../contracts/chat-contracts.js";
import { resolveCurrentPeriod, resolvePreviousPeriod } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable, formatPercent } from "./formatters.js";

function buildMetricRow(label, currentValue, previousValue, formatter) {
  const delta = Number(currentValue || 0) - Number(previousValue || 0);
  const deltaPercent = Number(previousValue || 0) > 0 ? (delta / Number(previousValue || 0)) * 100 : null;
  return [
    label,
    formatter(currentValue),
    formatter(previousValue),
    delta >= 0 ? `+${formatter(delta)}` : formatter(delta),
    deltaPercent === null ? "-" : `${deltaPercent >= 0 ? "+" : ""}${formatPercent(deltaPercent)}`
  ];
}

export const comparePeriodsSkill = {
  id: "compare-periods",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(so sanh|compare)/.test(foldedQuestion);
  },
  run(context, connector) {
    const currentPeriod = resolveCurrentPeriod({
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOrderDateKey()
    });
    const previousPeriod = resolvePreviousPeriod(currentPeriod);

    const aggregate = (from, to) => connector.runReadQuery({
      sql: `
        SELECT
          ROUND(COALESCE(SUM(revenue_amount), 0), 2) AS total_revenue,
          COALESCE(SUM(new_leads_count), 0) AS new_leads,
          COALESCE(SUM(new_customers_count), 0) AS new_customers
        FROM kpis_daily
        WHERE day BETWEEN ? AND ?
      `,
      params: [from, to],
      allowPlaceholders: true,
      maxRows: 1
    });

    const current = aggregate(currentPeriod.from, currentPeriod.to);
    const previous = aggregate(previousPeriod.from, previousPeriod.to);

    const currentRow = current.rows[0] || {};
    const previousRow = previous.rows[0] || {};
    const currentConversion = Number(currentRow.new_leads || 0) > 0
      ? (Number(currentRow.new_customers || 0) / Number(currentRow.new_leads || 0)) * 100
      : 0;
    const previousConversion = Number(previousRow.new_leads || 0) > 0
      ? (Number(previousRow.new_customers || 0) / Number(previousRow.new_leads || 0)) * 100
      : 0;

    const table = formatMarkdownTable(
      ["Chi so", "Ky hien tai", "Ky truoc", "Delta", "Delta %"],
      [
        buildMetricRow("Doanh thu", currentRow.total_revenue, previousRow.total_revenue, formatCurrency),
        buildMetricRow("Lead moi", currentRow.new_leads, previousRow.new_leads, (value) => Number(value || 0).toLocaleString("vi-VN")),
        buildMetricRow("Khach moi", currentRow.new_customers, previousRow.new_customers, (value) => Number(value || 0).toLocaleString("vi-VN")),
        buildMetricRow("Ty le chuyen doi", currentConversion, previousConversion, formatPercent)
      ]
    );

    return {
      reply: [
        `So sanh giai doan ${currentPeriod.from} den ${currentPeriod.to} voi ${previousPeriod.from} den ${previousPeriod.to}:`,
        table
      ].join("\n\n"),
      sqlLogs: [
        {
          name: `${this.id}_current`,
          sql: current.sql,
          row_count: current.row_count,
          row_limit: current.row_limit
        },
        {
          name: `${this.id}_previous`,
          sql: previous.sql,
          row_count: previous.row_count,
          row_limit: previous.row_limit
        }
      ],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
