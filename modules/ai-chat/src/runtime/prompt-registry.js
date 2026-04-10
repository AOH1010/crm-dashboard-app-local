import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleRoot = path.resolve(__dirname, "..", "..");
const promptsDir = path.join(moduleRoot, "prompts");

const BASE_PROMPT_FILES = [
  "base-system.md",
  "tool-policy.md",
  "answer-style.md"
];

const PROMPT_VERSION = "v1-hybrid-2026-04-10";

function readPromptFile(...parts) {
  return fs.readFileSync(path.join(promptsDir, ...parts), "utf8").trim();
}

export class PromptRegistry {
  constructor(connector) {
    this.connector = connector;
    this.cache = new Map();
    this.promptVersion = PROMPT_VERSION;
  }

  getViewHint(viewId) {
    const filename = `${viewId || "dashboard"}.md`;
    const targetPath = path.join(promptsDir, "views", filename);
    if (!fs.existsSync(targetPath)) {
      return "";
    }
    return fs.readFileSync(targetPath, "utf8").trim();
  }

  buildIntentClassifierPrompt({ viewId, requestContext }) {
    const cacheKey = `intent:${viewId}:${requestContext.latestUserMessage?.content || ""}:${JSON.stringify(requestContext.selectedFilters || {})}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const sections = [
      readPromptFile("intent-classifier.md")
    ];
    const viewHint = this.getViewHint(viewId);
    if (viewHint) {
      sections.push(viewHint);
    }
    if (requestContext.selectedFilters) {
      sections.push(`Selected filters:\n${JSON.stringify(requestContext.selectedFilters, null, 2)}`);
    }
    const prompt = sections.filter(Boolean).join("\n\n");
    this.cache.set(cacheKey, prompt);
    return prompt;
  }

  buildSkillFormatterPrompt({ viewId, requestContext, skillResult }) {
    const intentId = requestContext.intent?.primary_intent || "unknown";
    const cacheKey = `formatter:${viewId}:${intentId}:${skillResult.skill_id || "unknown"}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const sections = [
      readPromptFile("answer-style.md"),
      readPromptFile("skill-formatter.md")
    ];
    const viewHint = this.getViewHint(viewId);
    if (viewHint) {
      sections.push(viewHint);
    }
    const prompt = sections.filter(Boolean).join("\n\n");
    this.cache.set(cacheKey, prompt);
    return prompt;
  }

  buildFallbackPrompt({ viewId, requestContext }) {
    const intentId = requestContext.intent?.primary_intent || "unknown";
    const cacheKey = `fallback:${viewId}:${intentId}:${requestContext.intentConfidence || "na"}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const sections = [];
    for (const filename of BASE_PROMPT_FILES) {
      sections.push(readPromptFile(filename));
    }

    const viewHint = this.getViewHint(viewId);
    if (viewHint) {
      sections.push(viewHint);
    }

    sections.push(readPromptFile("fallback-sql.md"));
    if (requestContext.intent) {
      sections.push("Resolved intent:");
      sections.push(JSON.stringify(requestContext.intent, null, 2));
    }
    if (requestContext.selectedFilters) {
      sections.push("Selected filters:");
      sections.push(JSON.stringify(requestContext.selectedFilters, null, 2));
    }
    sections.push("Schema summary:");
    sections.push(this.connector.buildSchemaSummary(viewId));

    const prompt = sections.filter(Boolean).join("\n\n");
    this.cache.set(cacheKey, prompt);
    return prompt;
  }

  buildSystemPrompt({ viewId, route = "skill", requestContext = {} }) {
    if (route === "llm_fallback") {
      return this.buildFallbackPrompt({
        viewId,
        requestContext
      });
    }
    return this.buildSkillFormatterPrompt({
      viewId,
      requestContext,
      skillResult: {
        skill_id: "default"
      }
    });
  }

  getPromptVersion() {
    return this.promptVersion;
  }
}
