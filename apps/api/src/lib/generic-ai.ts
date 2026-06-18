import { createOpenAI } from "@ai-sdk/openai";
import { randomUUID } from "crypto";
import { config } from "../config";
import { createOllama } from "ollama-ai-provider-v2";
import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { fireworks } from "@ai-sdk/fireworks";
import { deepinfra } from "@ai-sdk/deepinfra";
import { createVertex } from "@ai-sdk/google-vertex";

type Provider =
  | "openai"
  | "ollama"
  | "anthropic"
  | "groq"
  | "google"
  | "openrouter"
  | "fireworks"
  | "deepinfra"
  | "vertex";
const defaultProvider: Provider = config.OLLAMA_BASE_URL ? "ollama" : "openai";
const localProxyUrl =
  config.LOCAL_LLM_PROXY_URL ??
  (config.ENV === "local" ? "http://llm-proxy:3001" : undefined);

const providerList: Record<Provider, any> = {
  openai: createOpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
  }), //OPENAI_API_KEY
  ollama: createOllama({
    baseURL: config.OLLAMA_BASE_URL,
  }),
  anthropic, //ANTHROPIC_API_KEY
  groq, //GROQ_API_KEY
  google, //GOOGLE_GENERATIVE_AI_API_KEY
  openrouter: createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
  }),
  fireworks, //FIREWORKS_API_KEY
  deepinfra, //DEEPINFRA_API_KEY
  vertex: createVertex({
    project: "firecrawl",
    //https://github.com/vercel/ai/issues/6644 bug
    baseURL:
      "https://aiplatform.googleapis.com/v1/projects/firecrawl/locations/global/publishers/google",
    location: "global",
    googleAuthOptions: config.VERTEX_CREDENTIALS
      ? {
          credentials: JSON.parse(atob(config.VERTEX_CREDENTIALS)),
        }
      : {
          keyFile: "./gke-key.json",
        },
  }),
};

function createLocalProxyProvider(proxyUrl: string) {
  return (modelId: string) => ({
    specificationVersion: "v2" as const,
    provider: "local-proxy",
    modelId,
    supportedUrls: {},
    defaultObjectGenerationMode: "json" as const,

    async doGenerate(options: any) {
      const messages: Array<{ role: string; content: string }> = [];

      for (const msg of options.prompt ?? []) {
        if (msg.role === "system") {
          messages.push({ role: "system", content: msg.content });
        } else if (msg.role === "user") {
          const text = (msg.content as any[])
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("");
          messages.push({ role: "user", content: text });
        } else if (msg.role === "assistant") {
          const text = (msg.content as any[])
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("");
          messages.push({ role: "assistant", content: text });
        }
      }

      if (options.tools?.length) {
        messages.push({
          role: "system",
          content: `You have access to these tools. To call a tool, respond ONLY with valid JSON:\n{"tool": "<name>", "args": <args object>}\nAvailable tools: ${JSON.stringify(options.tools)}`,
        });
      }

      if (options.responseFormat?.type === "json") {
        messages.push({
          role: "system",
          content: `Respond ONLY with valid JSON matching this schema: ${JSON.stringify(options.responseFormat.schema ?? {})}`,
        });
      }

      const res = await fetch(`${proxyUrl}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: options.abortSignal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as any).message ?? `LLM proxy error: ${res.status}`,
        );
      }

      const envelope = (await res.json()) as {
        type: string;
        text?: string;
        name?: string;
        args?: object;
      };

      if (envelope.type === "tool_call") {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: randomUUID(),
              toolName: envelope.name!,
              args: envelope.args!,
            },
          ],
          finishReason: { raw: "tool_calls", unified: "tool-calls" as const },
          usage: { inputTokens: { total: 0 }, outputTokens: { total: 0 } },
          warnings: [],
        };
      }

      return {
        content: [{ type: "text" as const, text: envelope.text ?? "" }],
        finishReason: { raw: "stop", unified: "stop" as const },
        usage: { inputTokens: { total: 0 }, outputTokens: { total: 0 } },
        warnings: [],
      };
    },

    async doStream(options: any) {
      const result = await (this as any).doGenerate(options);

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });

          for (const part of result.content) {
            if (part.type === "text") {
              controller.enqueue({ type: "text-start", id: "0" });
              controller.enqueue({
                type: "text-delta",
                id: "0",
                delta: part.text,
              });
              controller.enqueue({ type: "text-end", id: "0" });
            } else if (part.type === "tool-call") {
              controller.enqueue({ type: "tool-call", ...part });
            }
          }

          controller.enqueue({
            type: "finish",
            finishReason: result.finishReason,
            usage: result.usage,
          });

          controller.close();
        },
      });

      return { stream, request: { body: undefined }, response: undefined };
    },
  });
}

export function getModel(name: string, provider: Provider = defaultProvider) {
  if (localProxyUrl) {
    return createLocalProxyProvider(localProxyUrl)(name);
  }
  if (name === "gemini-2.5-pro") {
    name = "gemini-2.5-pro";
  }
  const modelName = config.MODEL_NAME || name;
  // o3-mini returns empty text via the Responses API — force Chat Completions
  if (provider === "openai" && modelName.startsWith("o3-mini")) {
    return providerList.openai.chat(modelName);
  }
  return providerList[provider](modelName);
}

export function getEmbeddingModel(
  name: string,
  provider: Provider = defaultProvider,
) {
  return config.MODEL_EMBEDDING_NAME
    ? providerList[provider].embedding(config.MODEL_EMBEDDING_NAME)
    : providerList[provider].embedding(name);
}
