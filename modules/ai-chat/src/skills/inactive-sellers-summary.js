import { createUsage } from "../contracts/chat-contracts.js";
import { addMonthsToMonthKey } from "../tooling/date-utils.js";

export const inactiveSellersSummarySkill = {
  id: "inactive-sellers-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    return /(nghi viec|thoi viec|resign|roi cong ty)/.test(foldedQuestion)
      && /(sale|seller|nhan vien sale)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const latestMonthKey = connector.getLatestMonthKey();
    const fromMonthKey = addMonthsToMonthKey(latestMonthKey, -2);

    const result = await connector.runReadQueryAsync({
      sql: `
        WITH seller_base AS (
          SELECT DISTINCT TRIM(COALESCE(name, '')) AS seller_name
          FROM (
            SELECT saler_name AS name FROM orders
            UNION ALL
            SELECT contact_name AS name FROM staffs
          )
          WHERE LENGTH(TRIM(COALESCE(name, ''))) > 0
        ),
        seller_revenue AS (
          SELECT
            TRIM(COALESCE(saler_name, '')) AS seller_name,
            ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount,
            COUNT(*) AS order_count
          FROM orders
          WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
            AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) BETWEEN ? AND ?
          GROUP BY TRIM(COALESCE(saler_name, ''))
        )
        SELECT
          sb.seller_name,
          COALESCE(sr.revenue_amount, 0) AS revenue_amount,
          COALESCE(sr.order_count, 0) AS order_count
        FROM seller_base sb
        LEFT JOIN seller_revenue sr ON sr.seller_name = sb.seller_name
        WHERE COALESCE(sr.order_count, 0) = 0
        ORDER BY sb.seller_name ASC
      `,
      params: [fromMonthKey, latestMonthKey],
      allowPlaceholders: true,
      maxRows: 12
    });

    const rows = result.rows.map((row) => ({
      seller_name: row.seller_name,
      revenue_amount: Number(row.revenue_amount || 0),
      order_count: Number(row.order_count || 0)
    }));

    const preview = rows.slice(0, 8).map((row) => `- ${row.seller_name}`).join("\n");
    const reply = rows.length > 0
      ? [
        `Hệ thống không có dữ liệu nghỉ việc chính thức, nên tôi đổi sang danh sách seller không phát sinh doanh thu trong 3 tháng gần nhất (${fromMonthKey} đến ${latestMonthKey}).`,
        `Hiện có ${rows.length.toLocaleString("vi-VN")} seller đang ở trạng thái này.`,
        preview
      ].join("\n\n")
      : `Không có seller nào mất doanh thu liên tục trong 3 tháng gần nhất (${fromMonthKey} đến ${latestMonthKey}).`;

    return {
      reply,
      fallback_reply: reply,
      format_hint: rows.length > 0 ? "summary" : "no_data",
      summary_facts: {
        from_month_key: fromMonthKey,
        to_month_key: latestMonthKey,
        seller_count: rows.length
      },
      data: {
        sellers: rows
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
