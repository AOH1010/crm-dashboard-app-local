import { foldText } from "../tooling/common.js";
import { resolveMonthlyWindowFromContext } from "../tooling/question-analysis.js";
import { createUsage } from "../contracts/chat-contracts.js";
import { formatCurrency } from "./formatters.js";

function resolveSellerEntity(context, connector) {
  const explicitIntentSeller = context.intent?.entities?.find((entity) => entity.type === "seller")?.value || null;
  return explicitIntentSeller || connector.detectSellerName(context.latestQuestion);
}

function sellerExists(connector, sellerName) {
  const normalizedTarget = foldText(sellerName);
  return connector.getSellerNames().some((name) => foldText(name) === normalizedTarget);
}

function extractClaimedAmount(question) {
  const normalized = foldText(question);
  const millionMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*trieu/);
  if (millionMatch?.[1]) {
    return Math.round(Number.parseFloat(millionMatch[1].replace(",", ".")) * 1_000_000);
  }
  const billionMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*ty/);
  if (billionMatch?.[1]) {
    return Math.round(Number.parseFloat(billionMatch[1].replace(",", ".")) * 1_000_000_000);
  }
  const plainVndMatch = normalized.match(/\b(\d{7,12})\s*vnd\b/);
  if (plainVndMatch?.[1]) {
    return Number.parseInt(plainVndMatch[1], 10);
  }
  return null;
}

function wantsSellerRankingVerification(question) {
  const foldedQuestion = foldText(question || "");
  return /(check lai|xac nhan lai|so nay|van khop|co khop|khop khong|neu lech|dang ra hoi khac|bang xep hang|top seller)/.test(foldedQuestion);
}

