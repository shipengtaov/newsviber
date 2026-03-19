import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AZURE_API_VERSION,
  PROVIDERS,
  PROVIDER_ICON_URLS,
  readCurrentProviderId,
  readStoredProviderConfigs,
  saveCurrentProviderId,
  saveProviderConfig,
} from "@/lib/ai-config";
import {
  bootstrapAppSettings,
  resetAppSettingsForTests,
} from "@/lib/app-settings";

function createDbMock(initialRows?: Record<string, string>) {
  const rows = new Map(Object.entries(initialRows ?? {}));

  return {
    rows,
    select: vi.fn(async () =>
      Array.from(rows.entries()).map(([key, value]) => ({ key, value })),
    ),
    execute: vi.fn(async (query: string, params?: unknown[]) => {
      if (query.includes("CREATE TABLE IF NOT EXISTS app_settings")) {
        return;
      }

      const [key, value] = (params ?? []) as [string, string];
      rows.set(key, value);
    }),
  };
}

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

describe("AI provider storage helpers", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    getDbMock.mockResolvedValue(createDbMock());
    resetAppSettingsForTests();
  });

  it("saves the current provider without changing stored provider configs", async () => {
    await bootstrapAppSettings();
    await saveProviderConfig("openai", {
      apiKey: "openai-key",
    });

    await saveCurrentProviderId("gemini");

    expect(readCurrentProviderId()).toBe("gemini");
    expect(readStoredProviderConfigs().openai.apiKey).toBe("openai-key");
  });

  it("saves only the selected provider config and preserves the active provider", async () => {
    await bootstrapAppSettings();
    await saveCurrentProviderId("openai");

    await saveProviderConfig("gemini", {
      url: " https://example.test/gemini ",
      apiKey: " gemini-secret ",
      model: " gemini-2.5-pro ",
    });

    const storedConfigs = readStoredProviderConfigs();

    expect(readCurrentProviderId()).toBe("openai");
    expect(storedConfigs.gemini).toEqual({
      url: "https://example.test/gemini",
      apiKey: "gemini-secret",
      model: "gemini-2.5-pro",
    });
    expect(storedConfigs.openai.apiKey).toBe("");
  });

  it("normalizes Azure config when saving a single provider", async () => {
    await bootstrapAppSettings();
    await saveProviderConfig("azure", {
      url: "https://example-resource.openai.azure.com/openai/deployments/news-copilot",
      model: "gpt-4o",
    });

    expect(readStoredProviderConfigs().azure).toEqual({
      url: "https://example-resource.openai.azure.com/openai",
      apiKey: "",
      model: "news-copilot",
      azureApiVersion: DEFAULT_AZURE_API_VERSION,
    });
  });

  it("keeps provider icons in a complete local asset mapping", () => {
    expect(Object.keys(PROVIDER_ICON_URLS).sort()).toEqual(PROVIDERS.map(({ id }) => id).sort());
  });

  it("uses only local assets for provider icons", () => {
    for (const provider of PROVIDERS) {
      expect(provider.iconUrl).toBeTruthy();
      expect(provider.iconUrl).not.toMatch(/^https?:\/\//);
      expect(provider.iconUrl).toMatch(/\.png$/);
    }
  });
});
