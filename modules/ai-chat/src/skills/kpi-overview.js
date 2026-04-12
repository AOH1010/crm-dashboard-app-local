import { createUsage } from "../contracts/chat-contracts.js";
import { endOfMonthKey } from "../tooling/date-utils.js";
import {
  extractMonthYear,
  resolveCurrentPeriod,
  resolveMonthlyWindowFromContext,
} from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable, formatPercent } from "./formatters.js";
import { buildSourceGroupCaseSql } from "./business-mappings-v2.js";

const sourceGroupCaseSql = buildSourceGroupCaseSql("c.account_source_full_name");

function hasKpiDrilldownCue(context) {
  const foldedQuestion = String(context.routingFoldedQuestion || context.foldedQuestion || "");
  return /(phan tich them|chi tiet hon|dao sau|them ve|noi ro hon|lam ro hon)/.test(foldedQuestion);
}

function wantsRevenueFocus(foldedQuestion) {
  return /(doanh thu|doanh so|\bdt\b|revenue)/.test(foldedQuestion)
    && !/(khong phai doanh thu|khong hoi doanh thu|khong can doanh thu|chi hoi lead|chi hoi nguon|lead khong phai doanh thu)/.test(foldedQuestion);
}

function hasKpiFocusCue(foldedQuestion) {
  return wantsRevenueFocus(foldedQuestion)
    || /(lead moi|\blead\b|khach moi|customer moi|khach hang moi|chuyen doi|conversion|\bcr\b|don hang|so don|\bdon\b|order|seller|sale|nguoi ban|nhan vien|nguon|source|kenh)/.test(foldedQuestion);
}

function resolveKpiDrilldownFocuses(context) {
  const foldedQuestion = String(context.routingFoldedQuestion || context.foldedQuestion || "");
  const canUseConversationCarryOver = context.intent?.primary_intent === "kpi_overview"
    && Array.isArray(context.normalizedMessages)
    && context.normalizedMessages.length > 1
    && hasKpiFocusCue(foldedQuestion);
  if (!hasKpiDrilldownCue(context) && !canUseConversationCarryOver) {
    return [];
  }

  const focuses = [];
  if (/(lead moi|\blead\b)/.test(foldedQuestion)) focuses.push("leads");
  if (/(khach moi|customer moi|khach hang moi)/.test(foldedQuestion)) focuses.push("customers");
  if (/(chuyen doi|conversion|\bcr\b)/.test(foldedQuestion)) focuses.push("conversion");
  if (/(don hang|so don|\bdon\b|order)/.test(foldedQuestion)) focuses.push("orders");
  if (/(seller|sale|nguoi ban|nhan vien)/.test(foldedQuestion)) focuses.push("sellers");
  if (/(nguon|source|kenh)/.test(foldedQuestion)) focuses.push("sources");
  if (wantsRevenueFocus(foldedQuestion)) focuses.push("revenue");

  return Array.from(new Set(focuses.length > 0 ? focuses : ["summary"]));
}

