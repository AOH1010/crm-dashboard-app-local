import { foldText } from "./common.js";
import {
  addMonthsToMonthKey,
  endOfMonthKey,
  formatMonthLabel,
  getSystemTodayDateKey,
  monthKey,
  resolveFilterPeriod,
  startOfMonthKey
} from "./date-utils.js";

const ROUTING_CUE_PATTERNS = [
  "cho toi",
  "toi muon",
  "hay",
  "truoc mat",
  "luc nay",
  "bay gio",
  "bao nhieu",
  "nao",
  "top",
  "xep hang",
  "tom tat",
  "tong hop",
  "overview",
  "so sanh",
  "dan dau",
  "kiem tra",
  "phan tich"
];

const ROUTING_DOMAIN_PATTERNS = {
  sales: /(doanh thu|doanh so|\bdt\b|revenue|seller|sale|nguoi ban|don hang|order)/,
  kpi: /(kpi|tong quan|tom tat|tong hop|overview)/,
  renew: /(renew|gia han|sap het han|den han|due)/,
  operations: /(operations|active|inactive|best|ghost|noise|value|hoat dong|category)/,
  conversion: /(conversion|chuyen doi|\bcr\b|khach moi|lead|nguon|source|kenh)/,
  team: /(team|nhom|doi|dept|phong ban)/
};

const MULTI_INTENT_CONNECTOR_PATTERN = /\b(va|dong thoi|kem theo|sau do|ngoai ra|con|cung luc)\b/;
const ROUTING_TAIL_PATTERN = /(?:nhung\s+)?(?:truoc\s+mat|luc\s+nay|bay\s+gio|cu\s+the|quan\s+trong\s+nhat)[,:]?\s*(.+)$/i;
const SELLER_ENTITY_BOUNDARY_PATTERN = /\b(?:thang|quy|nam|tu|trong|voi|la|bao nhieu|bao nhieu\?|ra sao|nhu the nao)\b/i;
const SELLER_ENTITY_STOPWORDS = new Set([
  "team",
  "nhom",
  "nguon",
  "tong",
  "tong quan",
  "kpi",
  "he thong",
  "toan he thong",
  "toan cong ty",
  "toan bo",
]);
const ENGLISH_MONTH_MAP = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12]
]);

function splitQuestionSegments(question) {
  return String(question || "")
    .split(/[\r\n]+|[.?!;:]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isRoutingRelevant(segment) {
  const foldedSegment = foldText(segment);
  if (ROUTING_CUE_PATTERNS.some((pattern) => foldedSegment.includes(pattern))) {
    return true;
  }
  return Object.values(ROUTING_DOMAIN_PATTERNS).some((pattern) => pattern.test(foldedSegment));
}

export function buildRoutingQuestion(question) {
  const rawQuestion = String(question || "").trim();
  if (!rawQuestion) {
    return "";
  }

  const routingTailMatch = rawQuestion.match(ROUTING_TAIL_PATTERN);
  if (routingTailMatch?.[1]) {
    return routingTailMatch[1].trim();
  }

  const segments = splitQuestionSegments(rawQuestion);
  if (rawQuestion.length <= 220 && segments.length <= 3) {
    return rawQuestion;
  }

  const routingSegments = [];
  for (const segment of segments) {
    if (isRoutingRelevant(segment)) {
      routingSegments.push(segment);
    }
  }

  for (const segment of segments.slice(-2)) {
    if (!routingSegments.some((item) => foldText(item) === foldText(segment))) {
      routingSegments.push(segment);
    }
  }

  if (routingSegments.length === 0) {
    return rawQuestion.slice(0, 360);
  }

  return routingSegments.slice(0, 3).join(". ");
}

export function extractExplicitYear(question) {
  const match = foldText(question).match(/\b(20\d{2})\b/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  return Number.isFinite(year) ? year : null;
}

export function extractExplicitSellerCandidate(question) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) {
    return null;
  }

  const sellerMatch = normalizedQuestion.match(
    /\b(?:doanh\s*(?:so|thu)|revenue|dt)\s+cua\s+(.+?)(?=\b(?:thang|quy|nam|tu|trong|voi|la|bao nhieu|ra sao|nhu the nao)\b|[?!.,;]|$)/i
  );
  if (!sellerMatch?.[1]) {
    return null;
  }

  const candidate = sellerMatch[1]
    .replace(/\s+/g, " ")
    .trim();
  const foldedCandidate = foldText(candidate);
  if (!candidate || foldedCandidate.length < 3) {
    return null;
  }
  if (SELLER_ENTITY_BOUNDARY_PATTERN.test(candidate)) {
    return null;
  }
  if ([...SELLER_ENTITY_STOPWORDS].some((word) => foldedCandidate === word || foldedCandidate.includes(`${word} `))) {
    return null;
  }

  return candidate;
}

export function analyzeQuestionComplexity(question) {
  const rawQuestion = String(question || "").trim();
  const foldedQuestion = foldText(rawQuestion);
  const segments = splitQuestionSegments(rawQuestion);
  const matchedDomains = Object.entries(ROUTING_DOMAIN_PATTERNS)
    .filter(([, pattern]) => pattern.test(foldedQuestion))
    .map(([domainId]) => domainId);
  const isLongPrompt = rawQuestion.length > 240 || segments.length >= 4;
  const isMultiIntent = matchedDomains.length >= 2
    && (MULTI_INTENT_CONNECTOR_PATTERN.test(foldedQuestion) || rawQuestion.length > 320 || segments.length >= 4);

  return {
    isLongPrompt,
    isMultiIntent,
    segmentCount: segments.length,
    matchedDomains,
    routingQuestion: buildRoutingQuestion(rawQuestion)
  };
}

export function extractMonthYear(question) {
  const normalized = foldText(question);
  const currentMonth = normalized.includes("thang nay") || normalized.includes("this month");
  const previousMonth = normalized.includes("thang truoc") || normalized.includes("last month") || normalized.includes("previous month");
  if (currentMonth || previousMonth) {
    return {
      relative: currentMonth ? "current_month" : "previous_month",
      month: null,
      year: null
    };
  }

  const monthMatch = normalized.match(/\b(?:thang\s*|t)(\d{1,2})\b/);
  if (monthMatch) {
    const month = Number.parseInt(monthMatch[1], 10);
    if (month >= 1 && month <= 12) {
      const yearMatch = normalized.match(/\b(20\d{2})\b/);
      return {
        relative: null,
        month,
        year: yearMatch ? Number.parseInt(yearMatch[1], 10) : null
      };
    }
  }

  const englishMonthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(20\d{2}))?/;
  const englishMatch = normalized.match(englishMonthPattern);
  if (englishMatch?.[1]) {
    const month = ENGLISH_MONTH_MAP.get(englishMatch[1]) || null;
    const year = englishMatch[2] ? Number.parseInt(englishMatch[2], 10) : null;
    if (month) {
      return {
        relative: null,
        month,
        year
      };
    }
  }
  return null;
}

