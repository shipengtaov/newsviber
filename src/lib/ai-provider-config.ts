import azureIcon from "@/assets/provider-icons/azure.png";
import claudeIcon from "@/assets/provider-icons/claude.png";
import customIcon from "@/assets/provider-icons/custom.png";
import deepseekIcon from "@/assets/provider-icons/deepseek.png";
import geminiIcon from "@/assets/provider-icons/gemini.png";
import glmIcon from "@/assets/provider-icons/glm.png";
import kimiIcon from "@/assets/provider-icons/kimi.png";
import minimaxIcon from "@/assets/provider-icons/minimax.png";
import ollamaIcon from "@/assets/provider-icons/ollama.png";
import openaiIcon from "@/assets/provider-icons/openai.png";
import openrouterIcon from "@/assets/provider-icons/openrouter.png";
import qwenIcon from "@/assets/provider-icons/qwen.png";
import siliconflowIcon from "@/assets/provider-icons/siliconflow.png";
import vercelIcon from "@/assets/provider-icons/vercel.png";

export type AIProviderConfig = {
  url: string;
  apiKey: string;
  model: string;
  azureApiVersion?: string;
};

export type AIProviderConfigs = Record<string, AIProviderConfig>;

export type AIProviderDefinition = {
  id: string;
  name: string;
  url: string;
  models: string[];
  iconUrl: string;
};

export const DEFAULT_AI_PROVIDER_ID = "openai";
export const DEFAULT_AZURE_API_VERSION = "2024-02-15-preview";
export const AI_CURRENT_PROVIDER_STORAGE_KEY = "AI_CURRENT_PROVIDER";
export const AI_PROVIDER_CONFIGS_STORAGE_KEY = "AI_PROVIDER_CONFIGS";
export const LEGACY_AI_STORAGE_KEYS = [
  "AI_PROVIDER",
  "AI_API_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "AZURE_API_VERSION",
] as const;

const AZURE_LEGACY_DEPLOYMENT_PATH_PATTERN =
  /^(.*\/openai)\/deployments\/([^/]+)(?:\/.*)?$/i;

export const PROVIDER_ICON_URLS = {
  openai: openaiIcon,
  claude: claudeIcon,
  gemini: geminiIcon,
  deepseek: deepseekIcon,
  qwen: qwenIcon,
  kimi: kimiIcon,
  glm: glmIcon,
  minimax: minimaxIcon,
  openrouter: openrouterIcon,
  siliconflow: siliconflowIcon,
  vercel: vercelIcon,
  azure: azureIcon,
  ollama: ollamaIcon,
  custom: customIcon,
} as const satisfies Record<string, string>;

export const PROVIDERS: AIProviderDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    url: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    iconUrl: PROVIDER_ICON_URLS.openai,
  },
  {
    id: "claude",
    name: "Anthropic (Claude)",
    url: "https://api.anthropic.com/v1",
    models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
    iconUrl: PROVIDER_ICON_URLS.claude,
  },
  {
    id: "gemini",
    name: "Google (Gemini)",
    url: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    iconUrl: PROVIDER_ICON_URLS.gemini,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
    iconUrl: PROVIDER_ICON_URLS.deepseek,
  },
  {
    id: "qwen",
    name: "Aliyun (Qwen)",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"],
    iconUrl: PROVIDER_ICON_URLS.qwen,
  },
  {
    id: "kimi",
    name: "Moonshot (Kimi)",
    url: "https://api.moonshot.ai/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k"],
    iconUrl: PROVIDER_ICON_URLS.kimi,
  },
  {
    id: "glm",
    name: "Zhipu (GLM)",
    url: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-flash"],
    iconUrl: PROVIDER_ICON_URLS.glm,
  },
  {
    id: "minimax",
    name: "MiniMax",
    url: "https://api.minimax.io/anthropic",
    models: ["minimax-text-01", "minimax-text-01v", "abab6.5s-chat"],
    iconUrl: PROVIDER_ICON_URLS.minimax,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    models: [],
    iconUrl: PROVIDER_ICON_URLS.openrouter,
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    url: "https://api.siliconflow.cn/v1",
    models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    iconUrl: PROVIDER_ICON_URLS.siliconflow,
  },
  {
    id: "vercel",
    name: "Vercel AI Gateway",
    url: "https://ai-gateway.vercel.sh/v3/ai",
    models: [
      "openai/gpt-5-mini",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-v3",
    ],
    iconUrl: PROVIDER_ICON_URLS.vercel,
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    url: "https://YOUR_RESOURCE_NAME.openai.azure.com/openai",
    models: ["gpt-4o", "gpt-4o-mini"],
    iconUrl: PROVIDER_ICON_URLS.azure,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    url: "http://127.0.0.1:11434/api",
    models: ["llama3", "qwen2", "mistral"],
    iconUrl: PROVIDER_ICON_URLS.ollama,
  },
  {
    id: "custom",
    name: "Custom",
    url: "",
    models: [],
    iconUrl: PROVIDER_ICON_URLS.custom,
  },
];

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AzureUrlMigrationResult = {
  baseUrl: string;
  deploymentName: string | null;
};

