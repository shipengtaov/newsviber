import { getDb } from "@/lib/db";
import {
  AI_CURRENT_PROVIDER_STORAGE_KEY,
  AI_PROVIDER_CONFIGS_STORAGE_KEY,
  DEFAULT_AI_PROVIDER_ID,
  LEGACY_AI_STORAGE_KEYS,
  type AIProviderConfig,
  type AIProviderConfigs,
  PROVIDERS,
  getDefaultProviderConfigs,
  isKnownProviderId,
  isRecord,
  normalizeProviderConfig,
} from "@/lib/ai-provider-config";
import {
  AUTO_DETECT_VALUE,
  I18NEXT_LANGUAGE_STORAGE_KEY,
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  normalizeLanguagePreference,
} from "@/lib/language-settings";
import {
  DEFAULT_WEB_SEARCH_SETTINGS,
  type WebSearchSettings,
  normalizeWebSearchSettings,
} from "@/lib/web-search-config";

type AppSettingsRow = {
  key: string;
  value: string;
};

type AppSettingsKey =
  | "settings.languagePreference"
  | "settings.ai.currentProviderId"
  | "settings.ai.providerConfigs"
  | "settings.webSearch.config";

export type AppSettingsSnapshot = {
  languagePreference: string;
  currentProviderId: string;
  providerConfigs: AIProviderConfigs;
  webSearchSettings: WebSearchSettings;
};

const APP_SETTING_KEYS = {
  languagePreference: "settings.languagePreference",
  currentProviderId: "settings.ai.currentProviderId",
  providerConfigs: "settings.ai.providerConfigs",
  webSearchSettings: "settings.webSearch.config",
} as const satisfies Record<string, AppSettingsKey>;

const SETTINGS_PAGE_STORAGE_KEYS = [
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  I18NEXT_LANGUAGE_STORAGE_KEY,
  AI_CURRENT_PROVIDER_STORAGE_KEY,
  AI_PROVIDER_CONFIGS_STORAGE_KEY,
  ...LEGACY_AI_STORAGE_KEYS,
] as const;
const APP_SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;
const BOOTSTRAP_READ_RETRY_ATTEMPTS = 3;
const BOOTSTRAP_READ_RETRY_DELAY_MS = 100;

let appSettingsCache = getDefaultAppSettingsSnapshot();
let bootstrapPromise: Promise<AppSettingsSnapshot> | null = null;
let ensureTablePromise: Promise<void> | null = null;

export class AppSettingsBootstrapError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AppSettingsBootstrapError";
    this.cause = options?.cause;
  }
}

function getDefaultAppSettingsSnapshot(): AppSettingsSnapshot {
  return {
    languagePreference: AUTO_DETECT_VALUE,
    currentProviderId: DEFAULT_AI_PROVIDER_ID,
    providerConfigs: getDefaultProviderConfigs(),
    webSearchSettings: DEFAULT_WEB_SEARCH_SETTINGS,
  };
}

function cloneProviderConfigs(providerConfigs: AIProviderConfigs): AIProviderConfigs {
  return PROVIDERS.reduce<AIProviderConfigs>((configs, provider) => {
    configs[provider.id] = { ...providerConfigs[provider.id] };
    return configs;
  }, {});
}

function cloneSnapshot(snapshot: AppSettingsSnapshot): AppSettingsSnapshot {
  return {
    languagePreference: snapshot.languagePreference,
    currentProviderId: snapshot.currentProviderId,
    providerConfigs: cloneProviderConfigs(snapshot.providerConfigs),
    webSearchSettings: { ...snapshot.webSearchSettings },
  };
}

function normalizeCurrentProviderId(value: unknown): string {
  return typeof value === "string" && isKnownProviderId(value)
    ? value
    : DEFAULT_AI_PROVIDER_ID;
}

function normalizeProviderConfigs(value: unknown): AIProviderConfigs {
  if (!isRecord(value)) {
    return getDefaultProviderConfigs();
  }

  return PROVIDERS.reduce<AIProviderConfigs>((configs, provider) => {
    const rawConfig = value[provider.id];
    configs[provider.id] = normalizeProviderConfig(
      provider.id,
      isRecord(rawConfig) ? (rawConfig as Partial<AIProviderConfig>) : undefined,
    );
    return configs;
  }, {});
}

