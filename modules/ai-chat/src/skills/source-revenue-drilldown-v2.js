import { createUsage } from "../contracts/chat-contracts.js";
import { resolveCurrentPeriod } from "../tooling/question-analysis.js";
import {
  buildSourceGroupCaseSql,
  detectSourceGroupIntent,
  listSourceGroups
} from "./business-mappings-v2.js";
import { formatCurrency } from "./formatters.js";

const sourceGroupCaseSql = buildSourceGroupCaseSql("c.account_source_full_name");

async function fetchSourceRevenueRow(connector, period, sourceGroup) {
  const result = await connector.runReadQueryAsync({
    sql: `
      SELECT
        ${sourceGroupCaseSql} AS source_group,
        ROUND(SUM(COALESCE(o.real_amount, 0)), 2) AS revenue_amount,
        COUNT(*) AS order_count
      FROM orders o
      LEFT JOIN customers c ON TRIM(COALESCE(o.id_1, '')) = TRIM(COALESCE(c.id_1, ''))
      WHERE TRIM(COALESCE(o.status_label, '')) <> COALESCE((
        SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
      ), '__never_match__')
        AND SUBSTR(COALESCE(NULLIF(TRIM(o.order_date), ''), SUBSTR(NULLIF(TRIM(o.created_at), ''), 1, 10)), 1, 10) BETWEEN ? AND ?
      GROUP BY source_group
      HAVING source_group = ?
    `,
    params: [period.from, period.to, sourceGroup],
    allowPlaceholders: true,
    maxRows: 1
  });

  return {
    row: result.rows[0] || null,
    sqlLog: {
      name: "source-revenue-drilldown",
      sql: result.sql,
      row_count: result.row_count,
      row_limit: result.row_limit
    }
  };
}

export const sourceRevenueDrilldownSkillV2 = {
  id: "source-revenue-drilldown",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    const clauses = String(foldedQuestion || "")
      .split(/\b(?:va|dong thoi|kem theo|ngoai ra|sau do|con)\b/)
      .map((clause) => clause.trim())
      .filter(Boolean);
    return clauses.some((clause) => (
      /(nguon|source|kenh)/.test(clause)
      && /(doanh thu|doanh so|\bdt\b|revenue)/.test(clause)
      && !/(conversion|chuyen doi|\bcr\b)/.test(clause)
    ));
  },
  async run(context, connector) {
    const sourceIntent = detectSourceGroupIntent(context.latestQuestion);
    const availableGroups = listSourceGroups();
    const period = resolveCurrentPeriod({
      selectedFilters: context.selectedFilters,
      latestDateKey: connector.getLatestOrderDateKey()
    });

    if (!sourceIntent) {
      const reply = `Tôi chưa map được nguồn bạn đang hỏi. Hiện tại hệ thống đang gồm các nhóm nguồn: ${availableGroups.join(", ")}. Bạn muốn xem nhóm nào?`;
      return {
        reply,
        fallback_reply: reply,
        format_hint: "clarify_like",
        summary_facts: {
          requested_group: null,
          available_groups: availableGroups
        },
        data: null,
        sqlLogs: [],
        usage: createUsage("skill")
      };
    }

    if (sourceIntent.mode === "suggested") {
      const { row, sqlLog } = await fetchSourceRevenueRow(connector, period, sourceIntent.group);
      const reply = row
        ? `Tôi không thấy nhóm nguồn đúng y nguyên văn trong hệ thống. Tôi đang map tạm câu hỏi này về nhóm ${sourceIntent.group}. Nếu đúng ý bạn, trong giai đoạn ${period.from} đến ${period.to}, nhóm ${sourceIntent.group} mang về ${formatCurrency(row.revenue_amount)} từ ${Number(row.order_count || 0).toLocaleString("vi-VN")} đơn không hủy. Các nhóm nguồn chuẩn hiện có là: ${availableGroups.join(", ")}.`
        : `Tôi không thấy nhóm nguồn đúng y nguyên văn trong hệ thống. Tôi đang nghiêng về nhóm ${sourceIntent.group}, nhưng trong giai đoạn ${period.from} đến ${period.to} chưa thấy doanh thu ghi nhận cho nhóm này. Các nhóm nguồn chuẩn hiện có là: ${availableGroups.join(", ")}.`;
      return {
        reply,
        fallback_reply: reply,
        format_hint: "clarify_like",
        summary_facts: {
          requested_group: null,
          suggested_group: sourceIntent.group,
          period_from: period.from,
          period_to: period.to,
          revenue_amount: row ? Number(row.revenue_amount || 0) : 0,
          order_count: row ? Number(row.order_count || 0) : 0,
          available_groups: availableGroups
        },
        data: row ? {
          source_group: sourceIntent.group,
          revenue_amount: Number(row.revenue_amount || 0),
          order_count: Number(row.order_count || 0)
        } : null,
        sqlLogs: row ? [sqlLog] : [],
        usage: createUsage("skill")
      };
    }

    const { row, sqlLog } = await fetchSourceRevenueRow(connector, period, sourceIntent.group);
    const reply = row
      ? `Trong giai đoạn ${period.from} đến ${period.to}, nhóm nguồn ${sourceIntent.group} mang về ${formatCurrency(row.revenue_amount)} từ ${Number(row.order_count || 0).toLocaleString("vi-VN")} đơn không hủy.`
      : `Không tìm thấy doanh thu cho nhóm nguồn ${sourceIntent.group} trong giai đoạn ${period.from} đến ${period.to}.`;

    return {
      reply,
      fallback_reply: reply,
      format_hint: row ? "summary" : "no_data",
      summary_facts: {
        source_group: sourceIntent.group,
        period_from: period.from,
        period_to: period.to,
        revenue_amount: row ? Number(row.revenue_amount || 0) : 0,
        order_count: row ? Number(row.order_count || 0) : 0
      },
      data: row ? {
        source_group: sourceIntent.group,
        revenue_amount: Number(row.revenue_amount || 0),
        order_count: Number(row.order_count || 0)
      } : null,
      sqlLogs: row ? [sqlLog] : [],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
