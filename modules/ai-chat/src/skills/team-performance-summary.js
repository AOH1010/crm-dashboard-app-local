import { createUsage } from "../contracts/chat-contracts.js";
import { endOfMonthKey } from "../tooling/date-utils.js";
import { foldText } from "../tooling/common.js";
import { resolveCurrentPeriod, resolveMonthlyWindow } from "../tooling/question-analysis.js";
import { formatCurrency, formatMarkdownTable } from "./formatters.js";
import { buildTeamCaseSql, detectTeamEntities } from "./business-mappings.js";

const teamCaseSql = buildTeamCaseSql("s.dept_name");

function resolveQuarterPeriod(question) {
  const normalized = foldText(question);
  const quarterMatch = normalized.match(/\bquy\s*(\d)\b(?:\s*nam\s*(20\d{2}))?/);
  if (!quarterMatch) {
    return null;
  }

  const quarter = Number.parseInt(quarterMatch[1], 10);
  const year = quarterMatch[2] ? Number.parseInt(quarterMatch[2], 10) : null;
  if (!year || quarter < 1 || quarter > 4) {
    return null;
  }

  const startMonth = ((quarter - 1) * 3) + 1;
  const endMonth = startMonth + 2;
  return {
    from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    to: endOfMonthKey(`${year}-${String(endMonth).padStart(2, "0")}-01`),
    label: `quý ${quarter}/${year}`
  };
}

function resolveTeamPeriod(context, connector) {
  const explicitQuarter = resolveQuarterPeriod(context.latestQuestion);
  if (explicitQuarter) {
    return explicitQuarter;
  }

  if (/thang\s*\d{1,2}|\bthang nay\b|\bthang truoc\b/.test(foldText(context.latestQuestion || ""))) {
    const monthWindow = resolveMonthlyWindow({
      question: context.latestQuestion,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });
    return {
      from: `${monthWindow.month_key}-01`,
      to: endOfMonthKey(`${monthWindow.month_key}-01`),
      label: monthWindow.label
    };
  }

  const period = resolveCurrentPeriod({
    selectedFilters: context.selectedFilters,
    latestDateKey: connector.getLatestOrderDateKey()
  });
  return {
    ...period,
    label: `${period.from} đến ${period.to}`
  };
}

function resolveRequestedTeams(context) {
  const intentTeams = Array.isArray(context.intent?.entities)
    ? context.intent.entities
      .filter((entity) => entity.type === "team")
      .map((entity) => String(entity.value || "").trim())
      .filter(Boolean)
    : [];

  if (intentTeams.length > 0) {
    return Array.from(new Set(intentTeams));
  }

  return detectTeamEntities(context.latestQuestion).map((team) => team.label);
}

