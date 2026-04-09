export const SOURCE_GROUP_ENTRIES = [
  ["Marketing Ads", [
    "Facebook_loại 1",
    "Website",
    "Zalo",
    "Hotline"
  ]],
  ["Marketing Other", [
    "Facebook_loại 2",
    "Phễu Marketing > Lead mua",
    "Phễu Marketing > Scan Google Map",
    "Phễu Marketing > Marketing Ucall",
    "Panex_facebook",
    "Tiktok",
    "Zalo > Simple Zalo",
    "Chat GPT",
    "GG",
    "https://jega.getflycrm.com",
    "Livestream"
  ]],
  ["Event", [
    "Vietbuild",
    "Events"
  ]],
  ["Affiliate", [
    "AFFILIATE - JEGA",
    "AFFILIATE - JEGA > AFF-Marketing",
    "AFFILIATE - JEGA > AFF-Sales",
    "Giới thiệu - Panex",
    "Đối tác"
  ]],
  ["Sale", [
    "Sale tự kiếm",
    "Đi Thị Trường",
    "Mã Số Thuế + Thông Tin Doanh Nghiệp",
    "Sale Chạy Ads Face, GG, Tiktok"
  ]],
  ["Other", [
    "Aihouse",
    "Email nội bộ Jega",
    "Lớp học Ai Nội Thất",
    "Lớp học Ai ngành Gạch"
  ]]
];

export const TEAM_GROUPS = [
  { key: "fire", label: "Fire" },
  { key: "andes", label: "Andes" },
  { key: "ka", label: "KA" },
  { key: "hcm", label: "HCM" }
];

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
