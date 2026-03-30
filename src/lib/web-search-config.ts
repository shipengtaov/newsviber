export type WebSearchProvider = "tavily";

export type WebSearchSettings = {
  provider: WebSearchProvider;
  baseUrl: string;
  apiKey: string;
};

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  provider: "tavily",
  baseUrl: "https://api.tavily.com/search",
  apiKey: "",
};

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function normalizeWebSearchSettings(
  value?: Partial<WebSearchSettings> | null,
): WebSearchSettings {
  return {
    provider: "tavily",
    baseUrl: normalizeString(value?.baseUrl, DEFAULT_WEB_SEARCH_SETTINGS.baseUrl),
    apiKey: normalizeString(value?.apiKey, DEFAULT_WEB_SEARCH_SETTINGS.apiKey),
  };
}

export function isWebSearchConfigured(settings: WebSearchSettings): boolean {
  return settings.baseUrl.length > 0 && settings.apiKey.length > 0;
}
