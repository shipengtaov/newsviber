export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文简体" },
  { code: "zh-TW", label: "中文繁體" },
  { code: "ja", label: "日本語" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
] as const;

export const AUTO_DETECT_VALUE = "auto";
export const LANGUAGE_PREFERENCE_STORAGE_KEY = "i18n-language-preference";
export const I18NEXT_LANGUAGE_STORAGE_KEY = "i18nextLng";

const SUPPORTED_CODES: Set<string> = new Set(
  SUPPORTED_LANGUAGES.map((language) => language.code),
);

export function normalizeLanguagePreference(value: unknown): string {
  if (value === AUTO_DETECT_VALUE) {
    return AUTO_DETECT_VALUE;
  }

  return typeof value === "string" && SUPPORTED_CODES.has(value)
    ? value
    : AUTO_DETECT_VALUE;
}

export function detectSystemLanguage(): string {
  const nav = navigator.language || "en";
  if (SUPPORTED_CODES.has(nav)) {
    return nav;
  }

  const base = nav.split("-")[0];
  return SUPPORTED_CODES.has(base) ? base : "en";
}

export function resolveLanguagePreference(value: string): string {
  return value === AUTO_DETECT_VALUE ? detectSystemLanguage() : normalizeLanguagePreference(value);
}
