import { createUsage } from "../contracts/chat-contracts.js";
import { foldText } from "../tooling/common.js";
import {
  callTextCompletion,
  getDefaultProvider,
  getSkillFormatterModel,
  getSkillFormatterTimeoutMs,
  hasConfiguredProviderKey,
  isSkillFormatterEnabled,
  usageFromMetadata
} from "./model-runtime.js";

function stringifySkillFacts(skillResult) {
  return JSON.stringify({
    skill_id: skillResult.skill_id,
    format_hint: skillResult.format_hint || null,
    summary_facts: skillResult.summary_facts || {},
    data: skillResult.data || null
  }, null, 2);
}

function buildFormatterUserMessage({ requestContext, skillResult }) {
  return [
    "Format this deterministic CRM skill result into the final user reply.",
    "Always answer in Vietnamese with full diacritics.",
    `View: ${requestContext.viewId}`,
    `Intent: ${requestContext.intent?.primary_intent || "unknown"}`,
    requestContext.selectedFilters
      ? `Selected filters: ${JSON.stringify(requestContext.selectedFilters, null, 2)}`
      : "",
    "Structured skill result:",
    stringifySkillFacts(skillResult)
  ].filter(Boolean).join("\n\n");
}

function shouldPreferDeterministicReply(skillResult) {
  return [
    "seller-month-revenue",
    "team-performance-summary",
    "top-sellers-period",
    "kpi-overview",
    "renew-due-summary",
    "operations-status-summary",
    "conversion-source-summary",
    "revenue-trend-analysis"
  ].includes(String(skillResult.skill_id || ""));
}

function shouldRejectFormatterReply(reply, skillResult, requestContext) {
  const normalizedReply = String(reply || "").trim();
  if (normalizedReply.length < 24) {
    return true;
  }
  if (/[a-zA-Z]/.test(normalizedReply) && !/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(normalizedReply)) {
    return true;
  }

  const deterministicFallback = String(skillResult.fallback_reply || skillResult.reply || "").trim();
  if (/\d/.test(deterministicFallback) && !/\d/.test(normalizedReply)) {
    return true;
  }

  const sellerName = String(skillResult.summary_facts?.seller_name || "").trim();
  if (sellerName && !foldText(normalizedReply).includes(foldText(sellerName))) {
    return true;
  }

  const latestQuestion = foldText(requestContext.latestQuestion || "");
  if (/(doanh thu|doanh so|bao nhieu)/.test(latestQuestion) && /\d/.test(deterministicFallback) && !/\d/.test(normalizedReply)) {
    return true;
  }

  return false;
}

function fallbackSkillReply(skillResult) {
  return skillResult.reply || skillResult.fallback_reply || "Không tìm thấy dữ liệu phù hợp trong skill này.";
}

export async function formatSkillResponse({
  requestContext,
  skillResult,
  promptRegistry,
  useSkillFormatter = true
}) {
  if (shouldPreferDeterministicReply(skillResult) || !useSkillFormatter || !isSkillFormatterEnabled() || !hasConfiguredProviderKey(getDefaultProvider())) {
    return {
      reply: fallbackSkillReply(skillResult),
      formatterSource: "template_fallback",
      usage: createUsage("skill")
    };
  }

  if (!skillResult.summary_facts && !skillResult.data) {
    return {
      reply: fallbackSkillReply(skillResult),
      formatterSource: "template_fallback",
      usage: createUsage("skill")
    };
  }

  try {
    const prompt = promptRegistry.buildSkillFormatterPrompt({
      viewId: requestContext.viewId,
      requestContext,
      skillResult
    });
    const completion = await callTextCompletion({
      messages: [{
        role: "user",
        content: buildFormatterUserMessage({
          requestContext,
          skillResult
        })
      }],
      prompt,
      model: getSkillFormatterModel(),
      provider: getDefaultProvider(),
      timeoutMs: getSkillFormatterTimeoutMs(),
      maxOutputTokens: 400
    });
    const reply = String(completion.text || "").trim();
    if (!reply || shouldRejectFormatterReply(reply, skillResult, requestContext)) {
      throw new Error("Empty formatter reply.");
    }
    return {
      reply,
      formatterSource: "llm_formatter",
      usage: usageFromMetadata("skill_formatter", completion.usageMetadata, getDefaultProvider())
    };
  } catch {
    return {
      reply: fallbackSkillReply(skillResult),
      formatterSource: "template_fallback",
      usage: createUsage("skill")
    };
  }
}
