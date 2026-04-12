import { createUsage } from "../contracts/chat-contracts.js";
import { addMonthsToMonthKey, endOfMonthKey, formatMonthLabel } from "../tooling/date-utils.js";
import { extractMonthYear } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable, formatPercent } from "./formatters.js";

function buildMonthKeys(year) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function extractTargetForecast(question, connector) {
  const latestYear = connector.getLatestOrderYear();
  const explicit = extractMonthYear(question);
  if (explicit?.month) {
    return {
      target_year: explicit.year || latestYear,
      target_month: explicit.month
    };
  }

  return {
    target_year: latestYear,
    target_month: 12
  };
}

function getLastCompleteMonthKey(latestDateKey) {
  const latestMonthKey = latestDateKey.slice(0, 7);
  const monthIsComplete = latestDateKey === endOfMonthKey(latestDateKey);
  return monthIsComplete ? latestMonthKey : addMonthsToMonthKey(latestMonthKey, -1);
}

async function fetchMonthlyRevenue(connector, years) {
  const result = await connector.runReadQueryAsync({
    sql: `
      SELECT
        SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) AS month_key,
        ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount,
        COUNT(*) AS order_count
      FROM orders
      WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
        SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
      ), '__never_match__')
        AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 4) IN (?, ?)
      GROUP BY month_key
      ORDER BY month_key ASC
    `,
    params: years.map((year) => String(year)),
    allowPlaceholders: true,
    maxRows: 24
  });

  return {
    rows: result.rows.map((row) => ({
      month_key: row.month_key,
      revenue_amount: Number(row.revenue_amount || 0),
      order_count: Number(row.order_count || 0)
    })),
    sqlLog: {
      name: "revenue-forecast",
      sql: result.sql,
      row_count: result.row_count,
      row_limit: result.row_limit
    }
  };
}

