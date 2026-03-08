import { describe, expect, it } from "vitest";
import {
  creativeReportSchema,
  formatCreativeReportMarkdown,
  normalizeProviderModelId,
  resolveProviderFlavor,
} from "@/lib/ai";
import {
  DEFAULT_AZURE_API_VERSION,
  extractAzureConfigFromUrl,
  normalizeProviderConfig,
} from "@/lib/ai-config";

describe("AI provider helpers", () => {
  it("extracts Azure legacy deployment URLs into a base URL and deployment name", () => {
    expect(
      extractAzureConfigFromUrl(
        "https://example-resource.openai.azure.com/openai/deployments/news-copilot/",
      ),
    ).toEqual({
      baseUrl: "https://example-resource.openai.azure.com/openai",
      deploymentName: "news-copilot",
    });
  });

  it("migrates Azure legacy config into deployment-based settings", () => {
    expect(
      normalizeProviderConfig("azure", {
        url: "https://example-resource.openai.azure.com/openai/deployments/news-copilot",
        model: "gpt-4o",
      }),
    ).toEqual({
      url: "https://example-resource.openai.azure.com/openai",
      apiKey: "",
      model: "news-copilot",
      azureApiVersion: DEFAULT_AZURE_API_VERSION,
    });
  });

  it("keeps an explicit Azure deployment name when already configured", () => {
    expect(
      normalizeProviderConfig("azure", {
        url: "https://example-resource.openai.azure.com/openai/deployments/news-copilot",
        model: "editorial-assistant",
      }),
    ).toMatchObject({
      url: "https://example-resource.openai.azure.com/openai",
      model: "editorial-assistant",
    });
  });

  it("resolves dedicated and fallback provider flavors", () => {
    expect(resolveProviderFlavor("deepseek", { url: "https://api.deepseek.com" })).toBe("deepseek");
    expect(resolveProviderFlavor("custom", { url: "http://localhost:1234/v1" })).toBe("openai-compatible");
    expect(resolveProviderFlavor("minimax", { url: "https://api.minimax.io/anthropic/v1" })).toBe("minimax-anthropic");
    expect(resolveProviderFlavor("minimax", { url: "https://api.minimax.io/v1" })).toBe("minimax-openai");
  });

  it("normalizes common bare model IDs for Vercel AI Gateway", () => {
    expect(normalizeProviderModelId("vercel", "gpt-4o")).toBe("openai/gpt-4o");
    expect(normalizeProviderModelId("vercel", "claude-sonnet-4")).toBe("anthropic/claude-sonnet-4");
    expect(normalizeProviderModelId("vercel", "gemini-2.5-flash")).toBe("google/gemini-2.5-flash");
    expect(normalizeProviderModelId("vercel", "openai/gpt-4o")).toBe("openai/gpt-4o");
  });

  it("rejects unsupported bare model IDs for Vercel AI Gateway", () => {
    expect(() => normalizeProviderModelId("vercel", "my-custom-model")).toThrow(
      "Vercel AI Gateway model must include a provider prefix",
    );
  });
});

describe("Creative report formatting", () => {
  it("validates the creative report schema", () => {
    expect(
      creativeReportSchema.parse({
        title: "AI News Desk",
        signals: "Model providers are shipping faster.",
        interpretation: "Competition is compressing release cycles.",
        ideas: "Package niche daily digests for product teams.",
        counterpoints: "Signal quality can decay during hype spikes.",
        next_actions: "Interview three teams that already monitor this space.",
      }),
    ).toMatchObject({
      title: "AI News Desk",
      next_actions: "Interview three teams that already monitor this space.",
    });
  });

  it("formats a structured creative report as markdown", () => {
    const markdown = formatCreativeReportMarkdown({
      title: "AI News Desk",
      signals: "Model providers are shipping faster.",
      interpretation: "Competition is compressing release cycles.",
      ideas: "Package niche daily digests for product teams.",
      counterpoints: "Signal quality can decay during hype spikes.",
      next_actions: "Interview three teams that already monitor this space.",
    });

    expect(markdown).toContain("# AI News Desk");
    expect(markdown).toContain("## Key Signals");
    expect(markdown).toContain("## Next Actions");
  });
});
