import { afterEach, describe, expect, it, vi } from "vitest";

const {
  readWebSearchSettingsMock,
  runtimeFetchMock,
} = vi.hoisted(() => ({
  readWebSearchSettingsMock: vi.fn(),
  runtimeFetchMock: vi.fn(),
}));

vi.mock("@/lib/app-settings", () => ({
  readWebSearchSettings: readWebSearchSettingsMock,
}));

vi.mock("@/lib/runtime-fetch", () => ({
  runtimeFetch: runtimeFetchMock,
}));

import {
  hasConfiguredWebSearch,
  searchWeb,
  WebSearchUnavailableError,
} from "@/lib/web-search-service";

afterEach(() => {
  readWebSearchSettingsMock.mockReset();
  runtimeFetchMock.mockReset();
});

describe("web search service", () => {
  it("normalizes Tavily results and calls the Tavily search endpoint", async () => {
    readWebSearchSettingsMock.mockReturnValue({
      provider: "tavily",
      baseUrl: "https://api.tavily.com",
      apiKey: "tvly-test-key",
    });
    runtimeFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        results: [{
          title: " Latest AI update ",
          url: "https://example.com/ai-update",
          content: "  Fresh context from the web.  ",
          score: 0.92,
          published_date: "2026-03-29",
        }],
      }),
    });

    await expect(searchWeb({ query: " latest ai ", maxResults: 3 })).resolves.toEqual({
      query: "latest ai",
      results: [{
        title: "Latest AI update",
        url: "https://example.com/ai-update",
        snippet: "Fresh context from the web.",
        score: 0.92,
        publishedDate: "2026-03-29",
      }],
    });

    expect(runtimeFetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tvly-test-key",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("avoids duplicating the Tavily search path for legacy base URLs", async () => {
    runtimeFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ results: [] }),
    });

    await expect(searchWeb({
      query: "ai agents",
      settings: {
        provider: "tavily",
        baseUrl: "https://proxy.example.com/tavily/search/",
        apiKey: "tvly-test-key",
      },
    })).resolves.toEqual({
      query: "ai agents",
      results: [],
    });

    expect(runtimeFetchMock).toHaveBeenCalledWith(
      "https://proxy.example.com/tavily/search",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("reports the service as unavailable when settings are missing", async () => {
    readWebSearchSettingsMock.mockReturnValue({
      provider: "tavily",
      baseUrl: "",
      apiKey: "",
    });

    expect(hasConfiguredWebSearch()).toBe(false);
    await expect(searchWeb({ query: "ai agents" })).rejects.toBeInstanceOf(WebSearchUnavailableError);
    expect(runtimeFetchMock).not.toHaveBeenCalled();
  });
});
