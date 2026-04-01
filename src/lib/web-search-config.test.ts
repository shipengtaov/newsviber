import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_SEARCH_SETTINGS,
  buildTavilySearchUrl,
  normalizeWebSearchBaseUrl,
  normalizeWebSearchSettings,
} from "@/lib/web-search-config";

describe("web search config", () => {
  it("uses the Tavily root URL as the default base URL", () => {
    expect(DEFAULT_WEB_SEARCH_SETTINGS.baseUrl).toBe("https://api.tavily.com");
  });

  it("normalizes Tavily base URLs to the service root", () => {
    expect(normalizeWebSearchBaseUrl("https://api.tavily.com/search")).toBe("https://api.tavily.com");
    expect(normalizeWebSearchBaseUrl("https://api.tavily.com/")).toBe("https://api.tavily.com");
    expect(normalizeWebSearchBaseUrl("https://proxy.example.com/tavily/search")).toBe(
      "https://proxy.example.com/tavily",
    );
  });

  it("normalizes saved settings and trims the API key", () => {
    expect(normalizeWebSearchSettings({
      provider: "tavily",
      baseUrl: " https://api.tavily.com/search/ ",
      apiKey: " tvly-secret ",
    })).toEqual({
      provider: "tavily",
      baseUrl: "https://api.tavily.com",
      apiKey: "tvly-secret",
    });
  });

  it("builds the Tavily search endpoint from the normalized base URL", () => {
    expect(buildTavilySearchUrl("https://api.tavily.com/")).toBe("https://api.tavily.com/search");
    expect(buildTavilySearchUrl("https://proxy.example.com/tavily/search")).toBe(
      "https://proxy.example.com/tavily/search",
    );
  });
});
