import { createUsage } from "../contracts/chat-contracts.js";
import {
  callTextCompletion,
  getDefaultProvider,
  getSkillFormatterModel,
  getSkillFormatterTimeoutMs,
  hasConfiguredProviderKey,
  isSkillFormatterEnabled
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
    `View: ${requestContext.viewId}`,
    `Intent: ${requestContext.intent?.primary_intent || "unknown"}`,
    requestContext.selectedFilters
      ? `Selected filters: ${JSON.stringify(requestContext.selectedFilters, null, 2)}`
      : "",
    "Structured skill result:",
    stringifySkillFacts(skillResult)
  ].filter(Boolean).join("\n\n");
}

export async function formatSkillResponse({
  requestContext,
  skillResult,
  promptRegistry,
  useSkillFormatter = true
}) {
  if (!useSkillFormatter || !isSkillFormatterEnabled() || !hasConfiguredProviderKey(getDefaultProvider())) {
    return {
      reply: skillResult.reply || skillResult.fallback_reply || "Khong tim thay du lieu phu hop trong skill nay.",
      formatterSource: "template_fallback",
      usage: createUsage("skill")
    };
  }

  if (!skillResult.summary_facts && !skillResult.data) {
    return {
      reply: skillResult.reply || skillResult.fallback_reply || "Khong tim thay du lieu phu hop trong skill nay.",
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
    if (!reply) {
      throw new Error("Empty formatter reply.");
    }
    return {
      reply,
      formatterSource: "llm_formatter",
      usage: createUsage("skill_formatter")
    };
  } catch {
    return {
      reply: skillResult.reply || skillResult.fallback_reply || "Khong tim thay du lieu phu hop trong skill nay.",
      formatterSource: "template_fallback",
      usage: createUsage("skill")
    };
  }
}
