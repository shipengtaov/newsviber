import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AI_CURRENT_PROVIDER_STORAGE_KEY,
  AI_PROVIDER_CONFIGS_STORAGE_KEY,
  DEFAULT_AZURE_API_VERSION,
  getDefaultProviderConfigs,
  readCurrentProviderId,
  readStoredProviderConfigs,
  saveCurrentProviderId,
  saveProviderConfig,
} from "@/lib/ai-config";

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

describe("AI provider storage helpers", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
      return;
    }

    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("saves the current provider without changing stored provider configs", () => {
    const initialConfigs = getDefaultProviderConfigs();
    initialConfigs.openai = {
      ...initialConfigs.openai,
      apiKey: "openai-key",
    };

    localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(initialConfigs));

    saveCurrentProviderId("gemini");

    expect(localStorage.getItem(AI_CURRENT_PROVIDER_STORAGE_KEY)).toBe("gemini");
    expect(readStoredProviderConfigs()).toEqual(initialConfigs);
  });

  it("saves only the selected provider config and preserves the active provider", () => {
    const initialConfigs = getDefaultProviderConfigs();

    localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(initialConfigs));
    saveCurrentProviderId("openai");

    saveProviderConfig("gemini", {
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
    expect(storedConfigs.openai).toEqual(initialConfigs.openai);
  });

  it("normalizes Azure config when saving a single provider", () => {
    saveProviderConfig("azure", {
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
});
