import { createUsage } from "../contracts/chat-contracts.js";
import { addMonthsToMonthKey, endOfMonthKey, formatMonthLabel, getSystemTodayDateKey, monthKey } from "../tooling/date-utils.js";
import { foldText } from "../tooling/common.js";
import { buildTeamCaseSql } from "./business-mappings.js";
import { formatCurrency, formatPercent } from "./formatters.js";

const teamCaseSql = buildTeamCaseSql("s.dept_name");

function extractExplicitMonthPairs(question) {
  const normalized = foldText(question);
  const matches = Array.from(normalized.matchAll(/\bthang\s*(\d{1,2})(?:\s*\/\s*(20\d{2})|\s*nam\s*(20\d{2}))?/g));
  return matches
    .map((match) => {
      const month = Number.parseInt(match[1], 10);
      const year = Number.parseInt(match[2] || match[3] || "", 10);
      if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
        return null;
      }
      return `${year}-${String(month).padStart(2, "0")}`;
    })
    .filter(Boolean);
}

function resolveTrendScope(question, connector) {
  const explicitMonths = extractExplicitMonthPairs(question);
  if (explicitMonths.length >= 2) {
    return {
      mode: "compare_pair",
      months: explicitMonths.slice(0, 2)
    };
  }

  const latestMonthKey = connector.getLatestMonthKey();
  const todayKey = getSystemTodayDateKey();
  const systemMonthKey = monthKey(todayKey);
  const endMonthKey = latestMonthKey === systemMonthKey && todayKey !== endOfMonthKey(todayKey)
    ? addMonthsToMonthKey(latestMonthKey, -1)
    : latestMonthKey;
  const months = Array.from({ length: 6 }, (_, index) => addMonthsToMonthKey(endMonthKey, index - 5));
  return {
    mode: "recent_six_months",
    months
  };
}

function buildMonthMetricsMap(rows) {
  return new Map(rows.map((row) => [row.month_key, {
    month_key: row.month_key,
    total_revenue: Number(row.total_revenue || 0),
    new_leads: Number(row.new_leads || 0),
    new_customers: Number(row.new_customers || 0)
  }]));
}