export function extractAzureConfigFromUrl(url: string): AzureUrlMigrationResult | null {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const match = parsedUrl.pathname.match(AZURE_LEGACY_DEPLOYMENT_PATH_PATTERN);
    if (!match) {
      return null;
    }

    parsedUrl.pathname = match[1];
    parsedUrl.search = "";
    parsedUrl.hash = "";

    return {
      baseUrl: parsedUrl.toString().replace(/\/$/, ""),
      deploymentName: decodeURIComponent(match[2] ?? ""),
    };
  } catch {
    return null;
  }
}

export function getProviderById(providerId: string): AIProviderDefinition {
  return PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0];
}

export function isKnownProviderId(providerId: string | null | undefined): providerId is string {
  return !!providerId && PROVIDERS.some((provider) => provider.id === providerId);
}

export function getDefaultProviderConfig(providerId: string): AIProviderConfig {
  const provider = getProviderById(providerId);
  const defaultConfig: AIProviderConfig = {
    url: provider.url,
    apiKey: "",
    model: provider.models[0] ?? "",
  };

  if (provider.id === "azure") {
    defaultConfig.azureApiVersion = DEFAULT_AZURE_API_VERSION;
  }

  return defaultConfig;
}

export function normalizeProviderConfig(
  providerId: string,
  value?: Partial<AIProviderConfig> | null,
): AIProviderConfig {
  const defaults = getDefaultProviderConfig(providerId);
  const normalizedUrl = normalizeString(value?.url, defaults.url);
  const normalizedApiKey = normalizeString(value?.apiKey, defaults.apiKey);
  const normalizedModel = normalizeString(value?.model, defaults.model);

  if (providerId !== "azure") {
    return {
      url: normalizedUrl,
      apiKey: normalizedApiKey,
      model: normalizedModel,
    };
  }

  const migratedAzureConfig = extractAzureConfigFromUrl(normalizedUrl);
  const provider = getProviderById(providerId);
  const shouldUseLegacyDeploymentName =
    normalizedModel.length === 0 || provider.models.includes(normalizedModel);
  const normalizedAzureUrl = migratedAzureConfig?.baseUrl ?? normalizedUrl;
  const normalizedAzureModel =
    shouldUseLegacyDeploymentName && migratedAzureConfig?.deploymentName
      ? migratedAzureConfig.deploymentName
      : normalizedModel;

  return {
    url: normalizedAzureUrl,
    apiKey: normalizedApiKey,
    model: normalizedAzureModel || defaults.model,
    azureApiVersion: normalizeString(value?.azureApiVersion, defaults.azureApiVersion ?? ""),
  };
}

export function getDefaultProviderConfigs(): AIProviderConfigs {
  return PROVIDERS.reduce<AIProviderConfigs>((configs, provider) => {
    configs[provider.id] = getDefaultProviderConfig(provider.id);
    return configs;
  }, {});
}
