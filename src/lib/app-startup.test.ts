import { describe, expect, it, vi } from "vitest";
import {
  AppSettingsBootstrapError,
  AppStartupI18nError,
  bootstrapApplication,
} from "@/lib/app-startup";
import { getDefaultProviderConfigs } from "@/lib/ai-config";
import { DEFAULT_WEB_SEARCH_SETTINGS } from "@/lib/web-search-config";

const persistedSettings = {
  languagePreference: "fr",
  currentProviderId: "gemini",
  providerConfigs: getDefaultProviderConfigs(),
  webSearchSettings: DEFAULT_WEB_SEARCH_SETTINGS,
};

describe("application bootstrap", () => {
  it("stops startup when persisted settings cannot be loaded", async () => {
    const initializeTranslations = vi.fn();

    await expect(
      bootstrapApplication({
        bootstrapSettings: async () => {
          throw new AppSettingsBootstrapError("Failed to load persisted settings.");
        },
        initializeTranslations,
      }),
    ).rejects.toBeInstanceOf(AppSettingsBootstrapError);

    expect(initializeTranslations).not.toHaveBeenCalled();
  });

  it("falls back to default i18n initialization after a persisted-language failure", async () => {
    const initializeTranslations = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing persisted locale"))
      .mockResolvedValueOnce(undefined);

    const result = await bootstrapApplication({
      bootstrapSettings: async () => persistedSettings,
      initializeTranslations,
    });

    expect(result.settings).toEqual(persistedSettings);
    expect(result.recoveredI18nError).toBeInstanceOf(Error);
    expect(initializeTranslations).toHaveBeenNthCalledWith(1, "fr");
    expect(initializeTranslations).toHaveBeenNthCalledWith(2);
  });

  it("surfaces a dedicated startup error when i18n fallback also fails", async () => {
    const initializeTranslations = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing persisted locale"))
      .mockRejectedValueOnce(new Error("fallback i18n failed"));

    await expect(
      bootstrapApplication({
        bootstrapSettings: async () => persistedSettings,
        initializeTranslations,
      }),
    ).rejects.toBeInstanceOf(AppStartupI18nError);

    expect(initializeTranslations).toHaveBeenCalledTimes(2);
  });
});
