import {
  DEFAULT_USE_INTENT_CLASSIFIER,
  DEFAULT_USE_SKILL_FORMATTER,
  DEFAULT_VIEW_ID,
  MAX_INTENT_TURNS,
  ROUTE_CLARIFY_REQUIRED,
  ROUTE_LLM_FALLBACK,
  ROUTE_VALIDATION
} from "../contracts/chat-contracts.js";
import { buildTelemetryResponse } from "../telemetry/chat-telemetry.js";
import { createTraceContext } from "../telemetry/trace-context.js";
import { normalizeMessages } from "../tooling/messages.js";
import { foldText } from "../tooling/common.js";
import { analyzeQuestionComplexity } from "../tooling/question-analysis.js";
import { SQLiteConnector } from "../connectors/sqlite-connector.js";
import { PromptRegistry } from "./prompt-registry.js";
import { SkillRegistry } from "./skill-registry.js";
import {
  createClarifyRouteDecision,
  createFallbackRouteDecision,
  createSkillRouteDecision
} from "./route-decision.js";
import { runFallbackLlm } from "./fallback-llm.js";
import { classifyIntent, resolveRouteFromIntent } from "./intent-classifier.js";
import { formatSkillResponse } from "./skill-response-formatter.js";

function createTimeline() {
  return [];
}

function pushTimeline(timeline, step, detail = {}) {
  timeline.push({
    step,
    at: new Date().toISOString(),
    ...detail
  });
}

function mergeUsage(primaryUsage, secondaryUsage) {
  if (!secondaryUsage) {
    return primaryUsage;
  }
  if (!primaryUsage) {
    return secondaryUsage;
  }
  return {
    provider: secondaryUsage.provider || primaryUsage.provider,
    prompt_tokens: Number(primaryUsage.prompt_tokens || 0) + Number(secondaryUsage.prompt_tokens || 0),
    completion_tokens: Number(primaryUsage.completion_tokens || 0) + Number(secondaryUsage.completion_tokens || 0),
    total_tokens: Number(primaryUsage.total_tokens || 0) + Number(secondaryUsage.total_tokens || 0),
    thoughts_tokens: Number(primaryUsage.thoughts_tokens || 0) + Number(secondaryUsage.thoughts_tokens || 0),
    tool_use_prompt_tokens: Number(primaryUsage.tool_use_prompt_tokens || 0) + Number(secondaryUsage.tool_use_prompt_tokens || 0)
  };
}

function buildRecentTurnsForIntent(normalizedMessages) {
  return normalizedMessages.slice(-MAX_INTENT_TURNS);
}

function buildRequestContext({
  normalizedMessages,
  viewId,
  selectedFilters,
  sessionId,
  debug,
  connector,
  promptRegistry,
  traceContext,
  timeline
}) {
  const latestMessage = normalizedMessages[normalizedMessages.length - 1];
  const latestQuestion = latestMessage?.content || "";
  const questionAnalysis = analyzeQuestionComplexity(latestQuestion);
  const routingQuestion = questionAnalysis.routingQuestion || latestQuestion;
  const recentTurnsForIntent = buildRecentTurnsForIntent(normalizedMessages);
  pushTimeline(timeline, "build_request_context", {
    view_id: viewId,
    message_count: normalizedMessages.length,
    recent_turn_count: recentTurnsForIntent.length
  });
  return {
    normalizedMessages,
    latestMessage,
    latestUserMessage: latestMessage,
    latestQuestion,
    foldedQuestion: foldText(latestQuestion),
    routingQuestion,
    routingFoldedQuestion: foldText(routingQuestion),
    questionAnalysis,
    legacyQuestionAnalysis: questionAnalysis,
    recentTurnsForIntent,
    viewId,
    selectedFilters: selectedFilters || null,
    sessionId: sessionId || null,
    debug: Boolean(debug),
    connector,
    promptRegistry,
    traceContext,
    intent: null,
    intentSource: null,
    intentConfidence: null,
    ambiguityFlag: false,
    clarificationQuestion: null
  };
}

const skillRegistry = new SkillRegistry();

function buildValidationResponse({ traceContext, promptRegistry, reply, timeline }) {
  return buildTelemetryResponse({
    traceContext,
    route: ROUTE_VALIDATION,
    promptVersion: promptRegistry.getPromptVersion(),
    usage: null,
    sqlLogs: [],
    confidence: 1,
    reply,
    debugTimeline: timeline
  });
}

function applyIntentResult(context, intentResult, timeline) {
  context.intent = intentResult.intent;
  context.intentSource = intentResult.source;
  context.intentConfidence = intentResult.intent.confidence;
  context.ambiguityFlag = intentResult.intent.ambiguity_flag;
  context.clarificationQuestion = intentResult.intent.clarification_question || null;
  pushTimeline(timeline, "intent_classifier", {
    source: context.intentSource,
    primary_intent: context.intent.primary_intent,
    confidence: context.intentConfidence,
    ambiguity_flag: context.ambiguityFlag,
    debug_reason: intentResult.debugReason || null
  });
  return intentResult;
}

