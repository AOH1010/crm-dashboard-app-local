import {
  createPartFromFunctionResponse,
  FunctionCallingConfigMode,
  GoogleGenAI
} from "@google/genai";
import { createUsage } from "../contracts/chat-contracts.js";

const QUERY_FUNCTION_NAME = "query_crm_data";
const MAX_TOOL_ROUNDS = 4;
const NVIDIA_CHAT_URL = process.env.NVIDIA_CHAT_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MAX_TOKENS = Number.parseInt(process.env.CRM_AGENT_MAX_TOKENS || "2048", 10);
const NVIDIA_TEMPERATURE = Number.parseFloat(process.env.CRM_AGENT_TEMPERATURE || "0.15");
const NVIDIA_TOP_P = Number.parseFloat(process.env.CRM_AGENT_TOP_P || "0.95");
const NVIDIA_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.CRM_AGENT_REQUEST_TIMEOUT_MS || "30000", 10);
const NVIDIA_ENABLE_THINKING = String(process.env.CRM_AGENT_ENABLE_THINKING || "false").trim().toLowerCase() === "true";

const QUERY_TOOL_DECLARATION = {
  name: QUERY_FUNCTION_NAME,
  description: "Run a read-only SQL query on internal CRM data using canonical table names and return rows.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "A SQLite SELECT query that only uses canonical allowed tables."
      },
      max_rows: {
        type: "number",
        description: "Maximum rows required for this query (1-120)."
      }
    },
    required: ["sql"],
    additionalProperties: false
  }
};

const NVIDIA_TOOL_DECLARATION = {
  type: "function",
  function: {
    name: QUERY_TOOL_DECLARATION.name,
    description: QUERY_TOOL_DECLARATION.description,
    parameters: QUERY_TOOL_DECLARATION.parametersJsonSchema
  }
};

let geminiClient = null;

function getDefaultProvider() {
  return String(process.env.CRM_AGENT_PROVIDER || "").trim().toLowerCase() || "gemini";
}

function getDefaultModel() {
  return process.env.CRM_AGENT_MODEL
    || (getDefaultProvider() === "nvidia" ? "google/gemma-4-31b-it" : "gemini-2.5-flash");
}

function getGeminiClient() {
  if (geminiClient) {
    return geminiClient;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }
  geminiClient = new GoogleGenAI({ apiKey });
  return geminiClient;
}

function getNvidiaApiKey() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY in environment.");
  }
  return apiKey;
}

function accumulateGeminiUsage(target, usageMetadata) {
  if (!usageMetadata) {
    return target;
  }
  target.prompt_tokens += Number(usageMetadata.promptTokenCount || 0);
  target.completion_tokens += Number(usageMetadata.candidatesTokenCount || 0);
  target.total_tokens += Number(usageMetadata.totalTokenCount || 0);
  target.thoughts_tokens += Number(usageMetadata.thoughtsTokenCount || 0);
  target.tool_use_prompt_tokens += Number(usageMetadata.toolUsePromptTokenCount || 0);
  return target;
}

function accumulateNvidiaUsage(target, usageMetadata) {
  if (!usageMetadata) {
    return target;
  }
  target.prompt_tokens += Number(usageMetadata.prompt_tokens || 0);
  target.completion_tokens += Number(usageMetadata.completion_tokens || 0);
  target.total_tokens += Number(usageMetadata.total_tokens || 0);
  return target;
}

function toGeminiContent(messages) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
}

function toNvidiaMessages(messages, systemInstruction) {
  return [
    { role: "system", content: systemInstruction },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];
}

