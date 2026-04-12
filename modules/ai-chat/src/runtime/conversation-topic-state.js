import { foldText } from "../tooling/common.js";
import { extractMonthYear } from "../tooling/question-analysis.js";
import { findFollowUpAnchor } from "./intent-classifier-v2.js";

const FOLLOW_UP_PATCH_PATTERN = /^(con|the|thang|quy|nam|so voi|thi sao|ra sao|con ben)\b|(\bthi sao\b|\bra sao\b|\bso voi\b)/i;
const DRILLDOWN_PATTERN = /(phan tich them|chi tiet hon|dao sau|them ve|noi ro hon|lam ro hon)/i;

function wantsRevenueFocus(foldedQuestion) {
  return /(doanh thu|doanh so|\bdt\b|revenue)/.test(foldedQuestion)
    && !/(khong phai doanh thu|khong hoi doanh thu|khong can doanh thu|chi hoi lead|chi hoi nguon|lead khong phai doanh thu)/.test(foldedQuestion);
}

function extractFocuses(question, intent) {
  const foldedQuestion = foldText(question);
  const focuses = [];

  if (wantsRevenueFocus(foldedQuestion)) focuses.push("revenue");
  if (/(lead moi|\blead\b)/.test(foldedQuestion)) focuses.push("leads");
  if (/(khach moi|khach hang moi|customer moi)/.test(foldedQuestion)) focuses.push("customers");
  if (/(chuyen doi|conversion|\bcr\b)/.test(foldedQuestion)) focuses.push("conversion");
  if (/(don hang|so don|\border\b)/.test(foldedQuestion)) focuses.push("orders");
  if (/(seller|sale|nguoi ban|nhan vien)/.test(foldedQuestion)) focuses.push("sellers");
  if (/(team|nhom|doi|phong ban)/.test(foldedQuestion)) focuses.push("teams");
  if (/(nguon|source|kenh)/.test(foldedQuestion)) focuses.push("sources");
  if (/(kpi|tong quan|overview|tom tat)/.test(foldedQuestion)) focuses.push("overview");

  if (focuses.length === 0 && intent?.metric && intent.metric !== "unknown") {
    focuses.push(intent.metric);
  }
  if (focuses.length === 0) {
    focuses.push("summary");
  }

  return Array.from(new Set(focuses));
}

function summarizeTimeReference(intent, latestQuestion) {
  const explicit = extractMonthYear(latestQuestion);
  if (explicit?.month) {
    return explicit.year
      ? `${String(explicit.month).padStart(2, "0")}/${explicit.year}`
      : `month:${String(explicit.month).padStart(2, "0")}`;
  }
  if (explicit?.relative) {
    return explicit.relative;
  }

  const value = String(intent?.time_window?.value || "").trim();
  if (!value) {
    return null;
  }
  const valueMonth = extractMonthYear(value);
  if (valueMonth?.month) {
    return valueMonth.year
      ? `${String(valueMonth.month).padStart(2, "0")}/${valueMonth.year}`
      : `month:${String(valueMonth.month).padStart(2, "0")}`;
  }
  if (valueMonth?.relative) {
    return valueMonth.relative;
  }
  return value;
}

function computePatchedFields({ currentIntent, anchorIntent, focuses }) {
  if (!anchorIntent) {
    return [];
  }

  const patchedFields = [];
  const currentEntities = (currentIntent?.entities || []).map((entity) => `${entity.type}:${entity.value}`);
  const anchorEntities = (anchorIntent?.entities || []).map((entity) => `${entity.type}:${entity.value}`);
  if (currentEntities.join("|") !== anchorEntities.join("|")) {
    patchedFields.push("entities");
  }

  const currentTime = String(currentIntent?.time_window?.value || "");
  const anchorTime = String(anchorIntent?.time_window?.value || "");
  if (currentTime && currentTime !== anchorTime) {
    patchedFields.push("time_window");
  }

  const anchorFocuses = [
    anchorIntent?.metric && anchorIntent.metric !== "unknown" ? anchorIntent.metric : null,
    anchorIntent?.dimension && anchorIntent.dimension !== "unknown" ? anchorIntent.dimension : null
  ].filter(Boolean);
  if (focuses.join("|") !== anchorFocuses.join("|")) {
    patchedFields.push("focus");
  }

  return patchedFields;
}

function deriveContinuityMode({ hasPreviousUserTurn, intent, anchorIntent, latestQuestion, patchedFields }) {
  const foldedQuestion = foldText(latestQuestion || "");
  if (!hasPreviousUserTurn) {
    return "new_topic";
  }
  if (intent?.primary_intent === "out_of_domain_request") {
    return "topic_reset";
  }
  if (FOLLOW_UP_PATCH_PATTERN.test(foldedQuestion) || DRILLDOWN_PATTERN.test(foldedQuestion)) {
    return patchedFields.length > 0 ? "follow_up_patch" : "continued_topic";
  }
  if (anchorIntent && intent?.primary_intent && intent.primary_intent === anchorIntent.primary_intent) {
    return patchedFields.length > 0 ? "follow_up_patch" : "continued_topic";
  }
  return "new_topic";
}

function buildTopicLabel({ intent, entities, timeReference, focuses }) {
  const entityLabel = entities.length > 0 ? entities.map((entity) => entity.value).join(", ") : "general";
  const timeLabel = timeReference || "open_time";
  return `${intent?.primary_intent || "unknown"} | ${entityLabel} | ${timeLabel} | ${focuses.join("+")}`;
}

export function buildConversationTopicState({ context, resolvedRoute, skillMatch }) {
  const historyMessages = Array.isArray(context.fullConversationMessages) && context.fullConversationMessages.length > 0
    ? context.fullConversationMessages
    : context.normalizedMessages || [];
  const userMessages = historyMessages.filter((message) => message.role === "user");
  const anchor = userMessages.length > 1
    ? findFollowUpAnchor({
      ...context,
      recentTurnsForIntent: historyMessages,
      fullConversationMessages: historyMessages
    })
    : null;

  const currentIntent = context.intent || null;
  const anchorIntent = anchor?.intent || null;
  const focuses = extractFocuses(context.latestQuestion, currentIntent);
  const entities = (currentIntent?.entities || []).map((entity) => ({
    type: entity.type,
    value: entity.value
  }));
  const timeReference = summarizeTimeReference(currentIntent, context.latestQuestion);
  const patchedFields = computePatchedFields({
    currentIntent,
    anchorIntent,
    focuses
  });
  const continuityMode = deriveContinuityMode({
    hasPreviousUserTurn: userMessages.length > 1,
    intent: currentIntent,
    anchorIntent,
    latestQuestion: context.latestQuestion || "",
    patchedFields
  });

  const topicId = [
    currentIntent?.primary_intent || resolvedRoute || "unknown",
    entities.map((entity) => `${entity.type}:${foldText(entity.value)}`).join("|") || "general",
    foldText(timeReference || "open_time"),
    focuses.join("+")
  ].join("::");

  return {
    active_topic_id: topicId,
    label: buildTopicLabel({
      intent: currentIntent,
      entities,
      timeReference,
      focuses
    }),
    continuity_mode: continuityMode,
    primary_intent: currentIntent?.primary_intent || "unknown",
    route: resolvedRoute,
    skill_id: skillMatch.skill?.id || null,
    focuses,
    entities,
    time_reference: timeReference,
    patched_fields: patchedFields,
    user_turn_count: userMessages.length,
    anchor_question: anchor?.message?.content || null,
    anchor_intent: anchorIntent?.primary_intent || null,
    state_confidence: currentIntent?.confidence ?? context.intentConfidence ?? null
  };
}
