import { DEFAULT_VIEW_ID, ROUTE_LLM_FALLBACK } from "../contracts/chat-contracts.js";
import { buildTelemetryResponse } from "../telemetry/chat-telemetry.js";
import { createTraceContext } from "../telemetry/trace-context.js";
import { normalizeMessages } from "../tooling/messages.js";
import { foldText } from "../tooling/common.js";
import { analyzeQuestionComplexity } from "../tooling/question-analysis.js";
import { SQLiteConnector } from "../connectors/sqlite-connector.js";
import { PromptRegistry } from "./prompt-registry.js";
import { SkillRegistry } from "./skill-registry.js";
import { createFallbackRouteDecision, createSkillRouteDecision } from "./route-decision.js";
import { runFallbackLlm } from "./fallback-llm.js";

function buildRequestContext({ normalizedMessages, viewId, selectedFilters, sessionId, debug, connector, promptRegistry, traceContext }) {
  const latestMessage = normalizedMessages[normalizedMessages.length - 1];
  const latestQuestion = latestMessage?.content || "";
  const questionAnalysis = analyzeQuestionComplexity(latestQuestion);
  const routingQuestion = questionAnalysis.routingQuestion || latestQuestion;
  return {
    normalizedMessages,
    latestMessage,
    latestQuestion,
    foldedQuestion: foldText(latestQuestion),
    routingQuestion,
    routingFoldedQuestion: foldText(routingQuestion),
    questionAnalysis,
    viewId,
    selectedFilters: selectedFilters || null,
    sessionId: sessionId || null,
    debug: Boolean(debug),
    connector,
    promptRegistry,
    traceContext
  };
}

const skillRegistry = new SkillRegistry();

export async function chatWithCrmAgent({
  messages,
  viewId = DEFAULT_VIEW_ID,
  selectedFilters = null,
  sessionId = null,
  debug = false
}) {
  const traceContext = createTraceContext();
  const connector = new SQLiteConnector();
  const promptRegistry = new PromptRegistry(connector);
  const normalizedMessages = normalizeMessages(messages);

  if (normalizedMessages.length === 0) {
    return buildTelemetryResponse({
      traceContext,
      route: "validation",
      promptVersion: promptRegistry.getPromptVersion(),
      usage: null,
      sqlLogs: [],
      confidence: 1,
      reply: "Vui long gui cau hoi ve du lieu CRM."
    });
  }

  const latestMessage = normalizedMessages[normalizedMessages.length - 1];
  if (latestMessage.role !== "user") {
    return buildTelemetryResponse({
      traceContext,
      route: "validation",
      promptVersion: promptRegistry.getPromptVersion(),
      usage: null,
      sqlLogs: [],
      confidence: 1,
      reply: "Vui long gui cau hoi moi tu nguoi dung."
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
    traceContext
  });

  const matchedSkill = skillRegistry.findMatch(context);
  if (matchedSkill) {
    const rawSkillResult = matchedSkill.handler.run(context, connector);
    if (rawSkillResult) {
      const skillResult = matchedSkill.handler.formatResponse(rawSkillResult);
      const routeDecision = createSkillRouteDecision(matchedSkill);
      return buildTelemetryResponse({
        traceContext,
        route: routeDecision.route,
        skillId: routeDecision.skillId,
        confidence: routeDecision.confidence,
        promptVersion: promptRegistry.getPromptVersion(),
        usage: skillResult.usage,
        sqlLogs: skillResult.sqlLogs,
        reply: skillResult.reply
      });
    }
  }

  const fallbackDecision = createFallbackRouteDecision();
  let fallbackResult;
  try {
    fallbackResult = await runFallbackLlm({
      normalizedMessages,
      connector,
      promptRegistry,
      viewId
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown fallback runtime error.";
    return buildTelemetryResponse({
      traceContext,
      route: fallbackDecision.route || ROUTE_LLM_FALLBACK,
      skillId: null,
      confidence: 0,
      promptVersion: promptRegistry.getPromptVersion(),
      usage: null,
      sqlLogs: [],
      reply: "Khong the truy van agent luc nay. Vui long thu lai sau.",
      error: errorMessage
    });
  }

  return buildTelemetryResponse({
    traceContext,
    route: fallbackDecision.route || ROUTE_LLM_FALLBACK,
    skillId: null,
    confidence: fallbackDecision.confidence,
    promptVersion: promptRegistry.getPromptVersion(),
    usage: fallbackResult.usage,
    sqlLogs: fallbackResult.sqlLogs,
    reply: fallbackResult.reply,
    error: fallbackResult.error || null
  });
}