export const teamPerformanceSummarySkill = {
  id: "team-performance-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(team|nhom)/.test(foldedQuestion)
      && /(doanh thu|doanh so|revenue|dan dau|xep hang|so sanh)/.test(foldedQuestion);
  },
  run(context, connector) {
    const period = resolveTeamPeriod(context, connector);
    const requestedTeams = resolveRequestedTeams(context);
    const requestedTeam = requestedTeams[0] || null;
    const questionText = foldText(context.latestQuestion || "");
    const isComparisonAsk = /so sanh/.test(questionText) || requestedTeams.length >= 2;

    const result = connector.runReadQuery({
      sql: `
        WITH team_orders AS (
          SELECT
            ${teamCaseSql} AS team_label,
            COALESCE(NULLIF(TRIM(o.saler_name), ''), 'Unassigned') AS seller_name,
            COALESCE(o.real_amount, 0) AS revenue_amount
          FROM orders o
          LEFT JOIN staffs s
            ON TRIM(o.saler_name) = TRIM(s.contact_name)
          WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
            AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
        )
        SELECT
          team_label,
          ROUND(SUM(revenue_amount), 2) AS revenue_amount,
          COUNT(*) AS order_count,
          COUNT(DISTINCT seller_name) AS seller_count
        FROM team_orders
        WHERE team_label <> 'Other'
        GROUP BY team_label
        ORDER BY revenue_amount DESC, order_count DESC, team_label ASC
      `,
      params: [period.from, period.to],
      allowPlaceholders: true,
      maxRows: 10
    });

    const rows = result.rows
      .map((row) => ({
        team_label: row.team_label,
        revenue_amount: Number(row.revenue_amount || 0),
        order_count: Number(row.order_count || 0),
        seller_count: Number(row.seller_count || 0)
      }))
      .filter((row) => requestedTeams.length === 0 || requestedTeams.includes(row.team_label));

    const topTeam = rows[0] || null;
    const table = formatMarkdownTable(
      ["Team", "Doanh thu", "Số đơn", "Seller active"],
      rows.map((row) => [
        row.team_label,
        formatCurrency(row.revenue_amount),
        row.order_count.toLocaleString("vi-VN"),
        row.seller_count.toLocaleString("vi-VN")
      ])
    );

    let reply;
    if (rows.length === 0 && requestedTeam) {
      reply = `Không tìm thấy dữ liệu của team ${requestedTeam} trong ${period.label}.`;
    } else if (rows.length === 0) {
      reply = `Không tìm thấy dữ liệu team trong ${period.label}.`;
    } else if (isComparisonAsk && rows.length >= 2) {
      const left = rows[0];
      const right = rows[1];
      const leader = left.revenue_amount >= right.revenue_amount ? left : right;
      const trailer = leader.team_label === left.team_label ? right : left;
      const revenueGap = Math.abs(left.revenue_amount - right.revenue_amount);
      const orderGap = Math.abs(left.order_count - right.order_count);
      const sellerGap = Math.abs(left.seller_count - right.seller_count);

      reply = [
        `Trong ${period.label}, ${leader.team_label} đang nhỉnh hơn ${trailer.team_label} với chênh lệch doanh thu ${formatCurrency(revenueGap)}.`,
        `- ${left.team_label}: ${formatCurrency(left.revenue_amount)}, ${left.order_count.toLocaleString("vi-VN")} đơn, ${left.seller_count.toLocaleString("vi-VN")} seller active.`,
        `- ${right.team_label}: ${formatCurrency(right.revenue_amount)}, ${right.order_count.toLocaleString("vi-VN")} đơn, ${right.seller_count.toLocaleString("vi-VN")} seller active.`,
        `- Chênh lệch đơn hàng / seller active: ${orderGap.toLocaleString("vi-VN")} đơn / ${sellerGap.toLocaleString("vi-VN")} người.`,
        table
      ].join("\n\n");
    } else if (requestedTeam) {
      const selectedTeam = rows[0];
      reply = [
        `Trong ${period.label}, team ${selectedTeam.team_label} đạt doanh thu ${formatCurrency(selectedTeam.revenue_amount)}.`,
        `- Số đơn: ${selectedTeam.order_count.toLocaleString("vi-VN")}.`,
        `- Seller active: ${selectedTeam.seller_count.toLocaleString("vi-VN")}.`
      ].join("\n");
    } else {
      reply = [
        `Team dẫn đầu doanh thu trong ${period.label} là ${topTeam.team_label} với ${formatCurrency(topTeam.revenue_amount)}.`,
        table
      ].join("\n\n");
    }

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? (isComparisonAsk ? "comparison" : requestedTeam ? "summary" : "ranking_table") : "no_data",
      summary_facts: {
        period_label: period.label,
        period_from: period.from,
        period_to: period.to,
        requested_teams: requestedTeams,
        top_team: topTeam ? {
          team_label: topTeam.team_label,
          revenue_amount: topTeam.revenue_amount,
          order_count: topTeam.order_count,
          seller_count: topTeam.seller_count
        } : null,
        team_count: rows.length
      },
      data: {
        teams: rows
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
