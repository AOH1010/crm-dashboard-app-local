import { createUsage } from "../contracts/chat-contracts.js";
import { resolveCurrentPeriod } from "../tooling/question-analysis.js";
import { formatCurrency, formatPercent } from "./formatters.js";

export const kpiOverviewSkill = {
  id: "kpi-overview",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return context.viewId === "dashboard"
      && /(kpi|tong quan|tom tat|overview)/.test(foldedQuestion);
  },
  run(context, connector) {
    const period = resolveCurrentPeriod({
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOrderDateKey()
    });

    const kpiResult = connector.runReadQuery({
      sql: `
        SELECT
          ROUND(COALESCE(SUM(revenue_amount), 0), 2) AS total_revenue,
          COALESCE(SUM(new_leads_count), 0) AS new_leads,
          COALESCE(SUM(new_customers_count), 0) AS new_customers
        FROM kpis_daily
        WHERE day BETWEEN ? AND ?
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 1
    });

    const topSellerResult = connector.runReadQuery({
      sql: `
        SELECT
          COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned') AS seller_name,
          ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        GROUP BY seller_name
        ORDER BY revenue_amount DESC, seller_name ASC
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 1
    });

    const kpis = kpiResult.rows[0] || {};
    const topSeller = topSellerResult.rows[0] || null;
    const conversionRate = Number(kpis.new_leads || 0) > 0
      ? (Number(kpis.new_customers || 0) / Number(kpis.new_leads || 0)) * 100
      : 0;

    const replyLines = [
      `Tom tat KPI giai doan ${period.from} den ${period.to}:`,
      `- Tong doanh thu: ${formatCurrency(kpis.total_revenue)}.`,
      `- Lead moi: ${Number(kpis.new_leads || 0).toLocaleString("vi-VN")}.`,
      `- Khach moi: ${Number(kpis.new_customers || 0).toLocaleString("vi-VN")} (${formatPercent(conversionRate)} chuyen doi).`
    ];

    if (topSeller) {
      replyLines.push(`- Seller dan dau: ${topSeller.seller_name} voi ${formatCurrency(topSeller.revenue_amount)}.`);
    }
    const reply = replyLines.join("\n");

    return {
      reply,
      fallback_reply: reply,
      format_hint: "summary",
      summary_facts: {
        period_from: period.from,
        period_to: period.to,
        total_revenue: Number(kpis.total_revenue || 0),
        new_leads: Number(kpis.new_leads || 0),
        new_customers: Number(kpis.new_customers || 0),
        conversion_rate: conversionRate,
        top_seller: topSeller ? {
          seller_name: topSeller.seller_name,
          revenue_amount: Number(topSeller.revenue_amount || 0)
        } : null
      },
      data: {
        kpis: {
          total_revenue: Number(kpis.total_revenue || 0),
          new_leads: Number(kpis.new_leads || 0),
          new_customers: Number(kpis.new_customers || 0),
          conversion_rate: conversionRate
        }
      },
      sqlLogs: [
        {
          name: `${this.id}_kpis`,
          sql: kpiResult.sql,
          row_count: kpiResult.row_count,
          row_limit: kpiResult.row_limit
        },
        {
          name: `${this.id}_top_seller`,
          sql: topSellerResult.sql,
          row_count: topSellerResult.row_count,
          row_limit: topSellerResult.row_limit
        }
      ],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
