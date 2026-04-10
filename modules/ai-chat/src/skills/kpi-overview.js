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
    const totalRevenue = Number(kpis.total_revenue || 0);
    const newLeads = Number(kpis.new_leads || 0);
    const newCustomers = Number(kpis.new_customers || 0);
    const conversionRate = newLeads > 0 ? (newCustomers / newLeads) * 100 : 0;

    const replyLines = [
      `Tổng quan nhanh giai đoạn ${period.from} đến ${period.to}:`,
      `- Doanh thu: ${formatCurrency(totalRevenue)}.`,
      `- Lead mới: ${newLeads.toLocaleString("vi-VN")} và khách mới: ${newCustomers.toLocaleString("vi-VN")} (${formatPercent(conversionRate)} chuyển đổi).`
    ];

    if (topSeller) {
      replyLines.push(`- Seller dẫn đầu: ${topSeller.seller_name} với ${formatCurrency(topSeller.revenue_amount)}.`);
    }

    if (newCustomers === 0 && newLeads > 0) {
      replyLines.push("- Lưu ý: có lead mới nhưng chưa ghi nhận khách mới trong kỳ.");
    }

    const reply = replyLines.join("\n");

    return {
      reply,
      fallback_reply: reply,
      format_hint: "summary",
      summary_facts: {
        period_from: period.from,
        period_to: period.to,
        total_revenue: totalRevenue,
        new_leads: newLeads,
        new_customers: newCustomers,
        conversion_rate: conversionRate,
        top_seller: topSeller ? {
          seller_name: topSeller.seller_name,
          revenue_amount: Number(topSeller.revenue_amount || 0)
        } : null
      },
      data: {
        kpis: {
          total_revenue: totalRevenue,
          new_leads: newLeads,
          new_customers: newCustomers,
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
