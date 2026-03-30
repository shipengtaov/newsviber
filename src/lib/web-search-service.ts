import { readWebSearchSettings } from "@/lib/app-settings";
import { runtimeFetch } from "@/lib/runtime-fetch";
import {
  isWebSearchConfigured,
  type WebSearchSettings,
} from "@/lib/web-search-config";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 10;
const MAX_SNIPPET_LENGTH = 600;

type TavilySearchResponse = {
  results?: Array<{
    title?: string | null;
    url?: string | null;
    content?: string | null;
    score?: number | null;
    published_date?: string | null;
  }>;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
  publishedDate: string | null;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

export class WebSearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebSearchUnavailableError";
  }
}

function normalizeMaxResults(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_RESULTS;
  }

  return Math.min(
    MAX_RESULTS_LIMIT,
    Math.max(1, Math.trunc(value ?? DEFAULT_MAX_RESULTS)),
  );
}

function trimSnippet(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, MAX_SNIPPET_LENGTH);
}

function normalizeSearchResults(
  results: TavilySearchResponse["results"],
  maxResults: number,
): WebSearchResult[] {
  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((result) => ({
      title: result.title?.trim() ?? "",
      url: result.url?.trim() ?? "",
      snippet: trimSnippet(result.content),
      score: typeof result.score === "number" ? result.score : null,
      publishedDate: result.published_date?.trim() ?? null,
    }))
    .filter((result) => result.url.length > 0)
    .slice(0, maxResults);
}

export function getWebSearchSettings(): WebSearchSettings {
  return readWebSearchSettings();
}

export function hasConfiguredWebSearch(settings: WebSearchSettings = getWebSearchSettings()): boolean {
  return isWebSearchConfigured(settings);
}

export async function searchWeb(
  input: {
    query: string;
    maxResults?: number;
    settings?: WebSearchSettings;
    abortSignal?: AbortSignal;
  },
): Promise<WebSearchResponse> {
  const query = input.query.trim();
  const settings = input.settings ?? getWebSearchSettings();
  const maxResults = normalizeMaxResults(input.maxResults);

  if (!query) {
    throw new WebSearchUnavailableError("Web search query is required.");
  }

  if (!hasConfiguredWebSearch(settings)) {
    throw new WebSearchUnavailableError("Web search is not configured.");
  }

  const response = await runtimeFetch(settings.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: input.abortSignal,
  });

  if (!response.ok) {
    throw new WebSearchUnavailableError(
      `Web search request failed with status ${response.status}.`,
    );
  }

  let payload: TavilySearchResponse;
  try {
    payload = (await response.json()) as TavilySearchResponse;
  } catch {
    throw new WebSearchUnavailableError("Web search returned invalid JSON.");
  }

  return {
    query,
    results: normalizeSearchResults(payload.results, maxResults),
  };
}
