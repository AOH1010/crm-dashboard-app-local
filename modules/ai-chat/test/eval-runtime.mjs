import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithCrmAgent } from "../src/runtime/chat-runtime-v2.js";
import { legacyChatWithCrmAgent } from "../src/server/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const questionsPath = path.join(projectRoot, "docs", "eval", "questions.json");

const allQuestions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
const automatedQuestions = allQuestions.filter((item) => item.automated);
const legacyQuestions = automatedQuestions.filter((item) => item.legacy_parity);

async function runSet(title, runtime, questions) {
  const outputs = [];
  for (const question of questions) {
    const startedAt = Date.now();
    const result = await runtime({
      viewId: question.view_id,
      messages: [{
        role: "user",
        content: question.question
      }]
    });
    outputs.push({
      id: question.id,
      route: result.route || null,
      skill_id: result.skill_id || null,
      ok: title === "legacy-parity"
        ? typeof result.reply === "string" && result.reply.trim().length > 0
        : result.route === question.expected_route
          && (question.expected_skill_id ? result.skill_id === question.expected_skill_id : true),
      latency_ms: Date.now() - startedAt
    });
  }

  console.log(`\n## ${title}`);
  console.table(outputs);
  return outputs;
}

await runSet("new-runtime", chatWithCrmAgent, automatedQuestions);
await runSet("legacy-parity", legacyChatWithCrmAgent, legacyQuestions);
