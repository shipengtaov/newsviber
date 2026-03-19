import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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
import {
    AUTO_DETECT_VALUE,
    SUPPORTED_LANGUAGES,
    normalizeLanguagePreference,
    resolveLanguagePreference,
} from "@/lib/language-settings";
import {
    readLanguagePreference as readPersistedLanguagePreference,
    saveLanguagePreference as saveLanguagePreferenceSetting,
} from "@/lib/app-settings";

export const DEFAULT_NS = "common";
export const NAMESPACES = ["common", "news", "sources", "chat", "creative", "settings"] as const;

let reactBindingRegistered = false;
let i18nInitializationPromise: Promise<typeof i18n> | null = null;
let languageListenerRegistered = false;

function updateDocumentLanguage(lng: string): void {
    if (typeof document === "undefined") {
        return;
    }

    document.documentElement.lang = lng;
}

function ensureLanguageListener(): void {
    if (languageListenerRegistered) {
        return;
    }

    i18n.on("languageChanged", (lng) => {
        updateDocumentLanguage(lng);
    });
    languageListenerRegistered = true;
}

function createI18nConfig(languagePreference: string) {
    return {
        resources: {
            en: { common: commonEn, news: newsEn, sources: sourcesEn, chat: chatEn, creative: creativeEn, settings: settingsEn },
            zh: { common: commonZh, news: newsZh, sources: sourcesZh, chat: chatZh, creative: creativeZh, settings: settingsZh },
            "zh-TW": { common: commonZhTw, news: newsZhTw, sources: sourcesZhTw, chat: chatZhTw, creative: creativeZhTw, settings: settingsZhTw },
            ja: { common: commonJa, news: newsJa, sources: sourcesJa, chat: chatJa, creative: creativeJa, settings: settingsJa },
            fr: { common: commonFr, news: newsFr, sources: sourcesFr, chat: chatFr, creative: creativeFr, settings: settingsFr },
            de: { common: commonDe, news: newsDe, sources: sourcesDe, chat: chatDe, creative: creativeDe, settings: settingsDe },
            it: { common: commonIt, news: newsIt, sources: sourcesIt, chat: chatIt, creative: creativeIt, settings: settingsIt },
        },
        lng: resolveLanguagePreference(languagePreference),
        fallbackLng: "en",
        defaultNS: DEFAULT_NS,
        ns: NAMESPACES,
        interpolation: {
            escapeValue: false,
        },
    };
}

export function getLanguagePreference(): string {
    return readPersistedLanguagePreference();
}

export async function initializeI18n(languagePreference: string = AUTO_DETECT_VALUE): Promise<typeof i18n> {
    const normalizedPreference = normalizeLanguagePreference(languagePreference);
    ensureLanguageListener();

    if (!reactBindingRegistered) {
        i18n.use(initReactI18next);
        reactBindingRegistered = true;
    }

    if (i18n.isInitialized) {
        await i18n.changeLanguage(resolveLanguagePreference(normalizedPreference));
        updateDocumentLanguage(i18n.resolvedLanguage ?? i18n.language ?? "en");
        return i18n;
    }

    if (!i18nInitializationPromise) {
        i18nInitializationPromise = i18n
            .init(createI18nConfig(normalizedPreference))
            .then(() => {
                updateDocumentLanguage(i18n.resolvedLanguage ?? i18n.language ?? "en");
                return i18n;
            })
            .catch((error) => {
                i18nInitializationPromise = null;
                throw error;
            });
    }

    return i18nInitializationPromise;
}

export async function setLanguagePreference(value: string): Promise<void> {
    const normalizedPreference = normalizeLanguagePreference(value);
    await saveLanguagePreferenceSetting(normalizedPreference);
    await initializeI18n(normalizedPreference);
}

export { AUTO_DETECT_VALUE, SUPPORTED_LANGUAGES };

export default i18n;
