import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithCrmAgent } from "../src/runtime/chat-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const questionsPath = path.join(projectRoot, "docs", "eval", "intent-questions.json");

const questions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
const outputs = [];

for (const question of questions) {
  const result = await chatWithCrmAgent({
    viewId: question.view_id,
    messages: question.messages,
    debug: true
  });
  outputs.push({
    id: question.id,
    primary_intent: result.intent?.primary_intent || null,
    route: result.route || null,
    ok: result.intent?.primary_intent === question.expected_primary_intent
      && result.intent?.action === question.expected_action
      && result.intent?.metric === question.expected_metric
      && result.intent?.dimension === question.expected_dimension
      && Boolean(result.intent?.ambiguity_flag) === Boolean(question.expected_ambiguity_flag)
  });
}

console.log("\n## intent-eval");
console.table(outputs);
