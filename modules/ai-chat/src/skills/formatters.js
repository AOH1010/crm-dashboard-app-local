export function formatMarkdownTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, dividerLine, ...rowLines].join("\n");
}

export function formatCurrency(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("vi-VN")} VND`;
}

export function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}%`;
}
