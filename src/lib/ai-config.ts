import {
  type AIProviderConfig,
  type AIProviderConfigs,
  type AIProviderDefinition,
  AI_CURRENT_PROVIDER_STORAGE_KEY,
  AI_PROVIDER_CONFIGS_STORAGE_KEY,
  DEFAULT_AI_PROVIDER_ID,
  DEFAULT_AZURE_API_VERSION,
  PROVIDER_ICON_URLS,
  PROVIDERS,
  extractAzureConfigFromUrl,
  getDefaultProviderConfig,
  getDefaultProviderConfigs,
  getProviderById,
  isKnownProviderId,
  normalizeProviderConfig,
} from "@/lib/ai-provider-config";
import {
  readCurrentProviderId as readCurrentProviderIdFromCache,
  readProviderConfigs,
  saveCurrentProviderId as saveCurrentProviderIdToCache,
  saveProviderConfigs,
} from "@/lib/app-settings";

function normalizeProviderConfigs(providerConfigs: AIProviderConfigs): AIProviderConfigs {
  return PROVIDERS.reduce<AIProviderConfigs>((configs, provider) => {
    configs[provider.id] = normalizeProviderConfig(provider.id, providerConfigs[provider.id]);
    return configs;
  }, {});
}

export function readCurrentProviderId(): string {
  return readCurrentProviderIdFromCache();
}

export function readStoredProviderConfigs(): AIProviderConfigs {
  return readProviderConfigs();
}

export async function saveCurrentProviderId(currentProviderId: string): Promise<void> {
  await saveCurrentProviderIdToCache(currentProviderId);
}

export async function saveProviderConfig(
  providerId: string,
  providerConfig: Partial<AIProviderConfig> | null | undefined,
): Promise<void> {
  const normalizedProviderId = isKnownProviderId(providerId) ? providerId : DEFAULT_AI_PROVIDER_ID;
  const storedConfigs = readStoredProviderConfigs();
  const normalizedConfigs = normalizeProviderConfigs({
    ...storedConfigs,
    [normalizedProviderId]: normalizeProviderConfig(normalizedProviderId, providerConfig),
  });

  await saveProviderConfigs(normalizedConfigs);
}

export function getActiveAIProviderSettings() {
  const providerId = readCurrentProviderId();
  const provider = getProviderById(providerId);
  const configs = readStoredProviderConfigs();

  return {
    providerId,
    provider,
    config: configs[providerId] ?? getDefaultProviderConfig(providerId),
  };
}

export type {
  AIProviderConfig,
  AIProviderConfigs,
  AIProviderDefinition,
};

export {
  AI_CURRENT_PROVIDER_STORAGE_KEY,
  AI_PROVIDER_CONFIGS_STORAGE_KEY,
  DEFAULT_AI_PROVIDER_ID,
  DEFAULT_AZURE_API_VERSION,
  PROVIDER_ICON_URLS,
  PROVIDERS,
  extractAzureConfigFromUrl,
  getDefaultProviderConfig,
  getDefaultProviderConfigs,
  getProviderById,
  isKnownProviderId,
  normalizeProviderConfig,
};
