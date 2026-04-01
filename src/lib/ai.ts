import { createAnthropic } from "@ai-sdk/anthropic";
import { createAlibaba } from "@ai-sdk/alibaba";
import { createAzure } from "@ai-sdk/azure";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ai-sdk-ollama";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway, generateObject, generateText, Output, stepCountIs, ToolLoopAgent, type ToolSet, tool } from "ai";
import { createMinimax, createMinimaxOpenAI } from "vercel-minimax-ai-provider";
import { z } from "zod";
import { createZhipu } from "zhipu-ai-provider";
import {
  type AIProviderConfig,
  getActiveAIProviderSettings,
  getProviderById,
} from "@/lib/ai-config";
import { runtimeFetch } from "@/lib/runtime-fetch";
import {
  hasConfiguredWebSearch,
  searchWeb,
  WebSearchUnavailableError,
} from "@/lib/web-search-service";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const automationReportSchema = z.object({
  title: z.string().describe("A concise, catchy title for the insight."),
  markdown: z.string().describe(
    "The markdown body of the report, following the user's requested structure when possible. Do not repeat the full report title as a top-level heading.",
  ),
});

export type AutomationReportDraft = z.infer<typeof automationReportSchema>;

const optimizeAutomationPromptSchema = z.object({
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
const STREAMING_CHUNK_TIMEOUT_MS = 300_000;
const CHAT_TOOL_LOOP_STOP_STEPS = 4;
const WEB_SEARCH_REPORT_STOP_STEPS = 5;

const webSearchToolInputSchema = z.object({
  query: z.string().describe("A short web search query for the missing fact or latest context."),
  maxResults: z.number().int().min(1).max(10).optional().describe("Maximum number of web results to retrieve."),
});

class StreamingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamingContractError";
  }
}

class WebSearchFallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebSearchFallbackError";
  }
}

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

function createStreamingError(
  providerName: string,
  detail: string,
  options?: { started: boolean },
): StreamingContractError {
  const detailText = detail.trim();
  const isFirstChunkTimeout = !options?.started && detailText.toLowerCase().includes("no stream chunk arrived");
  const shouldSuggestDifferentProvider = !options?.started
    && !isRequestCancelledErrorMessage(detailText)
    && !detailText.toLowerCase().includes("no stream chunk arrived");
  const prefix = options?.started
    ? "Streaming response was interrupted."
    : isFirstChunkTimeout
      ? "Streaming response timed out before the first chunk."
      : "Streaming chat requires real-time chunked output.";
  const suffix = !shouldSuggestDifferentProvider
    ? ""
    : " Please switch to a provider/model that supports streaming.";

  return new StreamingContractError(`${providerName}: ${prefix} ${detailText}${suffix}`);
}

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

function shouldRetryWithoutTools(error: unknown): boolean {
  if (error instanceof WebSearchFallbackError || error instanceof WebSearchUnavailableError) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return [
    "tool calling",
    "function calling",
    "does not support tools",
    "doesn't support tools",
    "tool use",
    "unsupported functionality",
    "tool_choice",
    "tool choice",
    "tool execution",
  ].some((pattern) => message.includes(pattern));
}

function createWebSearchToolSet() {
  return {
    web_search: tool({
      description:
        "Search the live web for up-to-date facts, missing background, or entity disambiguation when the provided context is not sufficient. Prefer using this tool over telling the user to search manually.",
      inputSchema: webSearchToolInputSchema,
      execute: async ({ query, maxResults }, { abortSignal }) => {
        return searchWeb({
          query,
          maxResults,
          abortSignal,
        });
      },
    }),
  };
}

function canEnableWebSearch(enableWebSearch: boolean): boolean {
  return enableWebSearch && hasConfiguredWebSearch();
}

function isRequestCancelledErrorMessage(message: string): boolean {
  return message.trim().toLowerCase() === "request cancelled";
}

