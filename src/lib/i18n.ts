import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import commonEn from "@/locales/en/common.json";
import newsEn from "@/locales/en/news.json";
import sourcesEn from "@/locales/en/sources.json";
import chatEn from "@/locales/en/chat.json";
import creativeEn from "@/locales/en/creative.json";
import settingsEn from "@/locales/en/settings.json";

import commonZh from "@/locales/zh/common.json";
import newsZh from "@/locales/zh/news.json";
import sourcesZh from "@/locales/zh/sources.json";
import chatZh from "@/locales/zh/chat.json";
import creativeZh from "@/locales/zh/creative.json";
import settingsZh from "@/locales/zh/settings.json";

import commonZhTw from "@/locales/zh-TW/common.json";
import newsZhTw from "@/locales/zh-TW/news.json";
import sourcesZhTw from "@/locales/zh-TW/sources.json";
import chatZhTw from "@/locales/zh-TW/chat.json";
import creativeZhTw from "@/locales/zh-TW/creative.json";
import settingsZhTw from "@/locales/zh-TW/settings.json";

import commonJa from "@/locales/ja/common.json";
import newsJa from "@/locales/ja/news.json";
import sourcesJa from "@/locales/ja/sources.json";
import chatJa from "@/locales/ja/chat.json";
import creativeJa from "@/locales/ja/creative.json";
import settingsJa from "@/locales/ja/settings.json";

import commonFr from "@/locales/fr/common.json";
import newsFr from "@/locales/fr/news.json";
import sourcesFr from "@/locales/fr/sources.json";
import chatFr from "@/locales/fr/chat.json";
import creativeFr from "@/locales/fr/creative.json";
import settingsFr from "@/locales/fr/settings.json";

import commonDe from "@/locales/de/common.json";
import newsDe from "@/locales/de/news.json";
import sourcesDe from "@/locales/de/sources.json";
import chatDe from "@/locales/de/chat.json";
import creativeDe from "@/locales/de/creative.json";
import settingsDe from "@/locales/de/settings.json";

import commonIt from "@/locales/it/common.json";
import newsIt from "@/locales/it/news.json";
import sourcesIt from "@/locales/it/sources.json";
import chatIt from "@/locales/it/chat.json";
import creativeIt from "@/locales/it/creative.json";
import settingsIt from "@/locales/it/settings.json";

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
const LANG_PREF_KEY = "i18n-language-preference";

export function getLanguagePreference(): string {
    return localStorage.getItem(LANG_PREF_KEY) || AUTO_DETECT_VALUE;
}

const SUPPORTED_CODES: Set<string> = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

function detectSystemLanguage(): string {
    const nav = navigator.language || "en";
    if (SUPPORTED_CODES.has(nav)) return nav;
    const base = nav.split("-")[0];
    if (SUPPORTED_CODES.has(base)) return base;
    return "en";
}

export function setLanguagePreference(value: string): void {
    localStorage.setItem(LANG_PREF_KEY, value);
    if (value === AUTO_DETECT_VALUE) {
        i18n.changeLanguage(detectSystemLanguage());
    } else {
        i18n.changeLanguage(value);
    }
}

export const DEFAULT_NS = "common";
export const NAMESPACES = ["common", "news", "sources", "chat", "creative", "settings"] as const;

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { common: commonEn, news: newsEn, sources: sourcesEn, chat: chatEn, creative: creativeEn, settings: settingsEn },
            zh: { common: commonZh, news: newsZh, sources: sourcesZh, chat: chatZh, creative: creativeZh, settings: settingsZh },
            "zh-TW": { common: commonZhTw, news: newsZhTw, sources: sourcesZhTw, chat: chatZhTw, creative: creativeZhTw, settings: settingsZhTw },
            ja: { common: commonJa, news: newsJa, sources: sourcesJa, chat: chatJa, creative: creativeJa, settings: settingsJa },
            fr: { common: commonFr, news: newsFr, sources: sourcesFr, chat: chatFr, creative: creativeFr, settings: settingsFr },
            de: { common: commonDe, news: newsDe, sources: sourcesDe, chat: chatDe, creative: creativeDe, settings: settingsDe },
            it: { common: commonIt, news: newsIt, sources: sourcesIt, chat: chatIt, creative: creativeIt, settings: settingsIt },
        },
        fallbackLng: "en",
        defaultNS: DEFAULT_NS,
        ns: NAMESPACES,
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ["localStorage", "navigator"],
            lookupLocalStorage: "i18nextLng",
            caches: ["localStorage"],
        },
    });

i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = lng;
});

document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language ?? "en";

export default i18n;