function normalizePersistedWebSearchSettings(value: unknown): WebSearchSettings {
  if (!isRecord(value)) {
    return DEFAULT_WEB_SEARCH_SETTINGS;
  }

  return normalizeWebSearchSettings(value as Partial<WebSearchSettings>);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isMissingAppSettingsTableError(error: unknown): boolean {
  return String(error).includes("no such table: app_settings");
}

function isTransientBootstrapReadError(error: unknown): boolean {
  const message = String(error).toLowerCase();

  return (
    message.includes("database is locked") ||
    message.includes("database is busy") ||
    message.includes("sqlite_busy") ||
    message.includes("sqlite_locked")
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

async function ensureAppSettingsTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      const db = await getDb();
      await db.execute(APP_SETTINGS_TABLE_SQL);
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  return ensureTablePromise;
}

async function withEnsuredAppSettingsTable<T>(operation: () => Promise<T>): Promise<T> {
  await ensureAppSettingsTable();

  try {
    return await operation();
  } catch (error) {
    if (!isMissingAppSettingsTableError(error)) {
      throw error;
    }

    ensureTablePromise = null;
    await ensureAppSettingsTable();
    return operation();
  }
}

async function withRetryableBootstrapRead<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < BOOTSTRAP_READ_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (
        !isTransientBootstrapReadError(error) ||
        attempt === BOOTSTRAP_READ_RETRY_ATTEMPTS - 1
      ) {
        throw error;
      }

      await wait(BOOTSTRAP_READ_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function removeBrowserSettingsStorage(): void {
  if (!hasStorage()) {
    return;
  }

  for (const key of SETTINGS_PAGE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

function readCurrentStorageProviderId(): string | null {
  if (!hasStorage()) {
    return null;
  }

  const rawValue = localStorage.getItem(AI_CURRENT_PROVIDER_STORAGE_KEY);
  return rawValue === null ? null : normalizeCurrentProviderId(rawValue);
}

function readStructuredStorageProviderConfigs(): AIProviderConfigs | null {
  if (!hasStorage()) {
    return null;
  }

  const rawValue = localStorage.getItem(AI_PROVIDER_CONFIGS_STORAGE_KEY);
  if (rawValue === null) {
    return null;
  }

  return normalizeProviderConfigs(parseJson(rawValue));
}

function readLegacyAiStorageSnapshot(): Partial<AppSettingsSnapshot> | null {
  if (!hasStorage()) {
    return null;
  }

  const legacyProviderId = localStorage.getItem("AI_PROVIDER");
  const legacyUrl = localStorage.getItem("AI_API_URL");
  const legacyApiKey = localStorage.getItem("AI_API_KEY");
  const legacyModel = localStorage.getItem("AI_MODEL");
  const legacyAzureApiVersion = localStorage.getItem("AZURE_API_VERSION");
  const hasLegacyStorage = [
    legacyProviderId,
    legacyUrl,
    legacyApiKey,
    legacyModel,
    legacyAzureApiVersion,
  ].some((value) => value !== null);

  if (!hasLegacyStorage) {
    return null;
  }

  const currentProviderId = normalizeCurrentProviderId(legacyProviderId);
  const providerConfigs = getDefaultProviderConfigs();
  providerConfigs[currentProviderId] = normalizeProviderConfig(currentProviderId, {
    url: legacyUrl ?? providerConfigs[currentProviderId].url,
    apiKey: legacyApiKey ?? providerConfigs[currentProviderId].apiKey,
    model: legacyModel ?? providerConfigs[currentProviderId].model,
    azureApiVersion:
      currentProviderId === "azure"
        ? legacyAzureApiVersion ?? providerConfigs[currentProviderId].azureApiVersion
        : undefined,
  });

  return {
    currentProviderId,
    providerConfigs,
  };
}

function readLanguagePreferenceFromStorage(): string | null {
  if (!hasStorage()) {
    return null;
  }

  const explicitPreference = localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
  if (explicitPreference !== null) {
    return normalizeLanguagePreference(explicitPreference);
  }

  const detectorValue = localStorage.getItem(I18NEXT_LANGUAGE_STORAGE_KEY);
  return detectorValue === null ? null : normalizeLanguagePreference(detectorValue);
}

function readStructuredAiStorageSnapshot(): Partial<AppSettingsSnapshot> | null {
  const currentProviderId = readCurrentStorageProviderId();
  const providerConfigs = readStructuredStorageProviderConfigs();

  if (currentProviderId === null && providerConfigs === null) {
    return null;
  }

  return {
    ...(currentProviderId === null ? {} : { currentProviderId }),
    ...(providerConfigs === null ? {} : { providerConfigs }),
  };
}

function parseSnapshotFromRows(
  rows: AppSettingsRow[],
): {
  snapshot: AppSettingsSnapshot;
  hasLanguagePreference: boolean;
  hasCurrentProviderId: boolean;
  hasProviderConfigs: boolean;
  hasWebSearchSettings: boolean;
} {
  const defaults = getDefaultAppSettingsSnapshot();
  const rowMap = new Map(rows.map((row) => [row.key, row.value]));

  const parsedLanguagePreference = parseJson(rowMap.get(APP_SETTING_KEYS.languagePreference) ?? "");
  const languagePreference =
    parsedLanguagePreference === undefined
      ? defaults.languagePreference
      : normalizeLanguagePreference(parsedLanguagePreference);

  const parsedCurrentProviderId = parseJson(rowMap.get(APP_SETTING_KEYS.currentProviderId) ?? "");
  const currentProviderId =
    parsedCurrentProviderId === undefined
      ? defaults.currentProviderId
      : normalizeCurrentProviderId(parsedCurrentProviderId);

  const parsedProviderConfigs = parseJson(rowMap.get(APP_SETTING_KEYS.providerConfigs) ?? "");
  const providerConfigs =
    parsedProviderConfigs === undefined
      ? defaults.providerConfigs
      : normalizeProviderConfigs(parsedProviderConfigs);

  const parsedWebSearchSettings = parseJson(rowMap.get(APP_SETTING_KEYS.webSearchSettings) ?? "");
  const webSearchSettings =
    parsedWebSearchSettings === undefined
      ? defaults.webSearchSettings
      : normalizePersistedWebSearchSettings(parsedWebSearchSettings);

  return {
    snapshot: {
      languagePreference,
      currentProviderId,
      providerConfigs,
      webSearchSettings,
    },
    hasLanguagePreference: parsedLanguagePreference !== undefined,
    hasCurrentProviderId: parsedCurrentProviderId !== undefined,
    hasProviderConfigs: parsedProviderConfigs !== undefined,
    hasWebSearchSettings: parsedWebSearchSettings !== undefined,
  };
}

async function writeSetting(key: AppSettingsKey, value: unknown): Promise<void> {
  await withEnsuredAppSettingsTable(async () => {
    const db = await getDb();
    await db.execute(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)],
    );
  });
}

async function loadRows(): Promise<AppSettingsRow[]> {
  return withRetryableBootstrapRead(() =>
    withEnsuredAppSettingsTable(async () => {
      const db = await getDb();
      return (await db.select("SELECT key, value FROM app_settings")) as AppSettingsRow[];
    }),
  );
}

export function resetAppSettingsForTests(): void {
  appSettingsCache = getDefaultAppSettingsSnapshot();
  bootstrapPromise = null;
  ensureTablePromise = null;
}

export async function bootstrapAppSettings(): Promise<AppSettingsSnapshot> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const rows = await loadRows();
      const parsed = parseSnapshotFromRows(rows);
      const snapshot = await migrateBrowserSettingsIfNeeded(parsed.snapshot, {
        hasLanguagePreference: parsed.hasLanguagePreference,
        hasCurrentProviderId: parsed.hasCurrentProviderId,
        hasProviderConfigs: parsed.hasProviderConfigs,
        hasWebSearchSettings: parsed.hasWebSearchSettings,
      });

      appSettingsCache = cloneSnapshot(snapshot);
      return cloneSnapshot(appSettingsCache);
    })().catch((error) => {
      bootstrapPromise = null;

      if (error instanceof AppSettingsBootstrapError) {
        throw error;
      }

      throw new AppSettingsBootstrapError(
        "Failed to load persisted application settings from SQLite.",
        { cause: error },
      );
    });
  }

  return bootstrapPromise;
}