function normalizeStreamingErrorDetail(detail: string, started: boolean): string {
  if (!started && isRequestCancelledErrorMessage(detail)) {
    return `No stream chunk arrived within ${STREAMING_CHUNK_TIMEOUT_MS / 1000} seconds.`;
  }

  return detail;
}

function hasToolErrorInContent(
  content: Array<{ type: string }>,
): boolean {
  return content.some((part) => part.type === "tool-error");
}

type GenerateAutomationReportDraftInput = {
  prompt: string;
  enableWebSearch: boolean;
};

export type StreamConversationOptions = {
  enableWebSearch?: boolean;
  tools?: ToolSet;
  activeTools?: string[];
  onRetryWithoutTools?: () => void;
  onRetryWithoutWebSearch?: () => void;
};

type ResolvedConversationToolConfig = {
  tools?: ToolSet;
  activeTools?: string[];
};

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

async function attemptStreamConversation(
  messages: Message[],
  onTextUpdate: (text: string) => void,
  abortSignal: AbortSignal | undefined,
  options: StreamConversationOptions,
): Promise<string> {
  const { provider } = getActiveAIProviderSettings();
  const toolConfig = resolveConversationToolConfig(options);
  let fullText = "";
  let streamError: unknown = null;
  let hasReceivedTextChunk = false;
  const textBlockOrder: string[] = [];
  const textBlocks = new Map<string, string>();

  function ensureTextBlock(id: string) {
    if (textBlocks.has(id)) {
      return;
    }

    textBlocks.set(id, "");
    textBlockOrder.push(id);
  }

  function readLiveText(): string {
    return textBlockOrder.map((id) => textBlocks.get(id) ?? "").join("");
  }

  function resetLiveText() {
    textBlockOrder.length = 0;
    textBlocks.clear();
    onTextUpdate("");
  }

  const agent = new ToolLoopAgent({
    model: resolveModel(),
    ...(toolConfig.tools
      ? {
          tools: toolConfig.tools,
          activeTools: toolConfig.activeTools,
          stopWhen: stepCountIs(CHAT_TOOL_LOOP_STOP_STEPS),
        }
      : {}),
  });
  let result: Awaited<ReturnType<ToolLoopAgent["stream"]>> | null = null;

  try {
    result = await agent.stream({
      messages: buildMessageArray(messages),
      abortSignal,
      timeout: { chunkMs: STREAMING_CHUNK_TIMEOUT_MS },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "start-step": {
          if (textBlockOrder.length > 0) {
            resetLiveText();
          }
          break;
        }
        case "text-start": {
          ensureTextBlock(part.id);
          break;
        }
        case "text-delta": {
          if (!part.text) {
            break;
          }

          hasReceivedTextChunk = true;
          fullText += part.text;
          ensureTextBlock(part.id);
          textBlocks.set(part.id, `${textBlocks.get(part.id) ?? ""}${part.text}`);
          onTextUpdate(readLiveText());
          break;
        }
        case "tool-error": {
          if (part.toolName === "web_search") {
            throw new WebSearchFallbackError(getErrorMessage(part.error));
          }

          throw new Error(`Tool '${part.toolName}' failed. ${getErrorMessage(part.error)}`);
        }
        case "error": {
          streamError = part.error;
          break;
        }
        case "abort": {
          if (abortSignal?.aborted) {
            throw new Error("AI response was aborted.");
          }

          throw createStreamingError(
            provider.name,
            normalizeStreamingErrorDetail(
              part.reason || `No stream chunk arrived within ${STREAMING_CHUNK_TIMEOUT_MS / 1000} seconds.`,
              hasReceivedTextChunk,
            ),
            { started: hasReceivedTextChunk },
          );
        }
        default:
          break;
      }
    }
  } catch (error) {
    if (error instanceof StreamingContractError || error instanceof WebSearchFallbackError) {
      throw error;
    }

    if (abortSignal?.aborted) {
      throw new Error("AI response was aborted.");
    }

    throw createStreamingError(provider.name, normalizeStreamingErrorDetail(getErrorMessage(error), hasReceivedTextChunk), {
      started: hasReceivedTextChunk,
    });
  }

  if (streamError) {
    throw createStreamingError(
      provider.name,
      normalizeStreamingErrorDetail(getErrorMessage(streamError), hasReceivedTextChunk),
      {
        started: hasReceivedTextChunk,
      },
    );
  }

  const resultWithText = result as { text?: PromiseLike<string> };
  const resolvedText = (resultWithText.text ? await resultWithText.text : fullText) || fullText;

  if (!resolvedText.trim()) {
    throw createStreamingError(provider.name, "The provider returned no text chunks.");
  }

  return resolvedText;
}

