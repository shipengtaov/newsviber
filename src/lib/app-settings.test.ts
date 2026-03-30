import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_CURRENT_PROVIDER_STORAGE_KEY,
  AI_PROVIDER_CONFIGS_STORAGE_KEY,
  DEFAULT_AZURE_API_VERSION,
  getDefaultProviderConfigs,
} from "@/lib/ai-config";
import {
  AppSettingsBootstrapError,
  bootstrapAppSettings,
  getAppSettingsSnapshot,
  readCurrentProviderId,
  readLanguagePreference,
  readProviderConfigs,
  readWebSearchSettings,
  resetAppSettingsForTests,
  saveCurrentProviderId,
  saveLanguagePreference,
  saveProviderConfigs,
  saveWebSearchSettings,
} from "@/lib/app-settings";
import {
  AUTO_DETECT_VALUE,
  I18NEXT_LANGUAGE_STORAGE_KEY,
  LANGUAGE_PREFERENCE_STORAGE_KEY,
} from "@/lib/language-settings";
import { DEFAULT_WEB_SEARCH_SETTINGS } from "@/lib/web-search-config";

type DbRowMap = Map<string, string>;

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

function createDbMock(initialRows?: Record<string, string>) {
  const rows: DbRowMap = new Map(Object.entries(initialRows ?? {}));

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

const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

describe("app settings persistence", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    });
    resetAppSettingsForTests();
    getDbMock.mockReset();
  });

  afterEach(() => {
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("reads defaults when SQLite has no rows", async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db);

    const snapshot = await bootstrapAppSettings();

    expect(snapshot.languagePreference).toBe(AUTO_DETECT_VALUE);
    expect(snapshot.currentProviderId).toBe("openai");
    expect(snapshot.providerConfigs).toEqual(getDefaultProviderConfigs());
    expect(snapshot.webSearchSettings).toEqual(DEFAULT_WEB_SEARCH_SETTINGS);
    expect(getAppSettingsSnapshot()).toEqual(snapshot);
  });

  it("writes and rereads each supported setting while preserving unrelated values", async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db);
    await bootstrapAppSettings();

    await saveLanguagePreference("fr");
    await saveCurrentProviderId("gemini");
    const nextConfigs = readProviderConfigs();
    nextConfigs.gemini = {
      ...nextConfigs.gemini,
      url: "https://example.test/gemini",
      apiKey: "gemini-secret",
      model: "gemini-2.5-pro",
    };
    await saveProviderConfigs(nextConfigs);
    await saveWebSearchSettings({
      provider: "tavily",
      baseUrl: "https://search.example.test",
      apiKey: "tvly-secret",
    });

    expect(readLanguagePreference()).toBe("fr");
    expect(readCurrentProviderId()).toBe("gemini");
    expect(readProviderConfigs().gemini).toEqual({
      url: "https://example.test/gemini",
      apiKey: "gemini-secret",
      model: "gemini-2.5-pro",
    });
    expect(readWebSearchSettings()).toEqual({
      provider: "tavily",
      baseUrl: "https://search.example.test",
      apiKey: "tvly-secret",
    });

    resetAppSettingsForTests();
    getDbMock.mockResolvedValue(db);

    const snapshot = await bootstrapAppSettings();
    expect(snapshot.languagePreference).toBe("fr");
    expect(snapshot.currentProviderId).toBe("gemini");
    expect(snapshot.providerConfigs.gemini).toEqual({
      url: "https://example.test/gemini",
      apiKey: "gemini-secret",
      model: "gemini-2.5-pro",
    });
    expect(snapshot.providerConfigs.openai).toEqual(getDefaultProviderConfigs().openai);
    expect(snapshot.webSearchSettings).toEqual({
      provider: "tavily",
      baseUrl: "https://search.example.test",
      apiKey: "tvly-secret",
    });
  });

  it("migrates structured localStorage settings into SQLite and clears old keys", async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db);

    const storedConfigs = getDefaultProviderConfigs();
    storedConfigs.gemini = {
      ...storedConfigs.gemini,
      url: "https://example.test/gemini",
      apiKey: "gemini-secret",
      model: "gemini-2.5-pro",
    };
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, "de");
    localStorage.setItem(AI_CURRENT_PROVIDER_STORAGE_KEY, "gemini");
    localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(storedConfigs));

    const snapshot = await bootstrapAppSettings();

    expect(snapshot.languagePreference).toBe("de");
    expect(snapshot.currentProviderId).toBe("gemini");
    expect(snapshot.providerConfigs.gemini).toEqual(storedConfigs.gemini);
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(AI_CURRENT_PROVIDER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(AI_PROVIDER_CONFIGS_STORAGE_KEY)).toBeNull();
    expect(db.rows.size).toBe(3);
    expect(snapshot.webSearchSettings).toEqual(DEFAULT_WEB_SEARCH_SETTINGS);
  });

  it("migrates legacy AI settings and detector language into SQLite", async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db);

    localStorage.setItem(I18NEXT_LANGUAGE_STORAGE_KEY, "it");
    localStorage.setItem("AI_PROVIDER", "azure");
    localStorage.setItem(
      "AI_API_URL",
      "https://example-resource.openai.azure.com/openai/deployments/news-copilot",
    );
    localStorage.setItem("AI_API_KEY", "azure-secret");
    localStorage.setItem("AI_MODEL", "gpt-4o");
    localStorage.setItem("AZURE_API_VERSION", "2025-01-01-preview");

    const snapshot = await bootstrapAppSettings();

    expect(snapshot.languagePreference).toBe("it");
    expect(snapshot.currentProviderId).toBe("azure");
    expect(snapshot.providerConfigs.azure).toEqual({
      url: "https://example-resource.openai.azure.com/openai",
      apiKey: "azure-secret",
      model: "news-copilot",
      azureApiVersion: "2025-01-01-preview",
    });
    expect(localStorage.getItem("AI_API_KEY")).toBeNull();
    expect(localStorage.getItem(I18NEXT_LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it("lets existing database values win over browser storage", async () => {
    const db = createDbMock({
      "settings.languagePreference": JSON.stringify("fr"),
      "settings.ai.currentProviderId": JSON.stringify("openai"),
    });
    getDbMock.mockResolvedValue(db);

    const storedConfigs = getDefaultProviderConfigs();
    storedConfigs.gemini = {
      ...storedConfigs.gemini,
      apiKey: "gemini-secret",
      model: "gemini-2.5-pro",
    };
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, "de");
    localStorage.setItem(AI_CURRENT_PROVIDER_STORAGE_KEY, "gemini");
    localStorage.setItem(AI_PROVIDER_CONFIGS_STORAGE_KEY, JSON.stringify(storedConfigs));

    const snapshot = await bootstrapAppSettings();

    expect(snapshot.languagePreference).toBe("fr");
    expect(snapshot.currentProviderId).toBe("openai");
    expect(snapshot.providerConfigs.gemini.apiKey).toBe("gemini-secret");
  });

  it("falls back to defaults when a stored row contains invalid JSON", async () => {
    const db = createDbMock({
      "settings.ai.providerConfigs": "{not-json",
      "settings.ai.currentProviderId": JSON.stringify("gemini"),
      "settings.languagePreference": JSON.stringify("ja"),
    });
    getDbMock.mockResolvedValue(db);

    const snapshot = await bootstrapAppSettings();

    expect(snapshot.languagePreference).toBe("ja");
    expect(snapshot.currentProviderId).toBe("gemini");
    expect(snapshot.providerConfigs).toEqual(getDefaultProviderConfigs());
    expect(snapshot.providerConfigs.azure.azureApiVersion).toBe(DEFAULT_AZURE_API_VERSION);
    expect(snapshot.webSearchSettings).toEqual(DEFAULT_WEB_SEARCH_SETTINGS);
  });

  it("creates the table on demand before reading or writing settings", async () => {
    const db = createDbMock();
    getDbMock.mockResolvedValue(db);

    await bootstrapAppSettings();
    await saveLanguagePreference("de");

    expect(
      db.execute.mock.calls.some(([query]) =>
        String(query).includes("CREATE TABLE IF NOT EXISTS app_settings"),
      ),
    ).toBe(true);
    expect(readLanguagePreference()).toBe("de");
  });

  it("retries transient SQLite read failures during bootstrap", async () => {
    vi.useFakeTimers();

    const db = createDbMock({
      "settings.ai.currentProviderId": JSON.stringify("gemini"),
    });
    db.select
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValueOnce(
        Array.from(db.rows.entries()).map(([key, value]) => ({ key, value })),
      );
    getDbMock.mockResolvedValue(db);

    const snapshotPromise = bootstrapAppSettings();
    await vi.runAllTimersAsync();

    await expect(snapshotPromise).resolves.toMatchObject({
      currentProviderId: "gemini",
    });
    expect(db.select).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws an explicit bootstrap error when persisted settings cannot be loaded", async () => {
    vi.useFakeTimers();

    const db = createDbMock();
    db.select.mockRejectedValue(new Error("database is locked"));
    getDbMock.mockResolvedValue(db);

    const snapshotPromise = bootstrapAppSettings();
    const rejection = expect(snapshotPromise).rejects.toBeInstanceOf(AppSettingsBootstrapError);
    await vi.runAllTimersAsync();

    await rejection;
    expect(getAppSettingsSnapshot()).toEqual({
      languagePreference: AUTO_DETECT_VALUE,
      currentProviderId: "openai",
      providerConfigs: getDefaultProviderConfigs(),
      webSearchSettings: DEFAULT_WEB_SEARCH_SETTINGS,
    });

    vi.useRealTimers();
  });
});
