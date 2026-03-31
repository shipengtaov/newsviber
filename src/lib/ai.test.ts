import { describe, expect, it } from "vitest";
import {
  automationReportSchema,
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

describe("automation report schema", () => {
  it("validates the automation report schema", () => {
    expect(
      automationReportSchema.parse({
        title: "AI News Desk",
        markdown: "## Market pulse\nModel providers are shipping faster.",
      }),
    ).toMatchObject({
      title: "AI News Desk",
      markdown: "## Market pulse\nModel providers are shipping faster.",
    });
  });
});
