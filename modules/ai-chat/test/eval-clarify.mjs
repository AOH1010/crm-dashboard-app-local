import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithCrmAgent } from "../src/runtime/chat-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const questionsPath = path.join(projectRoot, "docs", "eval", "clarify-questions.json");

const questions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
const outputs = [];

for (const question of questions) {
  const result = await chatWithCrmAgent({
    viewId: question.view_id,
    messages: question.messages,
    debug: true
  });
  const clarificationPattern = new RegExp(question.expected_clarification_pattern, "i");
  outputs.push({
    id: question.id,
    route: result.route || null,
    clarification_question: result.clarification_question || null,
    ok: result.route === question.expected_route
      && clarificationPattern.test(String(result.clarification_question || result.reply || ""))
  });
}

console.log("\n## clarify-eval");
console.table(outputs);
