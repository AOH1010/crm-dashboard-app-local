import { createUsage } from "../contracts/chat-contracts.js";
import { addMonthsToMonthKey } from "../tooling/date-utils.js";
import { formatMarkdownTable } from "./formatters.js";

export const inactiveSellersSummarySkill = {
  id: "inactive-sellers-summary",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion || "";
    return /(nghi viec|thoi viec|resign|roi cong ty|inactive|khong hoat dong|khong active)/.test(foldedQuestion)
      && /(sale|seller|nhan vien sale|nguoi ban)/.test(foldedQuestion);
  },
  async run(context, connector) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion || "";
    const latestMonthKey = connector.getLatestMonthKey();
    const fromMonthKey = addMonthsToMonthKey(latestMonthKey, -2);
    const periodLabel = `${fromMonthKey} den ${latestMonthKey}`;

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
      maxRows: 24
    });

    const rows = result.rows.map((row) => ({
      seller_name: row.seller_name,
      revenue_amount: Number(row.revenue_amount || 0),
      order_count: Number(row.order_count || 0)
    }));

    const asksList = /(ten|danh sach|liet ke|nhung ai|gom ai|seller nao|la ai|ai dang)/.test(foldedQuestion);
    const asksCount = /(bao nhieu|tong so|co may)/.test(foldedQuestion);
    const definitionText = `Tam quy uoc "seller inactive" la seller khong phat sinh doanh thu trong 3 thang gan nhat (${periodLabel}) vi he thong chua co cot nghi viec chinh thuc.`;
    const sellerTable = formatMarkdownTable(
      ["Seller", "So don", "Doanh thu"],
      rows.map((row) => [
        row.seller_name,
        row.order_count.toLocaleString("vi-VN"),
        `${Math.round(row.revenue_amount).toLocaleString("vi-VN")} VND`
      ])
    );

    const preview = rows.slice(0, 8).map((row) => `- ${row.seller_name}`).join("\n");
    const reply = rows.length > 0
      ? [
        `Hệ thống không có dữ liệu nghỉ việc chính thức, nên tôi đổi sang danh sách seller không phát sinh doanh thu trong 3 tháng gần nhất (${fromMonthKey} đến ${latestMonthKey}).`,
        `Hiện có ${rows.length.toLocaleString("vi-VN")} seller đang ở trạng thái này.`,
        preview
      ].join("\n\n")
      : `Không có seller nào mất doanh thu liên tục trong 3 tháng gần nhất (${fromMonthKey} đến ${latestMonthKey}).`;

    let finalReply = reply;
    let formatHint = rows.length > 0 ? "summary" : "no_data";
    if (rows.length === 0) {
      finalReply = `Khong co seller nao phu hop quy uoc inactive trong ${periodLabel}.`;
    } else if (asksList) {
      formatHint = "table";
      finalReply = [
        `Danh sach seller inactive theo quy uoc trong ${periodLabel}:`,
        definitionText,
        sellerTable
      ].join("\n\n");
    } else if (asksCount) {
      formatHint = "summary";
      finalReply = [
        `Trong ${periodLabel}, co ${rows.length.toLocaleString("vi-VN")} seller dang o trang thai inactive theo quy uoc nay.`,
        definitionText,
        sellerTable
      ].join("\n\n");
    } else if (rows.length > 0) {
      formatHint = "summary";
      finalReply = [
        `Tong hop seller inactive theo quy uoc trong ${periodLabel}:`,
        definitionText,
        `Hien co ${rows.length.toLocaleString("vi-VN")} seller phu hop.`,
        sellerTable
      ].join("\n\n");
    }

    return {
      reply: finalReply,
      fallback_reply: finalReply,
      format_hint: formatHint,
      summary_facts: {
        from_month_key: fromMonthKey,
        to_month_key: latestMonthKey,
        seller_count: rows.length,
        definition_key: "seller_inactive_no_revenue_recent_3_months",
        definition_text: definitionText
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
