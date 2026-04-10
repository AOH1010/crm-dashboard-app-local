import fs from "node:fs";

const VIETNAMESE_DIACRITIC_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const COMMON_ASCII_VIETNAMESE_TOKENS = new Set([
  "doanh", "thu", "thang", "nam", "tong", "quan", "tom", "tat", "cho", "toi", "ban", "khong",
  "nguoi", "dung", "team", "sale", "lead", "tinh", "hinh", "chi", "tiet", "so", "lieu", "lai",
]);

function parseDelimitedField(line, field) {
  const prefix = `- \`${field}\`:`;
  if (!line.startsWith(prefix)) return "";
  return line.slice(prefix.length).trim();
}

function parseCases(rawCases) {
  return rawCases
    .split(",")
    .map((item) => item.replaceAll("`", "").trim())
    .filter(Boolean);
}

function parseKnowledgeEntries(markdown) {
  const lines = markdown.split(/\r?\n/);
  const entries = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(KH-\d+):\s+(.+)$/);
    if (headingMatch) {
      if (current) entries.push(current);
      current = {
        id: headingMatch[1],
        title: headingMatch[2].trim(),
        cases: [],
        symptom: "",
        trueRootCause: "",
        fixApplied: "",
        ruleLearned: "",
        appliesTo: "",
      };
      continue;
    }

    if (!current) continue;

    const casesValue = parseDelimitedField(line, "Cases");
    if (casesValue) {
      current.cases = parseCases(casesValue);
      continue;
    }

    const symptomValue = parseDelimitedField(line, "Symptom");
    if (symptomValue) {
      current.symptom = symptomValue;
      continue;
    }

    const rootCauseValue = parseDelimitedField(line, "True root cause");
    if (rootCauseValue) {
      current.trueRootCause = rootCauseValue;
      continue;
    }

    const fixValue = parseDelimitedField(line, "Fix applied");
    if (fixValue) {
      current.fixApplied = fixValue;
      continue;
    }

    const ruleValue = parseDelimitedField(line, "Rule learned");
    if (ruleValue) {
      current.ruleLearned = ruleValue;
      continue;
    }

    const appliesToValue = parseDelimitedField(line, "Applies to");
    if (appliesToValue) {
      current.appliesTo = appliesToValue;
    }
  }

  if (current) entries.push(current);
  return entries;
}

function buildKnowledgeIndex(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return {
    all: entries,
    get(id) {
      return byId.get(id) || null;
    },
  };
}

function containsVietnameseDiacritics(text) {
  return VIETNAMESE_DIACRITIC_REGEX.test(text || "");
}

function isLikelyAsciiVietnamese(text) {
  if (!text || containsVietnameseDiacritics(text)) return false;
  const normalizedTokens = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (normalizedTokens.length < 4) return false;
  let score = 0;
  for (const token of normalizedTokens) {
    if (COMMON_ASCII_VIETNAMESE_TOKENS.has(token)) score += 1;
  }
  return score >= 2;
}

function summarizeChecks(scenario, response) {
  const allowedRoutes = Array.isArray(scenario?.allowedRoutes) && scenario.allowedRoutes.length > 0
    ? scenario.allowedRoutes
    : [scenario?.expectedRoute].filter(Boolean);
  const expectedIntent = scenario?.normalizedExpectedIntent || scenario?.expectedIntent || "unknown";
  const actualRoute = response?.route || "";
  const actualIntent = response?.intent?.primary_intent || "unknown";
  const routePass = allowedRoutes.includes(actualRoute);
  const intentPass = actualIntent === expectedIntent;
  const clarifyPass = scenario?.expectedClarify === undefined
    ? true
    : Boolean(response?.clarification_question) === scenario.expectedClarify;

  return {
    expected_route: scenario?.expectedRoute || "",
    expected_intent: expectedIntent,
    expected_skill_id: scenario?.expectedSkillId || "",
    expected_clarify: scenario?.expectedClarify ?? null,
    actual_route: actualRoute,
    actual_intent: actualIntent,
    actual_skill_id: response?.skill_id || "",
    actual_clarification: response?.clarification_question || "",
    route_pass: routePass,
    intent_pass: intentPass,
    clarify_pass: clarifyPass,
  };
}

