import { PromptRegistry } from "../runtime/prompt-registry.js";
import { SQLiteConnector } from "../connectors/sqlite-connector.js";

const connector = new SQLiteConnector();
const promptRegistry = new PromptRegistry(connector);

export function getViewContext(viewId) {
  return promptRegistry.getViewHint(viewId);
}

export function buildSkillPrompt({ viewId, schemaHint }) {
  const basePrompt = promptRegistry.buildSystemPrompt({
    viewId,
    route: "llm_fallback"
  });
  if (!schemaHint) {
    return basePrompt;
  }
  return `${basePrompt}\n\nExternal schema hint:\n${schemaHint}`;
}