export async function streamConversation(
  messages: Message[],
  onTextUpdate: (text: string) => void,
  abortSignal?: AbortSignal,
  options: StreamConversationOptions = {},
): Promise<string> {
  const toolConfig = resolveConversationToolConfig(options);

  try {
    return await attemptStreamConversation(messages, onTextUpdate, abortSignal, options);
  } catch (error) {
    if (!toolConfig.tools || !shouldRetryWithoutTools(error)) {
      throw error;
    }

    if (abortSignal?.aborted) {
      throw error;
    }

    notifyRetryWithoutTools(options);
    return attemptStreamConversation(
      messages,
      onTextUpdate,
      abortSignal,
      {
        ...options,
        enableWebSearch: false,
        tools: undefined,
        activeTools: undefined,
      },
    );
  }
}

async function attemptGenerateAutomationReportDraft(input: GenerateAutomationReportDraftInput): Promise<AutomationReportDraft> {
  const tools = canEnableWebSearch(input.enableWebSearch) ? createWebSearchToolSet() : undefined;
  const result = await generateText({
    model: resolveModel(),
    prompt: input.prompt,
    output: Output.object({ schema: automationReportSchema }),
    ...(tools ? { tools, stopWhen: stepCountIs(WEB_SEARCH_REPORT_STOP_STEPS) } : {}),
  });

  if (tools && result.steps.some((step) => hasToolErrorInContent(step.content))) {
    throw new WebSearchFallbackError("Web search tool execution failed.");
  }

  return automationReportSchema.parse(result.output);
}

export async function generateAutomationReportDraft(input: GenerateAutomationReportDraftInput): Promise<AutomationReportDraft> {
  const { provider } = getActiveAIProviderSettings();

  try {
    try {
      return await attemptGenerateAutomationReportDraft(input);
    } catch (error) {
      if (!input.enableWebSearch || !shouldRetryWithoutTools(error)) {
        throw error;
      }

      return attemptGenerateAutomationReportDraft({
        ...input,
        enableWebSearch: false,
      });
    }
  } catch (error) {
    throw new Error(`${provider.name}: ${getErrorMessage(error)}`);
  }
}

export async function optimizeAutomationProjectPrompt(rawPrompt: string): Promise<string> {
  const { provider } = getActiveAIProviderSettings();
  const trimmedPrompt = rawPrompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }

  try {
    const result = await generateObject({
      model: resolveModel(),
      schema: optimizeAutomationPromptSchema,
      prompt: `You are improving an automation project prompt for a news intelligence workspace.

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

function resolveConversationToolConfig(options: StreamConversationOptions): ResolvedConversationToolConfig {
  const mergedTools: ToolSet = {
    ...(canEnableWebSearch(Boolean(options.enableWebSearch)) ? createWebSearchToolSet() : {}),
    ...(options.tools ?? {}),
  };

  const toolNames = Object.keys(mergedTools);
  if (toolNames.length === 0) {
    return {};
  }

  const activeTools = options.activeTools?.filter((toolName) => toolName in mergedTools);

  return {
    tools: mergedTools,
    activeTools: activeTools && activeTools.length > 0 ? activeTools : undefined,
  };
}

function notifyRetryWithoutTools(options: StreamConversationOptions) {
  const callbacks = new Set([
    options.onRetryWithoutTools,
    options.onRetryWithoutWebSearch,
  ]);

  for (const callback of callbacks) {
    callback?.();
  }
}
