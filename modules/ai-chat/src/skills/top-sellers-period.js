import { createUsage } from "../contracts/chat-contracts.js";
import { endOfMonthKey, formatMonthLabel } from "../tooling/date-utils.js";
import { resolveCurrentPeriod, resolveMonthlyWindowFromContext } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";

function resolveRankingPeriod(context, connector) {
  const latestQuestion = String(context.routingQuestion || context.latestQuestion || "");
  if (/\bth\w*\s*\d{1,2}\b|\bthang nay\b|\bthang truoc\b/.test(latestQuestion.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) {
    const monthWindow = resolveMonthlyWindowFromContext({
      question: latestQuestion,
      context,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });
    return {
      mode: "month",
      from: `${monthWindow.month_key}-01`,
      to: endOfMonthKey(`${monthWindow.month_key}-01`),
      label: monthWindow.label,
      month_key: monthWindow.month_key,
      inferred_year: monthWindow.inferred_year
    };
  }

  if (Array.isArray(context.normalizedMessages) && context.normalizedMessages.length > 1) {
    const monthWindow = resolveMonthlyWindowFromContext({
      question: latestQuestion,
      context,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });
    if (monthWindow?.month_key) {
      return {
        mode: "month",
        from: `${monthWindow.month_key}-01`,
        to: endOfMonthKey(`${monthWindow.month_key}-01`),
        label: monthWindow.label,
        month_key: monthWindow.month_key,
        inferred_year: monthWindow.inferred_year
      };
    }
  }

  const period = resolveCurrentPeriod({
    selectedFilters: context.selectedFilters,
    latestDateKey: connector.getLatestOrderDateKey()
  });
  return {
    mode: "range",
    from: period.from,
    to: period.to,
    label: `${period.from} đến ${period.to}`,
    month_key: null,
    inferred_year: false
  };
}

function extractRankingLimit(question) {
  const normalized = String(question || "").toLowerCase();
  const directTopMatch = normalized.match(/\btop\s*(\d{1,2})\b/);
  if (directTopMatch?.[1]) {
    return Math.min(Math.max(Number.parseInt(directTopMatch[1], 10), 1), 10);
  }

  const sellerCountMatch = normalized.match(/\b(\d{1,2})\s+(?:seller|sale|nguoi ban|nhan vien)\b/);
  if (sellerCountMatch?.[1]) {
    return Math.min(Math.max(Number.parseInt(sellerCountMatch[1], 10), 1), 10);
  }

  return 5;
}

function normalizeQuestion(question) {
  return String(question || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveRankingMetric(context) {
  const normalized = normalizeQuestion(context.routingQuestion || context.latestQuestion);
  if (context.intent?.metric === "orders"
    || /(so luong don|so don|don hang thanh cong|don khong huy|order count|number of orders)/.test(normalized)) {
    return "orders";
  }
  return "revenue";
}

function wantsAllSellerRows(context) {
  const normalized = normalizeQuestion(context.routingQuestion || context.latestQuestion);
  return /(moi seller|tung seller|theo seller|cac seller|all seller|each seller)/.test(normalized);
}

function resolveRankingLimit(context) {
  if (wantsAllSellerRows(context)) {
    return 50;
  }
  return extractRankingLimit(context.routingQuestion || context.latestQuestion);
}

function extractRequestedMonthPeriods(question, connector) {
  const normalized = String(question || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const latestYear = connector.getLatestOrderYear();
  const periods = [];
  const regex = /\bth\w*\s*(\d{1,2})(?:\s*(?:\/|\s+nam\s+|\s+)\s*(20\d{2}))?/g;
  let match = regex.exec(normalized);

  while (match) {
    const month = Number.parseInt(match[1], 10);
    const year = match[2] ? Number.parseInt(match[2], 10) : latestYear;
    if (month >= 1 && month <= 12) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      if (!periods.some((item) => item.month_key === monthKey)) {
        periods.push({
          mode: "month",
          from: `${monthKey}-01`,
          to: endOfMonthKey(`${monthKey}-01`),
          label: formatMonthLabel(monthKey),
          month_key: monthKey,
          inferred_year: !match[2]
        });
      }
    }
    match = regex.exec(normalized);
  }

  return periods;
}

async function queryRankingForPeriod(connector, period, rankingLimit, rankingMetric) {
  const orderBy = rankingMetric === "orders"
    ? "order_count DESC, revenue_amount DESC, seller_name ASC"
    : "revenue_amount DESC, order_count DESC, seller_name ASC";
  const result = await connector.runReadQueryAsync({
    sql: `
      SELECT
        COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned') AS seller_name,
        ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount,
        COUNT(*) AS order_count
      FROM orders
      WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
        SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
      ), '__never_match__')
        AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
      GROUP BY seller_name
      ORDER BY ${orderBy}
    `,
    params: [period.from, period.to],
    allowPlaceholders: true,
    maxRows: rankingLimit
  });

  const rows = result.rows.slice(0, rankingLimit).map((row) => ({
    seller_name: row.seller_name,
    revenue_amount: Number(row.revenue_amount || 0),
    order_count: Number(row.order_count || 0)
  }));

  return {
    result,
    rows,
    leader: rows[0] || null
  };
}

function buildReplyBlock(period, leader, rows, rankingMetric) {
  if (!leader) {
    return `Không tìm thấy dữ liệu xếp hạng seller trong ${period.label}.`;
  }

  const table = formatMarkdownTable(
    ["Top", "Seller", "Doanh thu", "Số đơn"],
    rows.map((row, index) => [
      String(index + 1),
      row.seller_name,
      formatCurrency(row.revenue_amount),
      row.order_count.toLocaleString("vi-VN")
    ])
  );

  const assumptionText = period.inferred_year ? " Tôi đang mặc định năm mới nhất trong dữ liệu." : "";
  if (rankingMetric === "orders") {
    return [
      `Seller có số đơn không hủy cao nhất trong ${period.label} là ${leader.seller_name} với ${leader.order_count.toLocaleString("vi-VN")} đơn, doanh thu ${formatCurrency(leader.revenue_amount)}.${assumptionText}`,
      `Bảng seller theo số đơn ${period.label}:`,
      table
    ].join("\n\n");
  }

  return [
    `Người dẫn đầu doanh thu trong ${period.label} là ${leader.seller_name} với ${formatCurrency(leader.revenue_amount)} từ ${leader.order_count.toLocaleString("vi-VN")} đơn.${assumptionText}`,
    `Top ${rows.length.toLocaleString("vi-VN")} seller ${period.label}:`,
    table
  ].join("\n\n");
}

export const topSellersPeriodSkill = {
  id: "top-sellers-period",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(top|xep hang|dan dau|cao nhat|nhieu nhat)/.test(foldedQuestion)
      && /(seller|sale|nhan vien|nguoi ban)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const rankingLimit = resolveRankingLimit(context);
    const rankingMetric = resolveRankingMetric(context);
    const requestedPeriods = extractRequestedMonthPeriods(context.routingQuestion || context.latestQuestion, connector);
    if (requestedPeriods.length > 1) {
      const periodResults = await Promise.all(requestedPeriods.map(async (period) => ({
        period,
        ...(await queryRankingForPeriod(connector, period, rankingLimit, rankingMetric))
      })));
      const primaryResult = periodResults[0];
      const reply = periodResults
        .map((item) => buildReplyBlock(item.period, item.leader, item.rows, rankingMetric))
        .join("\n\n");

      return {
        reply,
        fallback_reply: reply,
        format_hint: primaryResult.rows.length > 0 ? "ranking_table" : "no_data",
        summary_facts: primaryResult.leader ? {
          period_label: primaryResult.period.label,
          period_from: primaryResult.period.from,
          period_to: primaryResult.period.to,
          leader: primaryResult.leader,
          ranking_metric: rankingMetric,
          ranking_limit: rankingLimit,
          requested_periods: periodResults.map((item) => item.period.label)
        } : {
          period_label: primaryResult.period.label,
          period_from: primaryResult.period.from,
          period_to: primaryResult.period.to,
          leader: null,
          ranking_metric: rankingMetric,
          ranking_limit: rankingLimit,
          requested_periods: periodResults.map((item) => item.period.label)
        },
        data: {
          ranking: primaryResult.rows,
          rankings_by_period: periodResults.map((item) => ({
            period_label: item.period.label,
            rows: item.rows
          }))
        },
        sqlLogs: periodResults.map((item, index) => ({
          name: index === 0 ? this.id : `${this.id}_${item.period.month_key || index + 1}`,
          sql: item.result.sql,
          row_count: item.result.row_count,
          row_limit: item.result.row_limit
        })),
        usage: createUsage("skill")
      };
    }

    const period = resolveRankingPeriod(context, connector);
    const orderBy = rankingMetric === "orders"
      ? "order_count DESC, revenue_amount DESC, seller_name ASC"
      : "revenue_amount DESC, order_count DESC, seller_name ASC";
    const result = await connector.runReadQueryAsync({
      sql: `
        SELECT
          COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned') AS seller_name,
          ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount,
          COUNT(*) AS order_count
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        GROUP BY seller_name
        ORDER BY ${orderBy}
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: rankingLimit
    });

    const rows = result.rows.slice(0, rankingLimit).map((row) => ({
      seller_name: row.seller_name,
      revenue_amount: Number(row.revenue_amount || 0),
      order_count: Number(row.order_count || 0)
    }));
    const leader = rows[0] || null;
    const table = formatMarkdownTable(
      ["Top", "Seller", "Doanh thu", "Số đơn"],
      rows.map((row, index) => [
        String(index + 1),
        row.seller_name,
        formatCurrency(row.revenue_amount),
        row.order_count.toLocaleString("vi-VN")
      ])
    );

    let reply;
    if (!leader) {
      reply = `Không tìm thấy dữ liệu xếp hạng seller trong ${period.label}.`;
    } else {
      const assumptionText = period.inferred_year ? " Tôi đang mặc định năm mới nhất trong dữ liệu." : "";
      if (rankingMetric === "orders") {
        reply = [
          `Seller có số đơn không hủy cao nhất trong ${period.label} là ${leader.seller_name} với ${leader.order_count.toLocaleString("vi-VN")} đơn, doanh thu ${formatCurrency(leader.revenue_amount)}.${assumptionText}`,
          "Bảng seller theo số đơn:",
          table
        ].join("\n\n");
      } else {
        reply = [
          `Người dẫn đầu doanh thu trong ${period.label} là ${leader.seller_name} với ${formatCurrency(leader.revenue_amount)} từ ${leader.order_count.toLocaleString("vi-VN")} đơn.${assumptionText}`,
          `Top ${rows.length.toLocaleString("vi-VN")} seller:`,
          table
        ].join("\n\n");
      }
    }

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? "ranking_table" : "no_data",
      summary_facts: leader ? {
        period_label: period.label,
        period_from: period.from,
        period_to: period.to,
        leader: leader,
        ranking_metric: rankingMetric,
        ranking_limit: rankingLimit
      } : {
        period_label: period.label,
        period_from: period.from,
        period_to: period.to,
        leader: null,
        ranking_metric: rankingMetric,
        ranking_limit: rankingLimit
      },
      data: {
        ranking: rows
      },
      sqlLogs: [{
        name: this.id,
        sql: result.sql,
        row_count: result.row_count,
        row_limit: result.row_limit
      }],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