async function callNvidiaChatCompletion({ messages, tools }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NVIDIA_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(NVIDIA_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getNvidiaApiKey()}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getDefaultModel(),
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: NVIDIA_MAX_TOKENS,
        temperature: NVIDIA_TEMPERATURE,
        top_p: NVIDIA_TOP_P,
        stream: false,
        chat_template_kwargs: {
          enable_thinking: NVIDIA_ENABLE_THINKING
        }
      })
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`NVIDIA chat completion timed out after ${NVIDIA_REQUEST_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA chat completion failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  return response.json();
}

async function runGeminiFallback({ normalizedMessages, connector, systemInstruction, usage }) {
  const ai = getGeminiClient();
  const contents = toGeminiContent(normalizedMessages);
  const sqlLogs = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await ai.models.generateContent({
      model: getDefaultModel(),
      contents,
      config: {
        temperature: 0.15,
        systemInstruction,
        tools: [{ functionDeclarations: [QUERY_TOOL_DECLARATION] }],
        toolConfig: {
          functionCallingConfig: round === 0
            ? {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: [QUERY_FUNCTION_NAME]
            }
            : {
              mode: FunctionCallingConfigMode.AUTO
            }
        }
      }
    });
    accumulateGeminiUsage(usage, response.usageMetadata);

    const functionCalls = response.functionCalls || [];
    if (functionCalls.length === 0) {
      const textReply = String(response.text || "").trim();
        return {
          reply: textReply.length > 0
            ? textReply
            : "Không tìm thấy kết quả phù hợp trong dữ liệu hiện tại.",
          sqlLogs,
          usage
        };
    }

    if (response.candidates?.[0]?.content) {
      contents.push(response.candidates[0].content);
    }

    const functionParts = functionCalls.map((call, index) => {
      const args = call.args || {};
      try {
        const result = connector.runReadQuery({
          sql: args.sql,
          maxRows: args.max_rows
        });
        sqlLogs.push({
          name: call.name || QUERY_FUNCTION_NAME,
          sql: result.sql,
          row_count: result.row_count,
          row_limit: result.row_limit
        });
        return createPartFromFunctionResponse(
          call.id || `call_${Date.now()}_${index}`,
          call.name || QUERY_FUNCTION_NAME,
          { output: result }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown SQL execution error.";
        sqlLogs.push({
          name: call.name || QUERY_FUNCTION_NAME,
          sql: typeof args.sql === "string" ? args.sql : "",
          row_count: 0,
          row_limit: 0,
          error: errorMessage
        });
        return createPartFromFunctionResponse(
          call.id || `call_${Date.now()}_${index}`,
          call.name || QUERY_FUNCTION_NAME,
          { error: errorMessage }
        );
      }
    });

    contents.push({
      role: "user",
      parts: functionParts
    });
  }

  return {
    reply: "Đã vượt số lần truy vấn an toàn. Vui lòng hỏi lại với phạm vi nhỏ hơn.",
    sqlLogs,
    usage
  };
}

async function runNvidiaFallback({ normalizedMessages, connector, systemInstruction, usage }) {
  const sqlLogs = [];
  const messages = toNvidiaMessages(normalizedMessages, systemInstruction);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await callNvidiaChatCompletion({
      messages,
      tools: [NVIDIA_TOOL_DECLARATION]
    });
    accumulateNvidiaUsage(usage, response.usage);

    const choice = response?.choices?.[0] || {};
    const assistantMessage = choice.message || {};
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];

    if (toolCalls.length === 0) {
      const textReply = String(
        assistantMessage.content
        || assistantMessage.reasoning_content
        || assistantMessage.reasoning
        || ""
      ).trim();

      return {
        reply: textReply.length > 0
          ? textReply
          : "Không tìm thấy kết quả phù hợp trong dữ liệu hiện tại.",
        sqlLogs,
        usage
      };
    }

    messages.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const functionName = toolCall?.function?.name || QUERY_FUNCTION_NAME;
      let args = {};
      try {
        args = JSON.parse(toolCall?.function?.arguments || "{}");
      } catch {
        args = {};
      }

      try {
        const result = connector.runReadQuery({
          sql: args.sql,
          maxRows: args.max_rows
        });
        sqlLogs.push({
          name: functionName,
          sql: result.sql,
          row_count: result.row_count,
          row_limit: result.row_limit
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown SQL execution error.";
        sqlLogs.push({
          name: functionName,
          sql: typeof args.sql === "string" ? args.sql : "",
          row_count: 0,
          row_limit: 0,
          error: errorMessage
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMessage })
        });
      }
    }
  }

  return {
    reply: "Đã vượt số lần truy vấn an toàn. Vui lòng hỏi lại với phạm vi nhỏ hơn.",
    sqlLogs,
    usage
  };
}

export async function runFallbackLlm({ normalizedMessages, connector, promptRegistry, viewId, requestContext = {} }) {
  const systemInstruction = promptRegistry.buildFallbackPrompt({
    viewId,
    requestContext
  });
  const usage = createUsage(getDefaultProvider());
  if (getDefaultProvider() === "nvidia") {
    return runNvidiaFallback({
      normalizedMessages,
      connector,
      systemInstruction,
      usage
    });
  }

  return runGeminiFallback({
    normalizedMessages,
    connector,
    systemInstruction,
    usage
  });
}
