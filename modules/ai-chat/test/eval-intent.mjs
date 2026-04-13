import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foldText } from "../src/tooling/common.js";
import { analyzeQuestionComplexity } from "../src/tooling/question-analysis.js";
import { classifyIntentLegacy, resolveRouteFromIntent } from "../src/runtime/intent-classifier-v2.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const questionsPath = path.join(projectRoot, "docs", "eval", "intent-questions.json");

const questions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
const outputs = [];
const knownSellers = [
  "Hoang Van Huy",
  "Nguyen Thi Hien",
  "Pham Van Hoang"
];

const fakeConnector = {
  getLatestOrderYear() {
    return 2026;
  },
  getSellerNames() {
    return knownSellers;
  },
  detectSellerCandidates(question) {
    const foldedQuestion = foldText(question);
    return knownSellers
      .filter((sellerName) => foldedQuestion.includes(foldText(sellerName)))
      .map((sellerName) => ({
        seller_name: sellerName,
        score: 100
      }));
  },
  detectSellerName(question) {
    const candidates = this.detectSellerCandidates(question);
    return candidates[0]?.seller_name || null;
  }
};

function buildIntentEvalContext(question) {
  const latestMessage = question.messages[question.messages.length - 1] || {
    role: "user",
    content: ""
  };
  const latestQuestion = latestMessage.content || "";
  const questionAnalysis = analyzeQuestionComplexity(latestQuestion);
  return {
    normalizedMessages: question.messages,
    fullConversationMessages: question.messages,
    latestQuestion,
    latestUserMessage: latestMessage,
    recentTurnsForIntent: question.messages,
    viewId: question.view_id,
    selectedFilters: null,
    connector: fakeConnector,
    questionAnalysis,
    legacyQuestionAnalysis: questionAnalysis,
    foldedQuestion: foldText(latestQuestion),
    routingQuestion: questionAnalysis.routingQuestion || latestQuestion,
    routingFoldedQuestion: foldText(questionAnalysis.routingQuestion || latestQuestion)
  };
}

for (const question of questions) {
  const result = classifyIntentLegacy(buildIntentEvalContext(question));
  outputs.push({
    id: question.id,
    primary_intent: result.intent.primary_intent,
    route: resolveRouteFromIntent(result.intent),
    ok: result.intent.primary_intent === question.expected_primary_intent
      && result.intent.action === question.expected_action
      && result.intent.metric === question.expected_metric
      && result.intent.dimension === question.expected_dimension
      && Boolean(result.intent.ambiguity_flag) === Boolean(question.expected_ambiguity_flag)
  });
}

console.log("\n## intent-eval");
console.table(outputs);

if (!outputs.every((item) => item.ok)) {
  process.exitCode = 1;
}