export const sellerMonthRevenueSkillV3 = {
  id: "seller-month-revenue",
  canHandle(context) {
    const foldedQuestion = context.routingFoldedQuestion || context.foldedQuestion;
    const hasIntentSeller = Boolean(context.intent?.entities?.find((entity) => entity.type === "seller")?.value);
    if (!/(doanh so|doanh thu|\bdt\b|revenue|ban duoc bao nhieu)/.test(foldedQuestion)) {
      return false;
    }
    if (!hasIntentSeller && /(team|nhom|phong ban|dept|doi)/.test(foldedQuestion)) {
      return false;
    }
    return Boolean(resolveSellerEntity(context, context.connector));
  },
  async run(context, connector) {
    const sellerName = resolveSellerEntity(context, connector);
    if (!sellerName) {
      return null;
    }

    const resolvedMonth = resolveMonthlyWindowFromContext({
      question: context.routingQuestion || context.latestQuestion,
      context,
      selectedFilters: context.selectedFilters,
      latestMonthKey: connector.getLatestMonthKey(),
      latestYear: connector.getLatestOrderYear()
    });

    const sellerKnown = sellerExists(connector, sellerName);
    const claimedAmount = extractClaimedAmount(context.latestQuestion);
    const wantsVerification = wantsSellerRankingVerification(context.latestQuestion);
    const result = await connector.runReadQueryAsync({
      sql: `
        SELECT
          COALESCE(real_amount, 0) AS amount,
          TRIM(COALESCE(status_label, '')) AS status_label,
          COALESCE(NULLIF(TRIM(order_code), ''), 'N/A') AS order_code
        FROM orders
        WHERE TRIM(COALESCE(saler_name, '')) = ?
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) = ?
      `,
      params: [sellerName, resolvedMonth.month_key],
      allowPlaceholders: true,
      maxRows: 200
    });

    const monthTotalResult = await connector.runReadQueryAsync({
      sql: `
        SELECT
          ROUND(SUM(COALESCE(real_amount, 0)), 2) AS total_revenue
        FROM orders
        WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
          SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
        ), '__never_match__')
          AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) = ?
      `,
      params: [resolvedMonth.month_key],
      allowPlaceholders: true,
      maxRows: 1
    });

    const rankingResult = wantsVerification
      ? await connector.runReadQueryAsync({
        sql: `
          SELECT
            COALESCE(NULLIF(TRIM(saler_name), ''), 'Unassigned') AS seller_name,
            ROUND(SUM(COALESCE(real_amount, 0)), 2) AS revenue_amount
          FROM orders
          WHERE TRIM(COALESCE(status_label, '')) <> COALESCE((
            SELECT meta_value FROM dashboard_meta WHERE meta_key = 'cancelled_status_label'
          ), '__never_match__')
            AND SUBSTR(COALESCE(NULLIF(TRIM(order_date), ''), SUBSTR(NULLIF(TRIM(created_at), ''), 1, 10)), 1, 7) = ?
          GROUP BY seller_name
          ORDER BY revenue_amount DESC, seller_name ASC
        `,
        params: [resolvedMonth.month_key],
        allowPlaceholders: true,
        maxRows: 10
      })
      : null;

    const nonCancelledRows = result.rows.filter((row) => !foldText(row.status_label).includes("huy"));
    const totalRevenue = nonCancelledRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const orderCount = nonCancelledRows.length;
    const monthTotalRevenue = Number(monthTotalResult.rows[0]?.total_revenue || 0);
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    const sellerSharePercent = monthTotalRevenue > 0 ? (totalRevenue / monthTotalRevenue) * 100 : 0;
    const rankingRowIndex = wantsVerification
      ? (rankingResult?.rows || []).findIndex((row) => String(row.seller_name || "") === sellerName)
      : -1;
    const rankingRevenue = rankingRowIndex >= 0 ? Number(rankingResult?.rows?.[rankingRowIndex]?.revenue_amount || 0) : 0;
    const rankingDiff = rankingRowIndex >= 0 ? Math.abs(rankingRevenue - totalRevenue) : 0;

    let reply;
    if (!sellerKnown) {
      reply = `Không tìm thấy seller ${sellerName} trong danh sách sale hiện tại, nên tôi chưa thể trả doanh thu cho ${resolvedMonth.label}.`;
    } else if (orderCount === 0) {
      reply = `Không tìm thấy doanh số của ${sellerName} trong ${resolvedMonth.label}.`;
    } else {
      const assumptionText = resolvedMonth.inferred_year ? " Tôi đang mặc định năm mới nhất trong dữ liệu." : "";
      const primaryLine = claimedAmount !== null
        ? Math.abs(totalRevenue - claimedAmount) <= Math.max(claimedAmount * 0.03, 1_000_000)
          ? `Đúng, trong ${resolvedMonth.label}, ${sellerName} đạt khoảng ${formatCurrency(totalRevenue)} từ ${orderCount.toLocaleString("vi-VN")} đơn không hủy.${assumptionText}`
          : `Không. Trong ${resolvedMonth.label}, ${sellerName} đạt ${formatCurrency(totalRevenue)} chứ không phải ${formatCurrency(claimedAmount)}.${assumptionText}`
        : `Trong ${resolvedMonth.label}, ${sellerName} đạt doanh số ${formatCurrency(totalRevenue)} từ ${orderCount.toLocaleString("vi-VN")} đơn không hủy.${assumptionText}`;
      const replyLines = [
        primaryLine,
        `- Bình quân mỗi đơn: ${formatCurrency(averageOrderValue)}.`
      ];

      if (monthTotalRevenue > 0) {
        replyLines.push(`- Tỷ trọng trong tổng doanh thu toàn kỳ: ${sellerSharePercent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%.`);
      }

      if (wantsVerification) {
        if (rankingRowIndex >= 0 && rankingDiff < 1) {
          replyLines.push(`- T\u00f4i \u0111\u1ed1i chi\u1ebfu l\u1ea1i v\u1edbi b\u1ea3ng x\u1ebfp h\u1ea1ng seller c\u00f9ng k\u1ef3: s\u1ed1 n\u00e0y v\u1eabn kh\u1edbp, ${sellerName} \u0111ang \u0111\u1ee9ng #${rankingRowIndex + 1}.`);
        } else if (rankingRowIndex >= 0) {
          replyLines.push(`- T\u00f4i \u0111\u1ed1i chi\u1ebfu l\u1ea1i v\u1edbi b\u1ea3ng x\u1ebfp h\u1ea1ng seller c\u00f9ng k\u1ef3: \u0111ang l\u1ec7ch ${formatCurrency(rankingDiff)} (${formatCurrency(totalRevenue)} theo chi ti\u1ebft \u0111\u01a1n, ${formatCurrency(rankingRevenue)} theo b\u1ea3ng x\u1ebfp h\u1ea1ng).`);
        } else {
          replyLines.push("- T\u00f4i ch\u01b0a th\u1ea5y seller n\u00e0y trong b\u1ea3ng x\u1ebfp h\u1ea1ng c\u00f9ng k\u1ef3 \u0111\u1ec3 \u0111\u1ed1i chi\u1ebfu th\u00eam.");
        }
      }

      reply = replyLines.join("\n");
    }

    return {
      reply,
      fallback_reply: reply,
      format_hint: sellerKnown && orderCount > 0 ? "summary" : "no_data",
      summary_facts: {
        seller_name: sellerName,
        month_label: resolvedMonth.label,
        month_key: resolvedMonth.month_key,
        inferred_year: resolvedMonth.inferred_year,
        seller_known: sellerKnown,
        total_revenue: totalRevenue,
        order_count: orderCount,
        average_order_value: averageOrderValue,
        month_total_revenue: monthTotalRevenue,
        seller_share_percent: sellerSharePercent,
        claimed_amount: claimedAmount,
        verification_requested: wantsVerification,
        ranking_position: rankingRowIndex >= 0 ? rankingRowIndex + 1 : null,
        ranking_revenue: rankingRowIndex >= 0 ? rankingRevenue : null,
        ranking_diff: rankingRowIndex >= 0 ? rankingDiff : null
      },
      data: sellerKnown && orderCount > 0 ? {
        non_cancelled_orders: nonCancelledRows.map((row) => ({
          amount: Number(row.amount || 0),
          order_code: row.order_code
        }))
      } : null,
      sqlLogs: [{
        name: this.id,
        sql: result.sql,
        row_count: result.row_count,
        row_limit: result.row_limit
      }, {
        name: `${this.id}_month_total`,
        sql: monthTotalResult.sql,
        row_count: monthTotalResult.row_count,
        row_limit: monthTotalResult.row_limit
      },
      ...(rankingResult ? [{
        name: `${this.id}_ranking_check`,
        sql: rankingResult.sql,
        row_count: rankingResult.row_count,
        row_limit: rankingResult.row_limit
      }] : [])],
      usage: createUsage("skill")
    };
  },
  formatResponse(result) {
    return result;
  }
};
