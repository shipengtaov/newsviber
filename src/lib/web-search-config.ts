export type WebSearchProvider = "tavily";

export type WebSearchSettings = {
  provider: WebSearchProvider;
  baseUrl: string;
  apiKey: string;
};

const TAVILY_SEARCH_PATH_SUFFIX = "/search";

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  provider: "tavily",
  baseUrl: "https://api.tavily.com",
  apiKey: "",
};

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function normalizeWebSearchBaseUrl(
  value: unknown,
  fallback: string = DEFAULT_WEB_SEARCH_SETTINGS.baseUrl,
): string {
  const normalizedValue = normalizeString(value, fallback);

  if (!normalizedValue) {
    return "";
  }

  const withoutTrailingSlashes = normalizedValue.replace(/\/+$/, "");
  const withoutSearchSuffix = withoutTrailingSlashes.endsWith(TAVILY_SEARCH_PATH_SUFFIX)
    ? withoutTrailingSlashes.slice(0, -TAVILY_SEARCH_PATH_SUFFIX.length)
    : withoutTrailingSlashes;

  return withoutSearchSuffix.replace(/\/+$/, "");
}

export function normalizeWebSearchSettings(
  value?: Partial<WebSearchSettings> | null,
): WebSearchSettings {
  return {
    provider: "tavily",
    baseUrl: normalizeWebSearchBaseUrl(value?.baseUrl),
    apiKey: normalizeString(value?.apiKey, DEFAULT_WEB_SEARCH_SETTINGS.apiKey),
  };
}

export function buildTavilySearchUrl(baseUrl: string): string {
  return `${normalizeWebSearchBaseUrl(baseUrl)}/search`;
}

export function isWebSearchConfigured(settings: WebSearchSettings): boolean {
  return settings.baseUrl.length > 0 && settings.apiKey.length > 0;
}