export const revenueForecastSkill = {
  id: "revenue-forecast",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(du bao|forecast|du phong)/.test(foldedQuestion)
      && /(doanh thu|doanh so|\bdt\b|revenue)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const latestDateKey = connector.getLatestOrderDateKey();
    const latestYear = connector.getLatestOrderYear();
    const latestMonthKey = connector.getLatestMonthKey();
    const lastCompleteMonthKey = getLastCompleteMonthKey(latestDateKey);
    const target = extractTargetForecast(context.latestQuestion, connector);

    if (target.target_year !== latestYear) {
      const reply = `Hiện tại skill forecast đang grounded theo năm dữ liệu mới nhất là ${latestYear}. Bạn đang hỏi ${String(target.target_month).padStart(2, "0")}/${target.target_year}, nên tôi cần thêm rule riêng nếu muốn forecast vượt sang năm khác.`;
      return {
        reply,
        fallback_reply: reply,
        format_hint: "clarify_like",
        summary_facts: {
          latest_year: latestYear,
          target_year: target.target_year,
          target_month: target.target_month
        },
        data: null,
        sqlLogs: [],
        usage: createUsage("skill")
      };
    }

    const previousYear = latestYear - 1;
    const { rows, sqlLog } = await fetchMonthlyRevenue(connector, [previousYear, latestYear]);
    const revenueByMonth = new Map(rows.map((row) => [row.month_key, row]));
    const allCurrentMonthKeys = buildMonthKeys(latestYear);
    const actualMonthKeys = allCurrentMonthKeys.filter((monthKey) => monthKey <= lastCompleteMonthKey);
    const comparablePriorMonthKeys = actualMonthKeys.map((monthKey) => `${previousYear}${monthKey.slice(4)}`);
    const forecastMonthKeys = allCurrentMonthKeys.filter((monthKey) => monthKey > lastCompleteMonthKey);

    const actualRows = actualMonthKeys
      .map((monthKey) => ({
        month_key: monthKey,
        label: formatMonthLabel(monthKey),
        revenue_amount: Number(revenueByMonth.get(monthKey)?.revenue_amount || 0)
      }));
    const previousActualRows = comparablePriorMonthKeys
      .map((monthKey) => ({
        month_key: monthKey,
        revenue_amount: Number(revenueByMonth.get(monthKey)?.revenue_amount || 0)
      }));

    const currentYtd = actualRows.reduce((sum, row) => sum + row.revenue_amount, 0);
    const previousYtd = previousActualRows.reduce((sum, row) => sum + row.revenue_amount, 0);
    if (!actualRows.length || previousYtd <= 0) {
      const reply = `Tôi chưa đủ baseline để forecast doanh thu ${String(target.target_month).padStart(2, "0")}/${target.target_year} theo phương pháp YTD growth.`;
      return {
        reply,
        fallback_reply: reply,
        format_hint: "no_data",
        summary_facts: {
          target_year: target.target_year,
          target_month: target.target_month,
          actual_month_count: actualRows.length,
          previous_ytd: previousYtd
        },
        data: null,
        sqlLogs: [sqlLog],
        usage: createUsage("skill")
      };
    }

    const growthRate = currentYtd / previousYtd;
    const forecastRows = forecastMonthKeys.map((monthKey) => {
      const previousYearMonthKey = `${previousYear}${monthKey.slice(4)}`;
      const baseline = Number(revenueByMonth.get(previousYearMonthKey)?.revenue_amount || 0);
      return {
        month_key: monthKey,
        label: formatMonthLabel(monthKey),
        baseline_amount: baseline,
        forecast_amount: baseline * growthRate
      };
    });

    const targetMonthKey = `${target.target_year}-${String(target.target_month).padStart(2, "0")}`;
    const actualTargetRow = actualRows.find((row) => row.month_key === targetMonthKey) || null;
    const forecastTargetRow = forecastRows.find((row) => row.month_key === targetMonthKey) || null;
    const forecastTargetAmount = actualTargetRow
      ? actualTargetRow.revenue_amount
      : Number(forecastTargetRow?.forecast_amount || 0);

    const actualTotal = actualRows.reduce((sum, row) => sum + row.revenue_amount, 0);
    const forecastTotal = forecastRows.reduce((sum, row) => sum + row.forecast_amount, 0);
    const fullYearForecast = actualTotal + forecastTotal;
    const previousYearTotal = buildMonthKeys(previousYear)
      .reduce((sum, monthKey) => sum + Number(revenueByMonth.get(monthKey)?.revenue_amount || 0), 0);
    const fullYearGrowth = previousYearTotal > 0 ? ((fullYearForecast / previousYearTotal) - 1) * 100 : 0;

    const actualTable = formatMarkdownTable(
      ["Actual month", "Doanh thu"],
      actualRows.map((row) => [row.label, formatCurrency(row.revenue_amount)])
    );
    const forecastTable = formatMarkdownTable(
      ["Forecast month", "Baseline năm trước", "Forecast năm nay"],
      forecastRows.map((row) => [
        row.label,
        formatCurrency(row.baseline_amount),
        formatCurrency(row.forecast_amount)
      ])
    );

    const isOpenMonth = latestDateKey !== endOfMonthKey(latestDateKey);
    const reply = [
      `Tôi forecast doanh thu ${formatMonthLabel(targetMonthKey)} theo phương pháp YTD growth dựa trên dữ liệu CRM đã grounded.`,
      `- Actual months dùng để tính: ${actualRows.map((row) => row.label).join(", ")}.`,
      `- Actual YTD ${latestYear}: ${formatCurrency(currentYtd)}.`,
      `- YTD cùng kỳ ${previousYear}: ${formatCurrency(previousYtd)}.`,
      `- Growth rate YTD: ${formatPercent((growthRate - 1) * 100)}.`,
      `- Forecast riêng ${formatMonthLabel(targetMonthKey)}: ${formatCurrency(forecastTargetAmount)}.`,
      `- Full-year ${latestYear} dự kiến: ${formatCurrency(fullYearForecast)}.`,
      `- So với full-year ${previousYear}: ${formatPercent(fullYearGrowth)}.`,
      isOpenMonth
        ? `- Assumption: ${formatMonthLabel(latestMonthKey)} đang là tháng mở đến ${latestDateKey}, nên tôi chỉ dùng actual đến ${formatMonthLabel(lastCompleteMonthKey)} để tránh lệch growth.`
        : "- Assumption: dùng actual trọn tháng đã chốt trong năm hiện tại làm baseline YTD.",
      "",
      "Actual months:",
      actualTable,
      "",
      "Forecast months:",
      forecastTable
    ].join("\n");

    return {
      reply,
      fallback_reply: reply,
      format_hint: "forecast_table",
      summary_facts: {
        target_year: target.target_year,
        target_month: target.target_month,
        actual_months: actualRows.map((row) => row.month_key),
        forecast_months: forecastRows.map((row) => row.month_key),
        current_ytd: currentYtd,
        previous_ytd: previousYtd,
        growth_rate: growthRate,
        target_forecast_amount: forecastTargetAmount,
        full_year_forecast: fullYearForecast,
        previous_year_total: previousYearTotal
      },
      data: {
        actual_months: actualRows,
        forecast_months: forecastRows
      },
      sqlLogs: [sqlLog],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