function wantsOrderReconciliation(question) {
  const foldedQuestion = String(question || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /(check|doi chieu|co an voi|co khop|khop khong|neu lech|cong tu don|tu don hang|tong tu don hang)/.test(foldedQuestion);
}

export const kpiOverviewSkill = {
  id: "kpi-overview",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return context.viewId === "dashboard"
      && /(kpi|tong quan|tom tat|overview)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const latestDateKey = connector.getLatestOrderDateKey();
    const latestMonthKey = connector.getLatestMonthKey();
    const latestYear = connector.getLatestOrderYear();
    const explicitMonth = extractMonthYear(context.routingQuestion || context.latestQuestion);
    const historyBackedMonth = Array.isArray(context.normalizedMessages) && context.normalizedMessages.length > 1;
    const period = (explicitMonth || historyBackedMonth)
      ? (() => {
        const monthWindow = resolveMonthlyWindowFromContext({
          question: context.routingQuestion || context.latestQuestion,
          context,
          selectedFilters: context.selectedFilters,
          latestMonthKey,
          latestYear
        });
        return {
          from: `${monthWindow.month_key}-01`,
          to: monthWindow.month_key === latestMonthKey ? latestDateKey : endOfMonthKey(`${monthWindow.month_key}-01`),
          label: monthWindow.label
        };
      })()
      : resolveCurrentPeriod({
        selectedFilters: context.selectedFilters,
        latestDateKey
      });

    const drilldownFocuses = resolveKpiDrilldownFocuses(context);
    const hasDrilldown = drilldownFocuses.length > 0;
    const wantsRevenue = drilldownFocuses.includes("revenue");
    const wantsLeadFunnel = drilldownFocuses.includes("leads")
      || drilldownFocuses.includes("customers")
      || drilldownFocuses.includes("conversion");
    const wantsOrders = drilldownFocuses.includes("orders");
    const wantsSellers = drilldownFocuses.includes("sellers");
    const wantsSources = drilldownFocuses.includes("sources");
    const wantsReconciliation = wantsOrderReconciliation(context.latestQuestion);

    const kpiResult = await connector.runReadQueryAsync({
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

    const topSellerResult = await connector.runReadQueryAsync({
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

    const orderStatsResult = await connector.runReadQueryAsync({
      sql: `
        SELECT
          COUNT(*) AS order_count,
          ROUND(AVG(COALESCE(real_amount, 0)), 2) AS avg_order_value
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 1
    });

    const orderRevenueResult = wantsReconciliation
      ? await connector.runReadQueryAsync({
        sql: `
          SELECT
            ROUND(SUM(COALESCE(real_amount, 0)), 2) AS total_order_revenue
          FROM orders
          WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
            AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        `,
        params: [period.from, period.to],
        allowPlaceholders: true,
        maxRows: 1
      })
      : null;

    const topSellersResult = await connector.runReadQueryAsync({
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
      maxRows: 3
    });

    const leadDailyResult = await connector.runReadQueryAsync({
      sql: `
        SELECT
          day,
          COALESCE(new_leads_count, 0) AS new_leads,
          COALESCE(new_customers_count, 0) AS new_customers
        FROM kpis_daily
        WHERE day BETWEEN ? AND ?
        ORDER BY new_leads DESC, new_customers DESC, day ASC
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 3
    });

    const sourceBreakdownResult = wantsLeadFunnel && wantsSources
      ? await connector.runReadQueryAsync({
        sql: `
          WITH customer_base AS (
            SELECT
              TRIM(COALESCE(c.id_1, '')) AS customer_id,
              ${sourceGroupCaseSql} AS source_group,
              SUBSTR(TRIM(COALESCE(c.created_at_1, '')), 1, 10) AS created_date
            FROM customers c
            WHERE LENGTH(TRIM(COALESCE(c.id_1, ''))) > 0
              AND LENGTH(SUBSTR(TRIM(COALESCE(c.created_at_1, '')), 1, 10)) = 10
          ),
          order_customers AS (
            SELECT DISTINCT TRIM(COALESCE(o.id_1, '')) AS customer_id
            FROM orders o
            WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
              SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
            ), '__never_match__')
              AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
          )
          SELECT
            source_group,
            COUNT(*) AS lead_count,
            SUM(CASE WHEN oc.customer_id IS NOT NULL THEN 1 ELSE 0 END) AS customer_count
          FROM customer_base cb
          LEFT JOIN order_customers oc
            ON oc.customer_id = cb.customer_id
          WHERE cb.created_date BETWEEN ? AND ?
          GROUP BY source_group
          HAVING COUNT(*) > 0
          ORDER BY lead_count DESC, customer_count DESC, source_group ASC
        `,
        params: [period.from, period.to, period.from, period.to],
        allowPlaceholders: true,
        maxRows: 6
      })
      : null;

    const kpis = kpiResult.rows[0] || {};
    const orderStats = orderStatsResult.rows[0] || {};
    const topSeller = topSellerResult.rows[0] || null;
    const topSellers = topSellersResult.rows.map((row) => ({
      seller_name: row.seller_name,
      revenue_amount: Number(row.revenue_amount || 0)
    }));
    const totalRevenue = Number(kpis.total_revenue || 0);
    const newLeads = Number(kpis.new_leads || 0);
    const newCustomers = Number(kpis.new_customers || 0);
    const orderCount = Number(orderStats.order_count || 0);
    const avgOrderValue = Number(orderStats.avg_order_value || 0);
    const totalOrderRevenue = Number(orderRevenueResult?.rows?.[0]?.total_order_revenue || 0);
    const reconciliationDiff = wantsReconciliation ? Math.abs(totalOrderRevenue - totalRevenue) : 0;
    const conversionRate = newLeads > 0 ? (newCustomers / newLeads) * 100 : 0;
    const topLeadDays = leadDailyResult.rows.map((row) => ({
      day: String(row.day || ""),
      new_leads: Number(row.new_leads || 0),
      new_customers: Number(row.new_customers || 0)
    }));
    const leadPeakDay = topLeadDays[0] || null;
    const avgLeadsPerDay = topLeadDays.length > 0
      ? newLeads / Math.max(1, Math.ceil((new Date(`${period.to}T00:00:00Z`).getTime() - new Date(`${period.from}T00:00:00Z`).getTime()) / 86400000) + 1)
      : 0;
    const sourceBreakdown = (sourceBreakdownResult?.rows || []).map((row) => {
      const leadCount = Number(row.lead_count || 0);
      const customerCount = Number(row.customer_count || 0);
      return {
        source_group: row.source_group,
        lead_count: leadCount,
        customer_count: customerCount,
        conversion_rate: leadCount > 0 ? (customerCount / leadCount) * 100 : 0
      };
    });

    const narrowLeadReply = hasDrilldown && wantsLeadFunnel && !wantsRevenue && !wantsOrders && !wantsSellers;
    const replyLines = narrowLeadReply
      ? [
        `Phân tích lead giai đoạn ${period.from} đến ${period.to}:`,
        `- Lead mới: ${newLeads.toLocaleString("vi-VN")}.`,
        `- Khách mới từ lead: ${newCustomers.toLocaleString("vi-VN")} (${formatPercent(conversionRate)} chuyển đổi).`
      ]
      : [
        `Tổng quan nhanh giai đoạn ${period.from} đến ${period.to}:`,
        `- Doanh thu: ${formatCurrency(totalRevenue)}.`,
        `- Lead mới: ${newLeads.toLocaleString("vi-VN")} và khách mới: ${newCustomers.toLocaleString("vi-VN")} (${formatPercent(conversionRate)} chuyển đổi).`
      ];

    if (topSeller && !narrowLeadReply) {
      replyLines.push(`- Seller dẫn đầu: ${topSeller.seller_name} với ${formatCurrency(topSeller.revenue_amount)}.`);
    }

    if (newCustomers === 0 && newLeads > 0) {
      replyLines.push("- Lưu ý: có lead mới nhưng chưa ghi nhận khách mới trong kỳ.");
    }

    if (wantsRevenue) {
      replyLines.push(`- Số đơn không hủy: ${orderCount.toLocaleString("vi-VN")} và giá trị trung bình/đơn: ${formatCurrency(avgOrderValue)}.`);
      if (topSellers.length > 0) {
        replyLines.push(`- Top seller theo doanh thu: ${topSellers.map((seller) => `${seller.seller_name} (${formatCurrency(seller.revenue_amount)})`).join(", ")}.`);
      }
    }

    if (wantsLeadFunnel) {
      replyLines.push(`- Bình quân lead mới/ngày: ${avgLeadsPerDay.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}.`);
      if (leadPeakDay) {
        replyLines.push(`- Ngày có nhiều lead mới nhất: ${leadPeakDay.day} với ${leadPeakDay.new_leads.toLocaleString("vi-VN")} lead và ${leadPeakDay.new_customers.toLocaleString("vi-VN")} khách mới.`);
      }
      replyLines.push(`- Khách mới: ${newCustomers.toLocaleString("vi-VN")} trên ${newLeads.toLocaleString("vi-VN")} lead mới, tương ứng ${formatPercent(conversionRate)} chuyển đổi.`);
      if (wantsSources && sourceBreakdown.length > 0) {
        replyLines.push("- Chia theo nguồn lead:");
        replyLines.push(formatMarkdownTable(
          ["Nguồn lead", "Lead", "Khách mới", "Conversion"],
          sourceBreakdown.map((row) => [
            row.source_group,
            row.lead_count.toLocaleString("vi-VN"),
            row.customer_count.toLocaleString("vi-VN"),
            formatPercent(row.conversion_rate)
          ])
        ));
      }
    }

    if (wantsOrders && !wantsRevenue) {
      replyLines.push(`- Số đơn không hủy: ${orderCount.toLocaleString("vi-VN")}.`);
      replyLines.push(`- Giá trị trung bình mỗi đơn: ${formatCurrency(avgOrderValue)}.`);
    }

    if (wantsSellers && !wantsRevenue) {
      if (topSellers.length > 0) {
        replyLines.push(`- Top seller theo doanh thu: ${topSellers.map((seller) => `${seller.seller_name} (${formatCurrency(seller.revenue_amount)})`).join(", ")}.`);
      }
    }

    if (wantsReconciliation) {
      if (reconciliationDiff < 1) {
        replyLines.push(`- Tôi đối chiếu nhanh với phần cộng từ đơn hàng: hiện đang khớp ở mức ${formatCurrency(totalOrderRevenue)}.`);
      } else {
        replyLines.push(`- Tôi đối chiếu nhanh với phần cộng từ đơn hàng: đang lệch ${formatCurrency(reconciliationDiff)} (${formatCurrency(totalRevenue)} trên dashboard so với ${formatCurrency(totalOrderRevenue)} khi cộng từ đơn).`);
      }
    }

    if (drilldownFocuses.length === 1 && drilldownFocuses[0] === "summary") {
      replyLines.push("- Bạn đang drill-down thêm từ tổng quan KPI, nên tôi giữ nguyên kỳ và chờ bạn chỉ rõ hạng mục nếu muốn đào sâu tiếp.");
    }

    const reply = replyLines.join("\n");

    return {
      reply,
      fallback_reply: reply,
      format_hint: hasDrilldown ? "analysis" : "summary",
      summary_facts: {
        period_from: period.from,
        period_to: period.to,
        total_revenue: totalRevenue,
        order_count: orderCount,
        average_order_value: avgOrderValue,
        total_order_revenue: wantsReconciliation ? totalOrderRevenue : null,
        reconciliation_diff: wantsReconciliation ? reconciliationDiff : null,
        new_leads: newLeads,
        new_customers: newCustomers,
        conversion_rate: conversionRate,
        drilldown_focus: drilldownFocuses[0] || null,
        drilldown_focuses: drilldownFocuses,
        top_seller: topSeller ? {
          seller_name: topSeller.seller_name,
          revenue_amount: Number(topSeller.revenue_amount || 0)
        } : null,
        source_breakdown: sourceBreakdown
      },
      data: {
        kpis: {
          total_revenue: totalRevenue,
          order_count: orderCount,
          average_order_value: avgOrderValue,
          new_leads: newLeads,
          new_customers: newCustomers,
          conversion_rate: conversionRate
        },
        top_sellers: topSellers,
        top_lead_days: topLeadDays,
        source_breakdown: sourceBreakdown
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
        },
        {
          name: `${this.id}_orders`,
          sql: orderStatsResult.sql,
          row_count: orderStatsResult.row_count,
          row_limit: orderStatsResult.row_limit
        },
        ...(orderRevenueResult ? [{
          name: `${this.id}_order_revenue_check`,
          sql: orderRevenueResult.sql,
          row_count: orderRevenueResult.row_count,
          row_limit: orderRevenueResult.row_limit
        }] : []),
        {
          name: `${this.id}_top_sellers`,
          sql: topSellersResult.sql,
          row_count: topSellersResult.row_count,
          row_limit: topSellersResult.row_limit
        },
        {
          name: `${this.id}_lead_days`,
          sql: leadDailyResult.sql,
          row_count: leadDailyResult.row_count,
          row_limit: leadDailyResult.row_limit
        },
        ...(sourceBreakdownResult ? [{
          name: `${this.id}_source_breakdown`,
          sql: sourceBreakdownResult.sql,
          row_count: sourceBreakdownResult.row_count,
          row_limit: sourceBreakdownResult.row_limit
        }] : [])
      ],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
