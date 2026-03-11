import { createAnthropic } from "@ai-sdk/anthropic";
import { createAlibaba } from "@ai-sdk/alibaba";
import { createAzure } from "@ai-sdk/azure";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isTauri } from "@tauri-apps/api/core";
import { createOllama } from "ai-sdk-ollama";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway, generateObject, streamText } from "ai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { createMinimax, createMinimaxOpenAI } from "vercel-minimax-ai-provider";
import { z } from "zod";
import { createZhipu } from "zhipu-ai-provider";
import { stripLeadingMarkdownTitle } from "@/lib/creative-card";
import {
  type AIProviderConfig,
  getActiveAIProviderSettings,
  getProviderById,
} from "@/lib/ai-config";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const creativeReportSchema = z.object({
  title: z.string().describe("A concise, catchy title for the insight."),
  report_markdown: z.string().describe(
    "The markdown body of the report, using section titles that fit the user's prompt. Do not include a top-level title heading.",
  ),
});

export type CreativeReport = z.infer<typeof creativeReportSchema>;

const optimizeCreativePromptSchema = z.object({
  optimized_prompt: z.string().describe(
    "A refined version of the user's prompt as a single prompt block, with no explanation or code fences.",
  ),
});

export type ProviderFlavor =
  | "openai"
  | "anthropic"
  | "azure"
  | "google"
  | "deepseek"
  | "alibaba"
  | "moonshot"
  | "openrouter"
  | "zhipu"
  | "minimax-anthropic"
  | "minimax-openai"
  | "ollama"
  | "gateway"
  | "openai-compatible";

const API_KEY_OPTIONAL_PROVIDERS = new Set(["ollama", "custom"]);
let tauriFetchPromise: Promise<FetchFunction | null> | null = null;

type ErrorWithMetadata = {
  message?: unknown;
  statusCode?: unknown;
  response?: unknown;
};

function trimConfigValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function buildMessageArray(messages: Message[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function stringifyErrorResponse(response: unknown): string | null {
  if (response == null) {
    return null;
  }

  if (typeof response === "string") {
    return response.slice(0, 300);
  }

  try {
    return JSON.stringify(response).slice(0, 300);
  } catch {
    return null;
  }
}

async function loadTauriFetch(): Promise<FetchFunction | null> {
  if (!isTauri()) {
    return null;
  }

  if (!tauriFetchPromise) {
    tauriFetchPromise = import("@tauri-apps/plugin-http")
      .then((module) => module.fetch as FetchFunction)
      .catch(() => null);
  }

  return tauriFetchPromise;
}

const runtimeFetch: FetchFunction = async (input, init) => {
  const tauriFetch = await loadTauriFetch();
  if (tauriFetch) {
    return tauriFetch(input as URL | Request | string, init as RequestInit);
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("No fetch implementation is available for AI requests.");
  }

  return globalThis.fetch(input as RequestInfo | URL, init as RequestInit);
};

function getRequiredModelId(providerId: string, config: AIProviderConfig): string {
  const modelId = trimConfigValue(config.model);
  if (!modelId) {
    throw new Error(`${getProviderById(providerId).name} model is missing. Please configure it in Settings.`);
  }

  return modelId;
}

function ensureProviderReady(providerId: string, config: AIProviderConfig) {
  const provider = getProviderById(providerId);

  if (!trimConfigValue(config.apiKey) && !API_KEY_OPTIONAL_PROVIDERS.has(providerId)) {
    throw new Error(`${provider.name} API Key is missing. Please configure it in Settings.`);
  }

  if ((providerId === "custom" || providerId === "azure") && !trimConfigValue(config.url)) {
    throw new Error(`${provider.name} base URL is missing. Please configure it in Settings.`);
  }
}

export function getErrorMessage(error: unknown): string {
  const metadata = (typeof error === "object" && error !== null ? error : null) as ErrorWithMetadata | null;
  const statusCode =
    typeof metadata?.statusCode === "number" ? metadata.statusCode : null;
  const responseDetails = stringifyErrorResponse(metadata?.response);

  if (error instanceof Error) {
    let message = error.message;

    if (statusCode && !message.includes(`status ${statusCode}`)) {
      message = `${message} (status ${statusCode})`;
    }

    if (responseDetails && !message.includes(responseDetails)) {
      message = `${message} Response: ${responseDetails}`;
    }

    return message;
  }

  if (typeof metadata?.message === "string") {
    let message = metadata.message;

    if (statusCode && !message.includes(`status ${statusCode}`)) {
      message = `${message} (status ${statusCode})`;
    }

    if (responseDetails && !message.includes(responseDetails)) {
      message = `${message} Response: ${responseDetails}`;
    }

    return message;
  }

  return String(error || "Unknown AI error.");
}

export function isMiniMaxAnthropicEndpoint(url: string): boolean {
  return url.trim().toLowerCase().includes("/anthropic");
}

export function resolveProviderFlavor(
  providerId: string,
  config: Pick<AIProviderConfig, "url">,
): ProviderFlavor {
  switch (providerId) {
    case "openai":
      return "openai";
    case "claude":
      return "anthropic";
    case "azure":
      return "azure";
    case "gemini":
      return "google";
    case "deepseek":
      return "deepseek";
    case "qwen":
      return "alibaba";
    case "kimi":
      return "moonshot";
    case "openrouter":
      return "openrouter";
    case "glm":
      return "zhipu";
    case "minimax":
      return isMiniMaxAnthropicEndpoint(config.url) ? "minimax-anthropic" : "minimax-openai";
    case "ollama":
      return "ollama";
    case "vercel":
      return "gateway";
    case "siliconflow":
    case "custom":
    default:
      return "openai-compatible";
  }
}

function resolveOpenAICompatibleModel(providerId: string, config: AIProviderConfig) {
  const baseURL = trimConfigValue(config.url);
  if (!baseURL) {
    throw new Error(`${getProviderById(providerId).name} base URL is missing. Please configure it in Settings.`);
  }

  const provider = createOpenAICompatible({
    name: providerId,
    apiKey: trimConfigValue(config.apiKey),
    baseURL,
    fetch: runtimeFetch,
  });

  return provider.chatModel(getRequiredModelId(providerId, config));
}

export function normalizeProviderModelId(providerId: string, modelId: string): string {
  if (providerId !== "vercel") {
    return modelId;
  }

  const trimmedModelId = modelId.trim();
  if (!trimmedModelId || trimmedModelId.includes("/")) {
    return trimmedModelId;
  }

  const normalizedModelId = trimmedModelId.toLowerCase();

  if (
    normalizedModelId.startsWith("gpt") ||
    normalizedModelId.startsWith("o1") ||
    normalizedModelId.startsWith("o3") ||
    normalizedModelId.startsWith("o4") ||
    normalizedModelId.startsWith("chatgpt")
  ) {
    return `openai/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("claude")) {
    return `anthropic/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("gemini")) {
    return `google/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("deepseek")) {
    return `deepseek/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("qwen")) {
    return `alibaba/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("moonshot") || normalizedModelId.startsWith("kimi")) {
    return `moonshotai/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("glm")) {
    return `zai/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("grok")) {
    return `xai/${trimmedModelId}`;
  }

  if (normalizedModelId.startsWith("minimax") || normalizedModelId.startsWith("abab")) {
    return `minimax/${trimmedModelId}`;
  }

  throw new Error(
    "Vercel AI Gateway model must include a provider prefix, e.g. openai/gpt-4o, anthropic/claude-sonnet-4, or google/gemini-2.5-flash.",
  );
}

export function resolveModel(providerId?: string, config?: AIProviderConfig) {
  const activeSettings = getActiveAIProviderSettings();
  const resolvedProviderId = providerId ?? activeSettings.providerId;
  const resolvedConfig = config ?? activeSettings.config;
  const modelId = normalizeProviderModelId(
    resolvedProviderId,
    getRequiredModelId(resolvedProviderId, resolvedConfig),
  );
  const apiKey = trimConfigValue(resolvedConfig.apiKey);
  const baseURL = trimConfigValue(resolvedConfig.url);

  ensureProviderReady(resolvedProviderId, resolvedConfig);

  switch (resolveProviderFlavor(resolvedProviderId, resolvedConfig)) {
    case "openai":
      return createOpenAI({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      }).chat(modelId);
    case "anthropic":
      return createAnthropic({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "azure":
      return createAzure({
        apiKey,
        baseURL,
        apiVersion: trimConfigValue(resolvedConfig.azureApiVersion),
        fetch: runtimeFetch,
        useDeploymentBasedUrls: true,
      }).chat(modelId);
    case "google":
      return createGoogleGenerativeAI({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "deepseek":
      return createDeepSeek({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "alibaba":
      return createAlibaba({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "moonshot":
      return createMoonshotAI({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "openrouter":
      return createOpenRouter({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      }).chat(modelId);
    case "zhipu":
      return createZhipu({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "minimax-anthropic":
      return createMinimax({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      }).chat(modelId);
    case "minimax-openai":
      return createMinimaxOpenAI({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      }).chat(modelId);
    case "ollama":
      return createOllama({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "gateway":
      return createGateway({
        apiKey,
        baseURL,
        fetch: runtimeFetch,
      })(modelId);
    case "openai-compatible":
    default:
      return resolveOpenAICompatibleModel(resolvedProviderId, resolvedConfig);
  }
}

export async function streamConversation(
  messages: Message[],
  onChunk: (chunk: string) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  const { provider } = getActiveAIProviderSettings();
  let fullText = "";
  let streamError: unknown = null;

  const result = streamText({
    model: resolveModel(),
    messages: buildMessageArray(messages),
    abortSignal,
    onError({ error }) {
      streamError = error;
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta": {
        if (!part.text) {
          break;
        }

        fullText += part.text;
        onChunk(part.text);
        break;
      }
      case "error": {
        streamError = part.error;
        break;
      }
      case "abort": {
        throw new Error("AI response was aborted.");
      }
      default:
        break;
    }
  }

  if (streamError) {
    throw new Error(`${provider.name}: ${getErrorMessage(streamError)}`);
  }

  if (!fullText.trim()) {
    throw new Error(`${provider.name}: AI returned an empty response.`);
  }

  return fullText;
}

export async function generateCreativeReport(prompt: string): Promise<CreativeReport> {
  const { provider } = getActiveAIProviderSettings();

  try {
    const result = await generateObject({
      model: resolveModel(),
      schema: creativeReportSchema,
      prompt,
    });

    return creativeReportSchema.parse(result.object);
  } catch (error) {
    throw new Error(`${provider.name}: ${getErrorMessage(error)}`);
  }
}

export async function optimizeCreativeProjectPrompt(rawPrompt: string): Promise<string> {
  const { provider } = getActiveAIProviderSettings();
  const trimmedPrompt = rawPrompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }

  try {
    const result = await generateObject({
      model: resolveModel(),
      schema: optimizeCreativePromptSchema,
      prompt: `You are improving a creative analysis prompt for a news intelligence workspace.

Rewrite the user's prompt so it is clearer, more actionable, and more likely to produce a strong report.

Rules:
- Preserve the user's original language.
- Preserve the user's intent, audience, domain terms, and constraints.
- Do not add new goals that the user did not imply.
- Output only the optimized prompt text through the schema.

Original prompt:
${trimmedPrompt}`,
    });

    const optimizedPrompt = result.object.optimized_prompt.trim();
    if (!optimizedPrompt) {
      throw new Error("AI returned an empty optimized prompt.");
    }

    return optimizedPrompt;
  } catch (error) {
    throw new Error(`${provider.name}: ${getErrorMessage(error)}`);
  }
}

export function formatCreativeReportMarkdown(report: CreativeReport): string {
  const normalizedMarkdown = stripLeadingMarkdownTitle(report.report_markdown ?? "").trim();
  return normalizedMarkdown || "_No content provided._";
}