export function resolveMonthlyWindow({ question, selectedFilters, latestMonthKey, latestYear }) {
  const explicit = extractMonthYear(question);
  if (explicit?.relative === "current_month") {
    const currentMonthKey = monthKey(getSystemTodayDateKey());
    return {
      month_key: currentMonthKey,
      label: formatMonthLabel(currentMonthKey),
      inferred_year: false
    };
  }

  if (explicit?.relative === "previous_month") {
    const previousMonthKey = addMonthsToMonthKey(monthKey(getSystemTodayDateKey()), -1);
    return {
      month_key: previousMonthKey,
      label: formatMonthLabel(previousMonthKey),
      inferred_year: false
    };
  }

  if (explicit?.month) {
    const year = explicit.year || latestYear;
    const monthKeyValue = `${year}-${String(explicit.month).padStart(2, "0")}`;
    return {
      month_key: monthKeyValue,
      label: formatMonthLabel(monthKeyValue),
      inferred_year: !explicit.year
    };
  }

  if (selectedFilters?.from && selectedFilters?.to) {
    const resolved = resolveFilterPeriod(selectedFilters, selectedFilters.from, selectedFilters.to);
    if (monthKey(resolved.from) === monthKey(resolved.to)) {
      return {
        month_key: monthKey(resolved.from),
        label: formatMonthLabel(monthKey(resolved.from)),
        inferred_year: false
      };
    }
  }

  return {
    month_key: latestMonthKey,
    label: formatMonthLabel(latestMonthKey),
    inferred_year: false
  };
}

export function resolveMonthlyWindowFromContext({
  question,
  context,
  selectedFilters,
  latestMonthKey,
  latestYear
}) {
  if (extractMonthYear(question)) {
    return resolveMonthlyWindow({
      question,
      selectedFilters,
      latestMonthKey,
      latestYear
    });
  }

  const intentTimeValue = typeof context?.intent?.time_window?.value === "string"
    ? context.intent.time_window.value
    : "";
  if (intentTimeValue && extractMonthYear(intentTimeValue)) {
    return resolveMonthlyWindow({
      question: intentTimeValue,
      selectedFilters,
      latestMonthKey,
      latestYear
    });
  }

  const historyMessages = Array.isArray(context?.normalizedMessages) && context.normalizedMessages.length > 0
    ? context.normalizedMessages
    : Array.isArray(context?.recentTurnsForIntent)
      ? context.recentTurnsForIntent
      : [];

  for (let index = historyMessages.length - 2; index >= 0; index -= 1) {
    const message = historyMessages[index];
    if (message?.role !== "user") {
      continue;
    }
    if (!extractMonthYear(message.content)) {
      continue;
    }
    return resolveMonthlyWindow({
      question: message.content,
      selectedFilters,
      latestMonthKey,
      latestYear
    });
  }

  return resolveMonthlyWindow({
    question,
    selectedFilters,
    latestMonthKey,
    latestYear
  });
}

export function resolveCurrentPeriod({ selectedFilters, latestDateKey }) {
  const todayKey = latestDateKey || getSystemTodayDateKey();
  const fallbackFrom = startOfMonthKey(todayKey);
  const fallbackTo = todayKey;
  return resolveFilterPeriod(selectedFilters, fallbackFrom, fallbackTo);
}

export function resolvePreviousPeriod(period) {
  const start = new Date(`${period.from}T00:00:00Z`);
  const end = new Date(`${period.to}T00:00:00Z`);
  const daySpan = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const previousEnd = new Date(start.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - ((daySpan - 1) * 86400000));
  return {
    from: previousStart.toISOString().slice(0, 10),
    to: previousEnd.toISOString().slice(0, 10)
  };
}

export function resolveMonthEndKey({ question, selectedFilters, latestDateKey }) {
  const latestMonthKey = monthKey(latestDateKey || getSystemTodayDateKey());
  const latestYear = Number.parseInt(latestMonthKey.slice(0, 4), 10);
  const resolved = resolveMonthlyWindow({
    question,
    selectedFilters,
    latestMonthKey,
    latestYear
  });
  return {
    ...resolved,
    month_end_key: endOfMonthKey(`${resolved.month_key}-01`)
  };
}

export function containsAny(question, patterns) {
  const normalized = foldText(question);
  return patterns.some((pattern) => normalized.includes(pattern));
}
