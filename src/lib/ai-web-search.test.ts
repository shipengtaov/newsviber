import { afterEach, describe, expect, it, vi } from "vitest";

const {
  generateTextMock,
  getActiveAIProviderSettingsMock,
  hasConfiguredWebSearchMock,
  streamTextMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  getActiveAIProviderSettingsMock: vi.fn(() => ({
    providerId: "openai",
    provider: {
      id: "openai",
      name: "MockAI",
      url: "https://api.openai.com/v1",
      models: ["gpt-4o"],
      iconUrl: "",
    },
    config: {
      url: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o",
    },
  })),
  hasConfiguredWebSearchMock: vi.fn(() => true),
  streamTextMock: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  class ToolLoopAgentMock {
    private settings: Record<string, unknown>;

    constructor(settings: Record<string, unknown>) {
      this.settings = settings;
    }

    get tools() {
      return this.settings.tools ?? {};
    }

    async stream(options: Record<string, unknown>) {
      return streamTextMock({
        ...this.settings,
        ...options,
      });
    }
  }

  return {
    ...actual,
    generateText: generateTextMock,
    streamText: streamTextMock,
    ToolLoopAgent: ToolLoopAgentMock,
  };
});

vi.mock("@/lib/ai-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai-config")>("@/lib/ai-config");

  return {
    ...actual,
    getActiveAIProviderSettings: getActiveAIProviderSettingsMock,
  };
});

vi.mock("@/lib/web-search-service", () => ({
  hasConfiguredWebSearch: hasConfiguredWebSearchMock,
  searchWeb: vi.fn(),
  WebSearchUnavailableError: class WebSearchUnavailableError extends Error {},
}));

import { generateAutomationReportDraft, streamConversation } from "@/lib/ai";

function textDelta(text: string) {
  return {
    type: "text-delta" as const,
    id: "text-1",
    text,
  };
}

afterEach(() => {
  generateTextMock.mockReset();
  getActiveAIProviderSettingsMock.mockClear();
  hasConfiguredWebSearchMock.mockReset();
  hasConfiguredWebSearchMock.mockReturnValue(true);
  streamTextMock.mockReset();
});

describe("AI web search fallback", () => {
  it("retries automation report generation without web search after a tool failure", async () => {
    generateTextMock
      .mockResolvedValueOnce({
        output: {
          title: "Ignored",
          markdown: "Ignored",
        },
        steps: [{
          content: [{
            type: "tool-error",
            toolName: "web_search",
            toolCallId: "tool-1",
            input: { query: "latest ai" },
            error: new Error("search failed"),
          }],
        }],
      })
      .mockResolvedValueOnce({
        output: {
          title: "Recovered",
          markdown: "## Summary",
        },
        steps: [{
          content: [],
        }],
      });

    await expect(generateAutomationReportDraft({
      prompt: "Summarize the latest AI news.",
      enableWebSearch: true,
    })).resolves.toEqual({
      title: "Recovered",
      markdown: "## Summary",
    });

    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(generateTextMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      tools: expect.objectContaining({
        web_search: expect.any(Object),
      }),
    }));
    expect(generateTextMock.mock.calls[1]?.[0]).not.toHaveProperty("tools");
  });

  it("skips attaching tools when web search is not configured", async () => {
    hasConfiguredWebSearchMock.mockReturnValue(false);
    generateTextMock.mockResolvedValue({
      output: {
        title: "Summary",
        markdown: "## Summary",
      },
      steps: [{
        content: [],
      }],
    });

    await generateAutomationReportDraft({
      prompt: "Summarize the latest AI news.",
      enableWebSearch: true,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0]?.[0]).not.toHaveProperty("tools");
  });

  it("retries streaming conversation without web search after a tool error chunk", async () => {
    streamTextMock
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield {
            type: "tool-error" as const,
            toolName: "web_search",
            toolCallId: "tool-1",
            input: { query: "latest ai" },
            error: new Error("search failed"),
          };
        })(),
        text: Promise.resolve(""),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield textDelta("Recovered answer");
        })(),
        text: Promise.resolve("Recovered answer"),
      }));

    const chunks: string[] = [];
    await expect(streamConversation(
      [{ role: "user", content: "What changed this week?" }],
      (chunk) => {
        chunks.push(chunk);
      },
      undefined,
      { enableWebSearch: true },
    )).resolves.toBe("Recovered answer");

    expect(chunks).toEqual(["Recovered answer"]);
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(streamTextMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      tools: expect.objectContaining({
        web_search: expect.any(Object),
      }),
    }));
    expect(streamTextMock.mock.calls[1]?.[0]).not.toHaveProperty("tools");
  });

  it("notifies the caller before retrying a streamed answer without web search", async () => {
    const onRetryWithoutWebSearch = vi.fn();

    streamTextMock
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield textDelta("Partial answer");
          yield {
            type: "tool-error" as const,
            toolName: "web_search",
            toolCallId: "tool-1",
            input: { query: "openclaw" },
            error: new Error("search failed"),
          };
        })(),
        text: Promise.resolve("Partial answer"),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield textDelta("Recovered answer");
        })(),
        text: Promise.resolve("Recovered answer"),
      }));

    await expect(streamConversation(
      [{ role: "user", content: "What is OpenClaw?" }],
      vi.fn(),
      undefined,
      { enableWebSearch: true, onRetryWithoutWebSearch },
    )).resolves.toBe("Recovered answer");

    expect(onRetryWithoutWebSearch).toHaveBeenCalledTimes(1);
  });

  it("retries a streamed answer without custom tools when the provider rejects tool calling", async () => {
    streamTextMock
      .mockRejectedValueOnce(new Error("This model does not support tools"))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield textDelta("Recovered answer");
        })(),
        text: Promise.resolve("Recovered answer"),
      }));

    const customTool = {
      lookup_article: {
        description: "Lookup article details",
        inputSchema: {
          type: "object",
        },
      },
    } as any;
    const onRetryWithoutTools = vi.fn();

    await expect(streamConversation(
      [{ role: "user", content: "Tell me more" }],
      vi.fn(),
      undefined,
      {
        tools: customTool,
        onRetryWithoutTools,
      },
    )).resolves.toBe("Recovered answer");

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(streamTextMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      tools: expect.objectContaining({
        lookup_article: expect.any(Object),
      }),
    }));
    expect(streamTextMock.mock.calls[1]?.[0]).not.toHaveProperty("tools");
    expect(onRetryWithoutTools).toHaveBeenCalledTimes(1);
  });
});