function buildClarificationReply(context) {
  return context.clarificationQuestion
    || "Bạn có thể nói rõ hơn yêu cầu hiện tại để tôi route đúng phần dữ liệu cần xem không?";
}

function buildCompoundSkillReply(compoundResults) {
  const firstParagraphs = compoundResults
    .map(({ skill, result }) => {
      const firstBlock = String(result.reply || "")
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .find(Boolean);
      return firstBlock ? `- ${skill.name || skill.id}: ${firstBlock}` : null;
    })
    .filter(Boolean);

  return [
    "Tôi tách câu hỏi thành các phần rõ ràng và trả lời lần lượt:",
    ...firstParagraphs
  ].join("\n");
}

export async function chatWithCrmAgent({
  messages,
  viewId = DEFAULT_VIEW_ID,
  selectedFilters = null,
  sessionId = null,
  debug = false,
  useIntentClassifier = DEFAULT_USE_INTENT_CLASSIFIER,
  useSkillFormatter = DEFAULT_USE_SKILL_FORMATTER
}) {
  const traceContext = createTraceContext();
  const timeline = createTimeline();
  const connector = new SQLiteConnector();
  const promptRegistry = new PromptRegistry(connector);
  const normalizedMessages = normalizeMessages(messages);
  pushTimeline(timeline, "normalize_messages", {
    message_count: normalizedMessages.length
  });

  if (normalizedMessages.length === 0) {
    return buildValidationResponse({
      traceContext,
      promptRegistry,
      reply: "Vui lòng gửi câu hỏi về dữ liệu CRM.",
      timeline
    });
  }

  const latestMessage = normalizedMessages[normalizedMessages.length - 1];
  if (latestMessage.role !== "user") {
    return buildValidationResponse({
      traceContext,
      promptRegistry,
      reply: "Vui lòng gửi câu hỏi mới từ người dùng.",
      timeline
    });
  }

  const context = buildRequestContext({
    normalizedMessages,
    viewId,
    selectedFilters,
    sessionId,
    debug,
    connector,
    promptRegistry,
    traceContext,
    timeline
  });

  const intentResult = applyIntentResult(
    context,
    await classifyIntent({
      context,
      promptRegistry,
      useIntentClassifier
    }),
    timeline
  );

  const skillMatch = skillRegistry.findMatch(context);
  const resolvedRoute = resolveRouteFromIntent(context.intent);
  pushTimeline(timeline, "intent_router", {
    resolved_route: resolvedRoute,
    skill_id: skillMatch.skill?.id || null,
    matched_skill_candidates: skillMatch.matchedSkillCandidates,
    route_reason: skillMatch.routeReason
  });

  if (resolvedRoute === ROUTE_CLARIFY_REQUIRED) {
    const routeDecision = createClarifyRouteDecision(context.intentConfidence || 0.7);
    pushTimeline(timeline, "clarify_required", {
      clarification_question: buildClarificationReply(context)
    });
    return buildTelemetryResponse({
      traceContext,
      route: routeDecision.route,
      skillId: routeDecision.skillId,
      confidence: routeDecision.confidence,
      promptVersion: promptRegistry.getPromptVersion(),
      usage: intentResult.usage,
      sqlLogs: [],
      reply: buildClarificationReply(context),
      intent: context.intent,
      intentSource: context.intentSource,
      intentConfidence: context.intentConfidence,
      ambiguityFlag: context.ambiguityFlag,
      clarificationQuestion: context.clarificationQuestion,
      matchedSkillCandidates: skillMatch.matchedSkillCandidates,
      fallbackReason: skillMatch.routeReason,
      formatterSource: null,
      debugTimeline: timeline
    });
  }

  if (resolvedRoute === "skill" && skillMatch.skill) {
    pushTimeline(timeline, "skill_execute", {
      skill_id: skillMatch.skill.id
    });
    const rawSkillResult = skillMatch.skill.handler.run(context, connector);
    if (rawSkillResult) {
      const formattedResult = await formatSkillResponse({
        requestContext: context,
        skillResult: {
          ...skillMatch.skill.handler.formatResponse(rawSkillResult),
          skill_id: skillMatch.skill.id
        },
        promptRegistry,
        useSkillFormatter
      });
      pushTimeline(timeline, "skill_formatter", {
        formatter_source: formattedResult.formatterSource
      });
      const routeDecision = createSkillRouteDecision(skillMatch.skill, context.intentConfidence || 0.98);
      return buildTelemetryResponse({
        traceContext,
        route: routeDecision.route,
        skillId: routeDecision.skillId,
        confidence: routeDecision.confidence,
        promptVersion: promptRegistry.getPromptVersion(),
        usage: mergeUsage(rawSkillResult.usage, formattedResult.usage),
        sqlLogs: rawSkillResult.sqlLogs,
        reply: formattedResult.reply,
        intent: context.intent,
        intentSource: context.intentSource,
        intentConfidence: context.intentConfidence,
        ambiguityFlag: context.ambiguityFlag,
        clarificationQuestion: context.clarificationQuestion,
        matchedSkillCandidates: skillMatch.matchedSkillCandidates,
        fallbackReason: null,
        formatterSource: formattedResult.formatterSource,
        debugTimeline: timeline
      });
    }

    if (context.clarificationQuestion) {
      const routeDecision = createClarifyRouteDecision(context.intentConfidence || 0.7);
      pushTimeline(timeline, "clarify_required", {
        clarification_question: buildClarificationReply(context),
        reason: "skill_returned_null"
      });
      return buildTelemetryResponse({
        traceContext,
        route: routeDecision.route,
        skillId: routeDecision.skillId,
        confidence: routeDecision.confidence,
        promptVersion: promptRegistry.getPromptVersion(),
        usage: intentResult.usage,
        sqlLogs: [],
        reply: buildClarificationReply(context),
        intent: context.intent,
        intentSource: context.intentSource,
        intentConfidence: context.intentConfidence,
        ambiguityFlag: context.ambiguityFlag,
        clarificationQuestion: context.clarificationQuestion,
        matchedSkillCandidates: skillMatch.matchedSkillCandidates,
        fallbackReason: "skill_returned_null",
        formatterSource: null,
        debugTimeline: timeline
      });
    }
  }

  if (resolvedRoute === ROUTE_LLM_FALLBACK && Array.isArray(skillMatch.compoundSkills) && skillMatch.compoundSkills.length >= 2) {
    pushTimeline(timeline, "compound_skill_execute", {
      skill_ids: skillMatch.compoundSkills.map((skill) => skill.id)
    });
    const compoundResults = skillMatch.compoundSkills
      .slice(0, 2)
      .map((skill) => ({
        skill,
        result: skill.handler.run(context, connector)
      }))
      .filter((item) => item.result);

    if (compoundResults.length >= 2) {
      return buildTelemetryResponse({
        traceContext,
        route: "skill",
        skillId: `compound:${compoundResults.map((item) => item.skill.id).join("+")}`,
        confidence: context.intentConfidence || 0.86,
        promptVersion: promptRegistry.getPromptVersion(),
        usage: compoundResults.reduce((accumulator, item) => mergeUsage(accumulator, item.result.usage), null),
        sqlLogs: compoundResults.flatMap((item) => item.result.sqlLogs || []),
        reply: buildCompoundSkillReply(compoundResults),
        intent: context.intent,
        intentSource: context.intentSource,
        intentConfidence: context.intentConfidence,
        ambiguityFlag: false,
        clarificationQuestion: null,
        matchedSkillCandidates: skillMatch.matchedSkillCandidates,
        fallbackReason: "compound_skill_orchestration",
        formatterSource: "compound_skills",
        debugTimeline: timeline
      });
    }
  }

  const fallbackDecision = createFallbackRouteDecision(context.intentConfidence || 0.45);
  pushTimeline(timeline, "llm_fallback", {
    fallback_reason: skillMatch.routeReason
  });
  let fallbackResult;
  try {
    fallbackResult = await runFallbackLlm({
      normalizedMessages,
      connector,
      promptRegistry,
      viewId,
      requestContext: context
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown fallback runtime error.";
    return buildTelemetryResponse({
      traceContext,
      route: fallbackDecision.route || ROUTE_LLM_FALLBACK,
      skillId: null,
      confidence: 0,
      promptVersion: promptRegistry.getPromptVersion(),
      usage: mergeUsage(intentResult.usage, null),
      sqlLogs: [],
      reply: "Không thể truy vấn agent lúc này. Vui lòng thử lại sau.",
      error: errorMessage,
      intent: context.intent,
      intentSource: context.intentSource,
      intentConfidence: context.intentConfidence,
      ambiguityFlag: context.ambiguityFlag,
      clarificationQuestion: context.clarificationQuestion,
      matchedSkillCandidates: skillMatch.matchedSkillCandidates,
      fallbackReason: skillMatch.routeReason,
      formatterSource: null,
      debugTimeline: timeline
    });
  }

  return buildTelemetryResponse({
    traceContext,
    route: fallbackDecision.route || ROUTE_LLM_FALLBACK,
    skillId: null,
    confidence: fallbackDecision.confidence,
    promptVersion: promptRegistry.getPromptVersion(),
    usage: mergeUsage(intentResult.usage, fallbackResult.usage),
    sqlLogs: fallbackResult.sqlLogs,
    reply: fallbackResult.reply,
    error: fallbackResult.error || null,
    intent: context.intent,
    intentSource: context.intentSource,
    intentConfidence: context.intentConfidence,
    ambiguityFlag: context.ambiguityFlag,
    clarificationQuestion: context.clarificationQuestion,
    matchedSkillCandidates: skillMatch.matchedSkillCandidates,
    fallbackReason: skillMatch.routeReason,
    formatterSource: null,
    debugTimeline: timeline
  });
}