export function getAppSettingsSnapshot(): AppSettingsSnapshot {
  return cloneSnapshot(appSettingsCache);
}

export function readLanguagePreference(): string {
  return appSettingsCache.languagePreference;
}

export function readCurrentProviderId(): string {
  return appSettingsCache.currentProviderId;
}

export function readProviderConfigs(): AIProviderConfigs {
  return cloneProviderConfigs(appSettingsCache.providerConfigs);
}

export function readWebSearchSettings(): WebSearchSettings {
  return { ...appSettingsCache.webSearchSettings };
}

export async function saveLanguagePreference(value: string): Promise<void> {
  const normalizedValue = normalizeLanguagePreference(value);
  await writeSetting(APP_SETTING_KEYS.languagePreference, normalizedValue);
  appSettingsCache = {
    ...appSettingsCache,
    languagePreference: normalizedValue,
  };
}

export async function saveCurrentProviderId(value: string): Promise<void> {
  const normalizedValue = normalizeCurrentProviderId(value);
  await writeSetting(APP_SETTING_KEYS.currentProviderId, normalizedValue);
  appSettingsCache = {
    ...appSettingsCache,
    currentProviderId: normalizedValue,
  };
}

export async function saveProviderConfigs(value: AIProviderConfigs): Promise<void> {
  const normalizedValue = normalizeProviderConfigs(value);
  await writeSetting(APP_SETTING_KEYS.providerConfigs, normalizedValue);
  appSettingsCache = {
    ...appSettingsCache,
    providerConfigs: normalizedValue,
  };
}

