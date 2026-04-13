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
import { createDefaultConnector } from "../connectors/index.js";
import { PromptRegistry } from "./prompt-registry.js";
import { SkillRegistry } from "./skill-registry.js";
import {
  createClarifyRouteDecision,
  createFallbackRouteDecision,
  createSkillRouteDecision
} from "./route-decision.js";
import { runFallbackLlm } from "./fallback-llm.js";
import { classifyIntent } from "./intent-classifier-v2.js";
import { formatSkillResponse } from "./skill-response-formatter.js";
import { buildConversationTopicState } from "./conversation-topic-state.js";
import { buildSemanticFrameV3 } from "./semantic-frame-v3.js";
import { buildRoutePolicyV3 } from "./route-policy-v3.js";
import { validateSkillOutputV3 } from "./skill-output-validator-v3.js";

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

function isTooBroadForCompoundOrchestration(context) {
  const foldedQuestion = String(context.foldedQuestion || "").toLowerCase();
  const domainCount = [
    /(doanh thu|doanh so|\bdt\b|revenue)/.test(foldedQuestion),
    /(top|xep hang|dan dau)/.test(foldedQuestion),
    /(renew|gia han|den han|sap het han)/.test(foldedQuestion),
    /(activate|kich hoat|active|inactive|ghost|operations)/.test(foldedQuestion),
    /(lead|conversion|\bcr\b|nguon|source|team)/.test(foldedQuestion)
  ].filter(Boolean).length;

  return domainCount >= 3 && /(buc tranh toan canh|full picture|toan canh|ceo)/.test(foldedQuestion);
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
    fullConversationMessages: normalizedMessages,
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

function buildValidationReply(context) {
  if (context.intent?.primary_intent === "injection_attempt") {
    return "Tôi chỉ hỗ trợ truy vấn đọc dữ liệu CRM và không thực hiện lệnh xóa, sửa, chèn hoặc bỏ qua guardrail.";
  }
  return "Vui lòng gửi câu hỏi hợp lệ về dữ liệu CRM.";
}

function buildForecastFallbackReply(connector) {
  const latestDateKey = connector.getLatestOrderDateKey();
  return [
    "Tôi chưa trả về con số dự báo tương lai như một fact đã xác nhận.",
    `Dữ liệu actual hiện tại mới grounded đến ${latestDateKey}. Cách an toàn là tách riêng actual months, forecast months, tổng năm dự kiến và growth so với năm trước.`,
    "Nếu cần, tôi có thể tiếp tục dùng dữ liệu doanh thu YTD và cùng kỳ năm trước để lập forecast theo kịch bản thận trọng, cơ sở và tích cực mà không tự ý bổ sung biến ngoài dữ liệu."
  ].join("\n\n");
}

function buildStructuredCompoundSkillReply({ successfulResults, partialFailures = [] }) {
  const baseReply = buildCompoundSkillReply(successfulResults.map((item) => ({
    skill: item.skill,
    result: {
      reply: item.reply
    }
  })));
  const lines = [baseReply];

  if (partialFailures.length > 0) {
    const failedSkillLabels = partialFailures.map((item) => item.skill.name || item.skill.id).join(", ");
    lines.push("");
    lines.push(`Tôi mới ghép an toàn được ${successfulResults.length}/${successfulResults.length + partialFailures.length} phần. Phần còn lại (${failedSkillLabels}) tôi chưa trả lời thay bằng fallback rộng để tránh lệch dữ liệu.`);
  }

  return lines.join("\n");
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
  const connector = createDefaultConnector();
  await connector.initializeRuntimeState();
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

  context.semantic = buildSemanticFrameV3(context);
  pushTimeline(timeline, "semantic_frame_v3", {
    intent: context.semantic.intent,
    topic: context.semantic.slots.topic,
    metric: context.semantic.slots.metric,
    entity_type: context.semantic.slots.entity_type,
    broadness: context.semantic.broadness,
    follow_up_flag: context.semantic.follow_up_flag
  });

  const legacySkillMatch = skillRegistry.findMatch(context);
  const routePolicyDecision = buildRoutePolicyV3({
    context,
    skillRegistry
  });
  context.routePolicyDecision = routePolicyDecision;
  const skillMatch = routePolicyDecision.skill
    ? {
      skill: routePolicyDecision.skill,
      matchedSkillCandidates: routePolicyDecision.matched_skill_candidates,
      routeReason: routePolicyDecision.reason_code
    }
    : {
      ...legacySkillMatch,
      matchedSkillCandidates: routePolicyDecision.matched_skill_candidates.length > 0
        ? routePolicyDecision.matched_skill_candidates
        : legacySkillMatch.matchedSkillCandidates,
      routeReason: routePolicyDecision.reason_code || legacySkillMatch.routeReason
    };
  const resolvedRoute = routePolicyDecision.resolved_route;
  context.conversationTopicState = buildConversationTopicState({
    context,
    resolvedRoute,
    skillMatch
  });
  pushTimeline(timeline, "route_policy_v3", {
    decision: routePolicyDecision.decision,
    reason_code: routePolicyDecision.reason_code,
    skill_id: routePolicyDecision.skill_id,
    confidence: routePolicyDecision.confidence,
    top_candidate: routePolicyDecision.candidate_executors?.[0] || null
  });
  pushTimeline(timeline, "intent_router", {
    resolved_route: resolvedRoute,
    skill_id: skillMatch.skill?.id || null,
    matched_skill_candidates: skillMatch.matchedSkillCandidates,
    route_reason: skillMatch.routeReason
  });
  pushTimeline(timeline, "conversation_topic_state", context.conversationTopicState || {});

  if (resolvedRoute === ROUTE_VALIDATION) {
    pushTimeline(timeline, "validation", {
      reason: context.intent?.primary_intent || "request_validation"
    });
    const validationReply = context.intent?.primary_intent === "out_of_domain_request"
      ? "Tôi không có quyền truy cập dữ liệu hoặc dịch vụ ngoài CRM nội bộ, nên không thể trả lời câu hỏi này."
      : buildValidationReply(context);
    return buildTelemetryResponse({
      traceContext,
      route: ROUTE_VALIDATION,
      skillId: null,
      confidence: context.intentConfidence || 1,
      promptVersion: promptRegistry.getPromptVersion(),
      usage: intentResult.usage,
      sqlLogs: [],
      reply: validationReply,
      intent: context.intent,
      intentSource: context.intentSource,
      intentConfidence: context.intentConfidence,
      ambiguityFlag: context.ambiguityFlag,
      clarificationQuestion: context.clarificationQuestion,
      matchedSkillCandidates: skillMatch.matchedSkillCandidates,
      fallbackReason: "validation_guardrail",
      formatterSource: null,
      debugTimeline: timeline,
      conversationState: context.conversationTopicState,
      semanticFrame: context.semantic,
      routePolicy: context.routePolicyDecision
    });
  }

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
      debugTimeline: timeline,
      conversationState: context.conversationTopicState,
      semanticFrame: context.semantic,
      routePolicy: context.routePolicyDecision
    });
  }

  if (resolvedRoute === "skill" && skillMatch.skill) {
    pushTimeline(timeline, "skill_execute", {
      skill_id: skillMatch.skill.id
    });
    const rawSkillResult = await skillMatch.skill.handler.run(context, connector);
    const skillValidation = validateSkillOutputV3({
      context,
      skill: skillMatch.skill,
      skillResult: rawSkillResult
    });
    pushTimeline(timeline, "skill_output_validator_v3", {
      skill_id: skillMatch.skill.id,
      ok: skillValidation.ok,
      route: skillValidation.route,
      reason_code: skillValidation.reason_code
    });
    if (rawSkillResult && skillValidation.ok) {
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
        debugTimeline: timeline,
        conversationState: context.conversationTopicState,
        semanticFrame: context.semantic,
        routePolicy: context.routePolicyDecision
      });
    }

    if (skillValidation.route === ROUTE_CLARIFY_REQUIRED && context.clarificationQuestion) {
      const routeDecision = createClarifyRouteDecision(context.intentConfidence || 0.7);
      pushTimeline(timeline, "clarify_required", {
        clarification_question: buildClarificationReply(context),
        reason: skillValidation.reason_code
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
        fallbackReason: skillValidation.reason_code,
        formatterSource: null,
        debugTimeline: timeline,
        conversationState: context.conversationTopicState,
        semanticFrame: context.semantic,
        routePolicy: context.routePolicyDecision
      });
    }

    skillMatch.routeReason = skillValidation.reason_code;
  }

  if (resolvedRoute === ROUTE_LLM_FALLBACK
    && Array.isArray(skillMatch.compoundSkills)
    && skillMatch.compoundSkills.length >= 2
    && !isTooBroadForCompoundOrchestration(context)) {
    const plannedCompoundSkills = skillMatch.compoundSkills.slice(0, 2);
    pushTimeline(timeline, "compound_skill_plan", {
      skill_ids: plannedCompoundSkills.map((skill) => skill.id),
      candidate_count: skillMatch.compoundSkills.length
    });

    const successfulResults = [];
    const partialFailures = [];

    for (const skill of plannedCompoundSkills) {
      pushTimeline(timeline, "compound_skill_execute", {
        skill_id: skill.id
      });
      const rawSkillResult = await skill.handler.run(context, connector);
      if (!rawSkillResult) {
        partialFailures.push({
          skill,
          reason: "skill_returned_null"
        });
        continue;
      }

      const formattedResult = await formatSkillResponse({
        requestContext: context,
        skillResult: {
          ...skill.handler.formatResponse(rawSkillResult),
          skill_id: skill.id
        },
        promptRegistry,
        useSkillFormatter
      });
      pushTimeline(timeline, "compound_skill_formatter", {
        skill_id: skill.id,
        formatter_source: formattedResult.formatterSource
      });
      successfulResults.push({
        skill,
        usage: mergeUsage(rawSkillResult.usage, formattedResult.usage),
        sqlLogs: rawSkillResult.sqlLogs || [],
        reply: formattedResult.reply
      });
    }

    if (successfulResults.length > 0) {
      const compoundSkillIds = successfulResults.map((item) => item.skill.id);
      pushTimeline(timeline, "compound_skill_result", {
        skill_ids: compoundSkillIds,
        partial_failure_count: partialFailures.length
      });
      return buildTelemetryResponse({
        traceContext,
        route: "skill",
        skillId: `compound:${compoundSkillIds.join("+")}`,
        confidence: context.intentConfidence || 0.86,
        promptVersion: promptRegistry.getPromptVersion(),
        usage: successfulResults.reduce((accumulator, item) => mergeUsage(accumulator, item.usage), null),
        sqlLogs: successfulResults.flatMap((item) => item.sqlLogs),
        reply: buildStructuredCompoundSkillReply({
          successfulResults,
          partialFailures
        }),
        intent: context.intent,
        intentSource: context.intentSource,
        intentConfidence: context.intentConfidence,
        ambiguityFlag: false,
        clarificationQuestion: null,
        matchedSkillCandidates: skillMatch.matchedSkillCandidates,
        fallbackReason: partialFailures.length > 0
          ? "compound_skill_partial"
          : "compound_skill_orchestration",
        formatterSource: "compound_skills",
        debugTimeline: timeline,
        conversationState: context.conversationTopicState,
        semanticFrame: context.semantic,
        routePolicy: context.routePolicyDecision
      });
    }
  }

  const fallbackDecision = createFallbackRouteDecision(context.intentConfidence || 0.45);
  pushTimeline(timeline, "llm_fallback", {
    fallback_reason: skillMatch.routeReason
  });

  if (context.intent?.primary_intent === "forecast_request") {
    return buildTelemetryResponse({
      traceContext,
      route: fallbackDecision.route || ROUTE_LLM_FALLBACK,
      skillId: null,
      confidence: fallbackDecision.confidence,
      promptVersion: promptRegistry.getPromptVersion(),
      usage: intentResult.usage,
      sqlLogs: [],
      reply: buildForecastFallbackReply(connector),
      error: null,
      intent: context.intent,
      intentSource: context.intentSource,
      intentConfidence: context.intentConfidence,
      ambiguityFlag: context.ambiguityFlag,
      clarificationQuestion: context.clarificationQuestion,
      matchedSkillCandidates: skillMatch.matchedSkillCandidates,
      fallbackReason: "forecast_request_guarded_fallback",
      formatterSource: null,
      debugTimeline: timeline,
      conversationState: context.conversationTopicState,
      semanticFrame: context.semantic,
      routePolicy: context.routePolicyDecision
    });
  }

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
      debugTimeline: timeline,
      conversationState: context.conversationTopicState,
      semanticFrame: context.semantic,
      routePolicy: context.routePolicyDecision
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
    debugTimeline: timeline,
    conversationState: context.conversationTopicState,
    semanticFrame: context.semantic,
    routePolicy: context.routePolicyDecision
  });
}
