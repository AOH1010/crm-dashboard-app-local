import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scanRoots = [
  path.join(projectRoot, "modules", "ai-chat", "src", "skills"),
  path.join(projectRoot, "modules", "ai-chat", "src", "runtime"),
  path.join(projectRoot, "modules", "ai-chat", "src", "connectors")
];
const outputDir = path.join(projectRoot, "artifacts", "v2-supabase");

const checks = [
  { id: "sqlite_placeholder", severity: "high", pattern: /\?/g, note: "SQLite placeholder '?' must become Postgres '$1' style or be adapted by connector." },
  { id: "substr", severity: "medium", pattern: /\bSUBSTR\s*\(/gi, note: "SUBSTR works in Postgres as substring alias but must be parity-tested for date strings." },
  { id: "sqlite_pragma_attach", severity: "high", pattern: /\b(PRAGMA|ATTACH|DETACH)\b/gi, note: "SQLite database management statements are not portable to Supabase." },
  { id: "temp_view", severity: "medium", pattern: /\bCREATE\s+TEMP\s+VIEW\b/gi, note: "SQLite temp views should be replaced by Supabase schema/search_path contract." },
  { id: "case_like", severity: "medium", pattern: /\bLIKE\b/gi, note: "SQLite LIKE and Postgres LIKE/ILIKE can differ in case sensitivity." },
  { id: "date_fn", severity: "medium", pattern: /\b(strftime|julianday|date)\s*\(/gi, note: "SQLite date functions need Postgres equivalents." },
  { id: "limit", severity: "low", pattern: /\bLIMIT\b/gi, note: "LIMIT is supported but should be checked with wrapper row_limit behavior." }
];

function walkFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

function auditFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const findings = [];

  for (const check of checks) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      check.pattern.lastIndex = 0;
      if (!check.pattern.test(line)) {
        continue;
      }
      findings.push({
        check_id: check.id,
        severity: check.severity,
        note: check.note,
        line: index + 1,
        snippet: line.trim().slice(0, 240)
      });
    }
  }

  return findings;
}

function summarize(findings) {
  const byCheck = {};
  const bySeverity = {};
  for (const finding of findings) {
    byCheck[finding.check_id] = (byCheck[finding.check_id] || 0) + 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
  }
  return { by_check: byCheck, by_severity: bySeverity };
}

const files = scanRoots.flatMap(walkFiles);
const findings = files.flatMap((filePath) => (
  auditFile(filePath).map((finding) => ({
    file: path.relative(projectRoot, filePath).replace(/\\/g, "/"),
    ...finding
  }))
));
const now = new Date().toISOString();
const report = {
  generated_at: now,
  scan_roots: scanRoots.map((root) => path.relative(projectRoot, root).replace(/\\/g, "/")),
  file_count: files.length,
  finding_count: findings.length,
  summary: summarize(findings),
  findings
};

fs.mkdirSync(outputDir, { recursive: true });
const safeStamp = now.replace(/[:.]/g, "-").toLowerCase();
const jsonPath = path.join(outputDir, `sql-dialect-audit-${safeStamp}.json`);
const mdPath = path.join(outputDir, `sql-dialect-audit-${safeStamp}.md`);

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(mdPath, [
  "# V2 SQL Dialect Audit",
  "",
  `Generated: ${now}`,
  `Files scanned: ${files.length}`,
  `Findings: ${findings.length}`,
  "",
  "## Summary",
  "",
  ...Object.entries(report.summary.by_check).map(([key, count]) => `- ${key}: ${count}`),
  "",
  "## High/Medium Findings",
  "",
  ...findings
    .filter((finding) => finding.severity !== "low")
    .slice(0, 120)
    .map((finding) => `- ${finding.severity.toUpperCase()} ${finding.file}:${finding.line} ${finding.check_id} - ${finding.snippet}`)
].join("\n"));

console.log(JSON.stringify({
  ok: true,
  finding_count: findings.length,
  json_path: path.relative(projectRoot, jsonPath).replace(/\\/g, "/"),
  md_path: path.relative(projectRoot, mdPath).replace(/\\/g, "/")
}, null, 2));
