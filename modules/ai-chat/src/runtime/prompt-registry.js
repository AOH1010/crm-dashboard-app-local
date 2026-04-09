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

  buildSystemPrompt({ viewId, route = "skill" }) {
    const cacheKey = `${viewId}:${route}`;
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

    if (route === "llm_fallback") {
      sections.push(readPromptFile("fallback-sql.md"));
      sections.push("Schema summary:");
      sections.push(this.connector.buildSchemaSummary(viewId));
    }

    const prompt = sections.filter(Boolean).join("\n\n");
    this.cache.set(cacheKey, prompt);
    return prompt;
  }

  getPromptVersion() {
    return this.promptVersion;
  }
}