export const revenueTrendAnalysisSkill = {
  id: "revenue-trend-analysis",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(doanh thu|doanh so|revenue)/.test(foldedQuestion)
      && /(xu huong|trend|tang hay giam|giam hay tang|bat thuong|tai sao|vi sao|nguyen nhan)/.test(foldedQuestion);
  },
  run(context, connector) {
    const scope = resolveTrendScope(context.latestQuestion, connector);
    const questionText = foldText(context.latestQuestion || "");

    const monthlyMetricsResult = connector.runReadQuery({
      sql: `
        SELECT
          SUBSTR(day, 1, 7) AS month_key,
          ROUND(COALESCE(SUM(revenue_amount), 0), 2) AS total_revenue,
          COALESCE(SUM(new_leads_count), 0) AS new_leads,
          COALESCE(SUM(new_customers_count), 0) AS new_customers
        FROM kpis_daily
        WHERE SUBSTR(day, 1, 7) IN (${scope.months.map(() => "?").join(", ")})
        GROUP BY SUBSTR(day, 1, 7)
        ORDER BY month_key ASC
      `,
      params: scope.months,
      allowPlaceholders: true,
      maxRows: 12
    });

    const teamBreakdownResult = connector.runReadQuery({
      sql: `
        SELECT
          SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 7) AS month_key,
          ${teamCaseSql} AS team_label,
          ROUND(SUM(COALESCE(o.real_amount, 0)), 2) AS revenue_amount
        FROM orders o
        LEFT JOIN staffs s
          ON TRIM(o.saler_name) = TRIM(s.contact_name)
        WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 7) IN (${scope.months.map(() => "?").join(", ")})
        GROUP BY month_key, team_label
        ORDER BY month_key ASC, revenue_amount DESC, team_label ASC
      `,
      params: scope.months,
      allowPlaceholders: true,
      maxRows: 48
    });

    const metricsRows = monthlyMetricsResult.rows.map((row) => ({
      month_key: row.month_key,
      total_revenue: Number(row.total_revenue || 0),
      new_leads: Number(row.new_leads || 0),
      new_customers: Number(row.new_customers || 0)
    }));
    const metricsMap = buildMonthMetricsMap(metricsRows);

    let reply;
    if (scope.mode === "compare_pair") {
      const [firstMonthKey, secondMonthKey] = scope.months;
      const baseMonthKey = /so voi/.test(questionText) ? secondMonthKey : firstMonthKey;
      const compareMonthKey = /so voi/.test(questionText) ? firstMonthKey : secondMonthKey;
      const baseMetrics = metricsMap.get(baseMonthKey) || {
        month_key: baseMonthKey,
        total_revenue: 0,
        new_leads: 0,
        new_customers: 0
      };
      const compareMetrics = metricsMap.get(compareMonthKey) || {
        month_key: compareMonthKey,
        total_revenue: 0,
        new_leads: 0,
        new_customers: 0
      };
      const revenueDelta = compareMetrics.total_revenue - baseMetrics.total_revenue;
      const revenueDeltaPercent = baseMetrics.total_revenue > 0 ? (revenueDelta / baseMetrics.total_revenue) * 100 : 0;
      const baseConversion = baseMetrics.new_leads > 0 ? (baseMetrics.new_customers / baseMetrics.new_leads) * 100 : 0;
      const compareConversion = compareMetrics.new_leads > 0 ? (compareMetrics.new_customers / compareMetrics.new_leads) * 100 : 0;
      const teamRows = teamBreakdownResult.rows
        .map((row) => ({
          month_key: row.month_key,
          team_label: row.team_label,
          revenue_amount: Number(row.revenue_amount || 0)
        }))
        .filter((row) => row.team_label !== "Other");
      const baseTeamMap = new Map(teamRows.filter((row) => row.month_key === baseMonthKey).map((row) => [row.team_label, row.revenue_amount]));
      const compareTeamMap = new Map(teamRows.filter((row) => row.month_key === compareMonthKey).map((row) => [row.team_label, row.revenue_amount]));
      const teamDeltas = Array.from(new Set([...baseTeamMap.keys(), ...compareTeamMap.keys()]))
        .map((teamLabel) => ({
          team_label: teamLabel,
          delta: Number(compareTeamMap.get(teamLabel) || 0) - Number(baseTeamMap.get(teamLabel) || 0)
        }))
        .sort((left, right) => left.delta - right.delta);
      const biggestDropTeam = teamDeltas[0] || null;

      reply = [
        `Doanh thu ${formatMonthLabel(compareMonthKey)} ${revenueDelta < 0 ? "giảm" : "tăng"} ${formatCurrency(Math.abs(revenueDelta))} so với ${formatMonthLabel(baseMonthKey)} (${formatPercent(Math.abs(revenueDeltaPercent))}).`,
        `- ${formatMonthLabel(baseMonthKey)}: ${formatCurrency(baseMetrics.total_revenue)} | lead mới ${baseMetrics.new_leads.toLocaleString("vi-VN")} | khách mới ${baseMetrics.new_customers.toLocaleString("vi-VN")} | conversion ${formatPercent(baseConversion)}.`,
        `- ${formatMonthLabel(compareMonthKey)}: ${formatCurrency(compareMetrics.total_revenue)} | lead mới ${compareMetrics.new_leads.toLocaleString("vi-VN")} | khách mới ${compareMetrics.new_customers.toLocaleString("vi-VN")} | conversion ${formatPercent(compareConversion)}.`,
        biggestDropTeam && biggestDropTeam.delta < 0
          ? `- Team giảm mạnh nhất: ${biggestDropTeam.team_label} (${formatCurrency(Math.abs(biggestDropTeam.delta))}).`
          : "- Không thấy team nào giảm mạnh vượt trội trong hai tháng này.",
        /tai sao|vi sao|nguyen nhan/.test(questionText)
          ? "- Nếu cần drill-down tiếp, tôi có thể tách theo team hoặc theo nguồn lead để kiểm tra nguyên nhân chi tiết hơn."
          : null
      ].filter(Boolean).join("\n");
    } else {
      const orderedRows = scope.months
        .map((monthKey) => metricsMap.get(monthKey))
        .filter(Boolean);
      const highestMonth = [...orderedRows].sort((left, right) => right.total_revenue - left.total_revenue)[0] || null;
      const lowestMonth = [...orderedRows].sort((left, right) => left.total_revenue - right.total_revenue)[0] || null;
      const lastMonth = orderedRows[orderedRows.length - 1] || null;
      const previousMonth = orderedRows[orderedRows.length - 2] || null;
      const lastDelta = lastMonth && previousMonth ? lastMonth.total_revenue - previousMonth.total_revenue : 0;
      const trendDirection = lastDelta > 0 ? "tăng" : lastDelta < 0 ? "giảm" : "đi ngang";

      reply = [
        `6 tháng gần nhất, doanh thu không đi theo một chiều cố định mà đang ${trendDirection} ở nhịp gần nhất.`,
        highestMonth ? `- Tháng cao nhất: ${formatMonthLabel(highestMonth.month_key)} với ${formatCurrency(highestMonth.total_revenue)}.` : null,
        lowestMonth ? `- Tháng thấp nhất: ${formatMonthLabel(lowestMonth.month_key)} với ${formatCurrency(lowestMonth.total_revenue)}.` : null,
        previousMonth && lastMonth
          ? `- Gần nhất: ${formatMonthLabel(previousMonth.month_key)} -> ${formatMonthLabel(lastMonth.month_key)} là ${lastDelta < 0 ? "giảm" : "tăng"} ${formatCurrency(Math.abs(lastDelta))}.`
          : null,
        highestMonth && lowestMonth && highestMonth.month_key !== lowestMonth.month_key
          ? `- Tháng bất thường đáng chú ý: ${lowestMonth.month_key === "2026-01" ? `${formatMonthLabel(lowestMonth.month_key)} thấp hơn hẳn các tháng còn lại.` : `${formatMonthLabel(lowestMonth.month_key)} là đáy của chuỗi 6 tháng.`}`
          : null
      ].filter(Boolean).join("\n");
    }

    return {
      reply,
      fallback_reply: reply,
      format_hint: "summary",
      summary_facts: {
        scope_mode: scope.mode,
        months: scope.months,
        metrics: metricsRows
      },
      data: {
        monthly_metrics: metricsRows,
        team_breakdown: teamBreakdownResult.rows
      },
      sqlLogs: [
        {
          name: `${this.id}_monthly_metrics`,
          sql: monthlyMetricsResult.sql,
          row_count: monthlyMetricsResult.row_count,
          row_limit: monthlyMetricsResult.row_limit
        },
        {
          name: `${this.id}_team_breakdown`,
          sql: teamBreakdownResult.sql,
          row_count: teamBreakdownResult.row_count,
          row_limit: teamBreakdownResult.row_limit
        }
      ],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
