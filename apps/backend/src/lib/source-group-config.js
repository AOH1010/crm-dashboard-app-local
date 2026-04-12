export const SOURCE_GROUP_ORDER = ["Marketing Ads", "Marketing Other", "Event", "Affiliate", "Sale", "Other"];

export const SOURCE_GROUP_ENTRIES = [
  ["Marketing Ads", [
    "Facebook_1",
    "Facebook_loại 1",
    "Website",
    "Hotline",
  ]],
  ["Marketing Other", [
    "Zalo",
    "Facebook_2",
    "Facebook_loại 2",
    "Phễu Marketing > Scan Google Map",
    "Phễu MKT - Scan Google map",
    "Phễu Marketing > Marketing Ucall",
    "Phễu MKT - Marketing Ucall",
    "Zalo > Simple Zalo",
    "Giới thiệu _ Panex",
    "Panex_Facebook",
    "Tiktok",
    "Simple Zalo, Zalo ZNS",
    "Livestream",
  ]],
  ["Event", [
    "Vietbuild",
    "Event",
    "Events",
  ]],
  ["Affiliate", [
    "Affiliate - JEGA",
    "AFFILIATE - JEGA",
    "AFFILIATE - JEGA > AFF-Marketing",
    "AFFILIATE - JEGA > AFF-Sales",
    "Aff-Sales",
    "Đối tác",
    "Giới thiệu - Panex",
  ]],
  ["Sale", [
    "Sale tự kiếm",
    "Sales tự kiếm",
    "Đi thị trường",
    "Mã số thuế + Thông tin Doanh nghiệp",
    "Mã số thuế + Thông tin Doanh nghiệp",
    "Sale Chạy Ads Face, GG, Tiktok",
    "Sales chạy Ads Face, GG, Tiktok",
    "Google map",
    "Chat GPT",
    "ChatGPT",
  ]],
  ["Other", [
    "Aihouse",
    "Phễu Marketing > Lead mua",
    "Phễu MKT - Lead mua",
    "Email nội bộ Jega",
    "Email nội bộ JEGA",
    "Lớp học AI nội thất",
    "Lớp học AI ngành Gạch",
    "https://jega.getflycrm.com",
  ]],
];

export const SOURCE_GROUP_ALIAS_HINTS = new Map([
  ["Marketing Ads", [
    "marketing ads",
    "ads",
    "quang cao",
    "facebook 1",
    "facebook_1",
    "website",
    "hotline",
  ]],
  ["Marketing Other", [
    "marketing other",
    "marketing khac",
    "zalo",
    "facebook 2",
    "facebook_2",
    "facebook loai 2",
    "ucall",
    "livestream",
    "panex_facebook",
    "panex facebook",
  ]],
  ["Event", [
    "event",
    "su kien",
    "vietbuild",
  ]],
  ["Affiliate", [
    "affiliate",
    "aff-sales",
    "doi tac",
  ]],
  ["Sale", [
    "sale",
    "sales",
    "tele sale",
    "telesale",
    "outbound",
    "sales tu kiem",
    "sale tu kiem",
    "di thi truong",
    "chatgpt",
    "chat gpt",
  ]],
  ["Other", [
    "other",
    "khac",
    "lead mua",
    "email noi bo",
  ]],
]);

export const SOURCE_GROUP_CONFIG_VERSION = "2026-04-12-source-map-v2";

export function foldSourceText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getSourceGroupExactMap() {
  return new Map(
    SOURCE_GROUP_ENTRIES.flatMap(([groupName, values]) => (
      values.map((value) => [foldSourceText(value), groupName])
    )),
  );
}

export function classifySourceGroupExact(sourceName) {
  const exactMap = getSourceGroupExactMap();
  return exactMap.get(foldSourceText(sourceName)) || null;
}

export function suggestSourceGroup(sourceName) {
  const foldedSource = foldSourceText(sourceName);
  for (const [groupName, aliases] of SOURCE_GROUP_ALIAS_HINTS.entries()) {
    if (aliases.some((alias) => foldedSource.includes(foldSourceText(alias)))) {
      return groupName;
    }
  }
  return null;
}

export function classifySourceGroup(sourceName) {
  const exactGroup = classifySourceGroupExact(sourceName);
  if (exactGroup) {
    return {
      mode: "exact",
      group: exactGroup,
    };
  }

  const suggestedGroup = suggestSourceGroup(sourceName);
  if (suggestedGroup) {
    return {
      mode: "suggested",
      group: suggestedGroup,
    };
  }

  return {
    mode: "unmapped",
    group: null,
  };
}
