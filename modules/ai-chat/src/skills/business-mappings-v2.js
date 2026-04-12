import {
  SOURCE_GROUP_ALIAS_HINTS,
  SOURCE_GROUP_ENTRIES
} from "../../../../apps/backend/src/lib/source-group-config.js";

export { SOURCE_GROUP_ENTRIES };

export const TEAM_GROUPS = [
  { key: "fire", label: "Fire" },
  { key: "andes", label: "Andes" },
  { key: "ka", label: "KA" },
  { key: "hcm", label: "HCM" }
];

const SOURCE_GROUP_ALIASES = SOURCE_GROUP_ALIAS_HINTS;

export function detectTeamEntities(question) {
  const foldedQuestion = String(question || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const matches = [];

  for (const team of TEAM_GROUPS) {
    if (foldedQuestion.includes(team.key) || foldedQuestion.includes(team.label.toLowerCase())) {
      if (!matches.some((entry) => entry.key === team.key)) {
        matches.push(team);
      }
    }
  }

  return matches;
}

function quoteSqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

export function buildSourceGroupCaseSql(columnName) {
  const clauses = SOURCE_GROUP_ENTRIES
    .filter(([, values]) => values.length > 0)
    .map(([groupLabel, values]) => {
      const list = values.map((value) => quoteSqlString(value)).join(", ");
      return `WHEN TRIM(COALESCE(${columnName}, '')) IN (${list}) THEN ${quoteSqlString(groupLabel)}`;
    });

  return [
    "CASE",
    ...clauses,
    "ELSE 'Other'",
    "END"
  ].join("\n");
}

export function buildTeamCaseSql(columnName) {
  return [
    "CASE",
    `WHEN LOWER(COALESCE(${columnName}, '')) LIKE '%fire%' THEN 'Fire'`,
    `WHEN LOWER(COALESCE(${columnName}, '')) LIKE '%andes%' THEN 'Andes'`,
    `WHEN LOWER(COALESCE(${columnName}, '')) LIKE '%kinh doanh hcm%' THEN 'HCM'`,
    `WHEN LOWER(COALESCE(${columnName}, '')) LIKE '%jega lite%' OR LOWER(COALESCE(${columnName}, '')) LIKE '%ka%' THEN 'KA'`,
    "ELSE 'Other'",
    "END"
  ].join("\n");
}

export function listSourceGroups() {
  return SOURCE_GROUP_ENTRIES.map(([groupLabel]) => groupLabel);
}

export function detectSourceGroupIntent(question) {
  const foldedQuestion = String(question || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const [groupLabel] of SOURCE_GROUP_ENTRIES) {
    const foldedGroup = groupLabel
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const explicitGroupPattern = new RegExp(`\\b(?:nhom|nguon|source|kenh)\\s+${foldedGroup.replace(/\s+/g, "\\s+")}\\b`);
    if (explicitGroupPattern.test(foldedQuestion)) {
      return {
        mode: "exact",
        group: groupLabel
      };
    }
  }

  for (const [groupLabel, aliases] of SOURCE_GROUP_ALIASES.entries()) {
    if (aliases.some((alias) => foldedQuestion.includes(alias))) {
      return {
        mode: "suggested",
        group: groupLabel
      };
    }
  }

  return null;
}