function matchKnowledgeEntries(knowledgeIndex, scenario, issueType) {
  const matched = [];
  const seen = new Set();
  const caseId = String(scenario?.id || "").trim();
  const casePrefix = caseId.split("-")[0];
  const latestUserMessage = scenario?.messages?.filter((message) => message.role === "user").at(-1)?.content?.toLowerCase() || "";

  const pushById = (id) => {
    if (!id || seen.has(id)) return;
    const entry = knowledgeIndex.get(id);
    if (!entry) return;
    seen.add(id);
    matched.push(entry);
  };

  for (const entry of knowledgeIndex.all) {
    if (entry.cases.includes(caseId) || entry.cases.includes(casePrefix)) {
      pushById(entry.id);
    }
  }

  if (issueType === "manual_review") pushById("KH-001");
  if (issueType === "formatter_language") pushById("KH-015");
  if (issueType === "clarify" && latestUserMessage.includes("tom tat")) pushById("KH-010");
  if (issueType === "clarify" && latestUserMessage.includes("doanh thu")) pushById("KH-012");
  if (issueType === "route" && latestUserMessage.includes("tinh hinh")) pushById("KH-004");
  if (scenario?.messages?.length > 1) pushById("KH-005");
  if ((scenario?.normalizedExpectedIntent || scenario?.expectedIntent) === "team_revenue_summary" && scenario?.messages?.length > 1) pushById("KH-013");
  if ((scenario?.normalizedExpectedIntent || scenario?.expectedIntent) === "operations_summary") pushById("KH-014");
  if ((scenario?.normalizedExpectedIntent || scenario?.expectedIntent) === "custom_analytical_query") pushById("KH-011");

  return matched.slice(0, 4);
}

function buildEvaluationFromChecks({ scenario, result, checks, knowledgeIndex }) {
  const response = result?.response || null;
  const reply = result?.error || response?.reply || "";
  const requiresManualReview = Boolean(scenario?.manualReview) || (scenario?.reviewFocus || []).length > 0;
  let status = "pass";
  let layer = "route";
  let summary = "Không thấy tín hiệu fail ở route, intent và clarify.";
  let recommendation = "Có thể giữ kết quả này nếu câu trả lời cuối không sai số liệu và không lệch ngữ cảnh.";
  let issueType = requiresManualReview ? "manual_review" : "pass";

  if (result?.error) {
    status = "fail";
    layer = "unknown";
    issueType = "runtime_error";
    summary = "Runtime đang trả lỗi thay vì trả kết quả testcase.";
    recommendation = "Kiểm tra lỗi backend hoặc model call trước khi review route, intent hay formatter.";
  } else if (!checks.route_pass) {
    status = "fail";
    layer = "route";
    issueType = "route";
    summary = `Luồng đang lệch. Kỳ vọng ${checks.expected_route || "-"} nhưng runtime trả ${checks.actual_route || "-"}.`;
    recommendation = "Ưu tiên soi classifier và router trước, chưa nên sửa formatter hay manual wording.";
  } else if (!checks.intent_pass) {
    status = "fail";
    layer = "intent";
    issueType = "intent";
    summary = `Intent đang lệch. Kỳ vọng ${checks.expected_intent || "-"} nhưng runtime hiểu ${checks.actual_intent || "-"}.`;
    recommendation = "Kiểm tra intent classifier, entity/time carry-over và normalization giữa dataset với runtime.";
  } else if (!checks.clarify_pass) {
    status = "fail";
    layer = "clarify";
    issueType = "clarify";
    summary = "Hành vi hỏi lại chưa đúng với kỳ vọng của testcase.";
    recommendation = "Xem lại ambiguity rule: prompt này đang bị hỏi lại thừa hoặc thiếu câu clarification cần có.";
  } else if (isLikelyAsciiVietnamese(reply)) {
    status = "fail";
    layer = "formatter";
    issueType = "formatter_language";
    summary = "Câu trả lời cuối đang là tiếng Việt không dấu nên chưa đạt chuẩn Chat Lab.";
    recommendation = "Ưu tiên kiểm tra formatter prompt, deterministic reply và fallback copy để ép tiếng Việt có dấu.";
  } else if (requiresManualReview) {
    status = "needs_review";
    layer = "grounding";
    issueType = "manual_review";
    summary = "Route và intent cơ bản ổn, nhưng case này vẫn cần reviewer xác nhận grounding hoặc business wording.";
    recommendation = "Đối chiếu SQL, số liệu cuối và ngôn ngữ trả lời trước khi chốt pass.";
  }

  const matchedEntries = matchKnowledgeEntries(knowledgeIndex, scenario, issueType);

  return {
    scenario_id: scenario?.id || result?.scenarioId || "",
    status,
    layer,
    summary,
    recommendation,
    should_review_manually: status !== "pass" || requiresManualReview,
    generated_at: new Date().toISOString(),
    knowledge_source: "docs/eval/chat-lab-know-how.md",
    matched_know_how: matchedEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      rule_learned: entry.ruleLearned,
    })),
    checks,
  };
}

export function evaluateChatLabResults({ items, knowHowPath }) {
  const markdown = fs.readFileSync(knowHowPath, "utf8");
  const knowledgeIndex = buildKnowledgeIndex(parseKnowledgeEntries(markdown));

  return items.map((item) => {
    const scenario = item?.scenario || null;
    const result = item?.result || null;
    const checks = summarizeChecks(scenario, result?.response || null);
    return buildEvaluationFromChecks({
      scenario,
      result,
      checks,
      knowledgeIndex,
    });
  });
}
