import {
  AppSettingsBootstrapError,
  bootstrapAppSettings,
  type AppSettingsSnapshot,
} from "@/lib/app-settings";
import { initializeI18n } from "@/lib/i18n";

export type BootstrapApplicationResult = {
  settings: AppSettingsSnapshot;
  recoveredI18nError: unknown | null;
};

type BootstrapApplicationDependencies = {
  bootstrapSettings?: () => Promise<AppSettingsSnapshot>;
  initializeTranslations?: (languagePreference?: string) => Promise<unknown>;
};

export class AppStartupI18nError extends Error {
  readonly cause?: unknown;
  readonly initialError?: unknown;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      initialError?: unknown;
    },
  ) {
    super(message);
    this.name = "AppStartupI18nError";
    this.cause = options?.cause;
    this.initialError = options?.initialError;
  }
}

export async function bootstrapApplication(
  dependencies: BootstrapApplicationDependencies = {},
): Promise<BootstrapApplicationResult> {
  const loadSettings = dependencies.bootstrapSettings ?? bootstrapAppSettings;
  const initializeTranslations = dependencies.initializeTranslations ?? initializeI18n;

  const settings = await loadSettings();

  try {
    await initializeTranslations(settings.languagePreference);
    return {
      settings,
      recoveredI18nError: null,
    };
  } catch (error) {
    try {
      await initializeTranslations();
      return {
        settings,
        recoveredI18nError: error,
      };
    } catch (fallbackError) {
      throw new AppStartupI18nError("Failed to initialize application translations.", {
        cause: fallbackError,
        initialError: error,
      });
    }
  }
}

export { AppSettingsBootstrapError };
