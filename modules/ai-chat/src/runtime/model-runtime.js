import {
  GoogleGenAI
} from "@google/genai";
import { createUsage } from "../contracts/chat-contracts.js";

const PLACEHOLDER_PREFIXES = [
  "MY_",
  "CHANGE_ME",
  "YOUR_"
];

let geminiClient = null;

export function isConfiguredSecret(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }
  return !PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function getDefaultProvider() {
  return String(process.env.CRM_AGENT_PROVIDER || "").trim().toLowerCase() || "gemini";
}

export function getDefaultModel() {
  return process.env.CRM_AGENT_MODEL
    || (getDefaultProvider() === "nvidia" ? "google/gemma-4-31b-it" : "gemini-2.5-flash");
}

export function getIntentModel() {
  return process.env.CRM_INTENT_MODEL || getDefaultModel();
}

export function getSkillFormatterModel() {
  return process.env.CRM_SKILL_FORMATTER_MODEL || getDefaultModel();
}

export function getIntentTimeoutMs() {
  return Number.parseInt(process.env.CRM_INTENT_TIMEOUT_MS || "3000", 10);
}

export function getSkillFormatterTimeoutMs() {
  return Number.parseInt(process.env.CRM_SKILL_FORMATTER_TIMEOUT_MS || "5000", 10);
}

export function isIntentClassifierEnabled() {
  return String(process.env.CRM_INTENT_ENABLED || "true").trim().toLowerCase() !== "false";
}

export function isSkillFormatterEnabled() {
  return String(process.env.CRM_SKILL_FORMATTER_ENABLED || "true").trim().toLowerCase() !== "false";
}

export function hasConfiguredProviderKey(provider = getDefaultProvider()) {
  if (provider === "nvidia") {
    return isConfiguredSecret(process.env.NVIDIA_API_KEY);
  }
  return isConfiguredSecret(process.env.GEMINI_API_KEY);
}

export function usageFromMetadata(kind, usageMetadata, provider = getDefaultProvider()) {
  const usage = createUsage(kind);
  if (!usageMetadata) {
    return usage;
  }
  if (provider === "nvidia") {
    usage.prompt_tokens += Number(usageMetadata.prompt_tokens || 0);
    usage.completion_tokens += Number(usageMetadata.completion_tokens || 0);
    usage.total_tokens += Number(usageMetadata.total_tokens || 0);
    return usage;
  }
  usage.prompt_tokens += Number(usageMetadata.promptTokenCount || 0);
  usage.completion_tokens += Number(usageMetadata.candidatesTokenCount || 0);
  usage.total_tokens += Number(usageMetadata.totalTokenCount || 0);
  usage.thoughts_tokens += Number(usageMetadata.thoughtsTokenCount || 0);
  usage.tool_use_prompt_tokens += Number(usageMetadata.toolUsePromptTokenCount || 0);
  return usage;
}

export function getGeminiClient() {
  if (geminiClient) {
    return geminiClient;
  }
  if (!hasConfiguredProviderKey("gemini")) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }
  geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return geminiClient;
}

export function getNvidiaApiKey() {
  if (!hasConfiguredProviderKey("nvidia")) {
    throw new Error("Missing NVIDIA_API_KEY in environment.");
  }
  return process.env.NVIDIA_API_KEY;
}

export async function callJsonCompletion({
  messages,
  prompt,
  model,
  provider = getDefaultProvider(),
  timeoutMs = 3000,
  maxOutputTokens = 400
}) {
  if (provider === "nvidia") {
    return callNvidiaJsonCompletion({
      messages,
      prompt,
      model,
      timeoutMs,
      maxOutputTokens,
      expectJson: true
    });
  }

  return callGeminiJsonCompletion({
    messages,
    prompt,
    model,
    maxOutputTokens,
    responseMimeType: "application/json"
  });
}

export async function callTextCompletion({
  messages,
  prompt,
  model,
  provider = getDefaultProvider(),
  timeoutMs = 3000,
  maxOutputTokens = 400
}) {
  if (provider === "nvidia") {
    return callNvidiaJsonCompletion({
      messages,
      prompt,
      model,
      timeoutMs,
      maxOutputTokens,
      expectJson: false
    });
  }

  return callGeminiJsonCompletion({
    messages,
    prompt,
    model,
    maxOutputTokens,
    responseMimeType: "text/plain"
  });
}

async function callGeminiJsonCompletion({
  messages,
  prompt,
  model,
  maxOutputTokens,
  responseMimeType
}) {
  const ai = getGeminiClient();
  const parts = [
    { text: prompt },
    { text: "\n\nConversation:\n" },
    ...messages.map((message) => ({
      text: `${message.role.toUpperCase()}: ${message.content}\n`
    }))
  ];

  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts
    }],
    config: {
      temperature: 0.1,
      responseMimeType,
      maxOutputTokens
    }
  });

  return {
    text: String(response.text || "").trim(),
    usageMetadata: response.usageMetadata || null
  };
}

async function callNvidiaJsonCompletion({
  messages,
  prompt,
  model,
  timeoutMs,
  maxOutputTokens
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(process.env.NVIDIA_CHAT_URL || "https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getNvidiaApiKey()}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: prompt
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.1,
        stream: false
      })
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response?.ok) {
    const errorText = response ? await response.text() : "No response";
    throw new Error(`NVIDIA json completion failed: ${errorText.slice(0, 500)}`);
  }

  const payload = await response.json();
  return {
    text: String(payload?.choices?.[0]?.message?.content || "").trim(),
    usageMetadata: payload?.usage || null
  };
}