export async function saveWebSearchSettings(value: WebSearchSettings): Promise<void> {
  const normalizedValue = normalizeWebSearchSettings(value);
  await writeSetting(APP_SETTING_KEYS.webSearchSettings, normalizedValue);
  appSettingsCache = {
    ...appSettingsCache,
    webSearchSettings: normalizedValue,
  };
}
async function migrateBrowserSettingsIfNeeded(
  snapshot: AppSettingsSnapshot,
  presence: {
    hasLanguagePreference: boolean;
    hasCurrentProviderId: boolean;
    hasProviderConfigs: boolean;
    hasWebSearchSettings: boolean;
  },
): Promise<AppSettingsSnapshot> {
  const migratedSnapshot = cloneSnapshot(snapshot);
  const storageLanguagePreference =
    presence.hasLanguagePreference ? null : readLanguagePreferenceFromStorage();

  const storageAiSnapshot = presence.hasCurrentProviderId && presence.hasProviderConfigs
    ? null
    : readStructuredAiStorageSnapshot() ?? readLegacyAiStorageSnapshot();

  const pendingWrites: Array<Promise<void>> = [];

  if (storageLanguagePreference !== null) {
    migratedSnapshot.languagePreference = storageLanguagePreference;
    pendingWrites.push(writeSetting(APP_SETTING_KEYS.languagePreference, storageLanguagePreference));
  }

  if (!presence.hasCurrentProviderId && storageAiSnapshot?.currentProviderId) {
    migratedSnapshot.currentProviderId = storageAiSnapshot.currentProviderId;
    pendingWrites.push(
      writeSetting(APP_SETTING_KEYS.currentProviderId, storageAiSnapshot.currentProviderId),
    );
  }

  if (!presence.hasProviderConfigs && storageAiSnapshot?.providerConfigs) {
    migratedSnapshot.providerConfigs = cloneProviderConfigs(storageAiSnapshot.providerConfigs);
    pendingWrites.push(
      writeSetting(APP_SETTING_KEYS.providerConfigs, storageAiSnapshot.providerConfigs),
    );
  }

  if (!presence.hasWebSearchSettings) {
    migratedSnapshot.webSearchSettings = { ...DEFAULT_WEB_SEARCH_SETTINGS };
  }

  if (pendingWrites.length === 0) {
    return migratedSnapshot;
  }

  await Promise.all(pendingWrites);
  removeBrowserSettingsStorage();
  return migratedSnapshot;
}
