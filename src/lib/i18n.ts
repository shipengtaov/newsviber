import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonEn from "@/locales/en/common.json";
import newsEn from "@/locales/en/news.json";
import sourcesEn from "@/locales/en/sources.json";
import chatEn from "@/locales/en/chat.json";
import automationEn from "@/locales/en/automation.json";
import settingsEn from "@/locales/en/settings.json";

import commonZh from "@/locales/zh/common.json";
import newsZh from "@/locales/zh/news.json";
import sourcesZh from "@/locales/zh/sources.json";
import chatZh from "@/locales/zh/chat.json";
import automationZh from "@/locales/zh/automation.json";
import settingsZh from "@/locales/zh/settings.json";

import commonZhTw from "@/locales/zh-TW/common.json";
import newsZhTw from "@/locales/zh-TW/news.json";
import sourcesZhTw from "@/locales/zh-TW/sources.json";
import chatZhTw from "@/locales/zh-TW/chat.json";
import automationZhTw from "@/locales/zh-TW/automation.json";
import settingsZhTw from "@/locales/zh-TW/settings.json";

import commonJa from "@/locales/ja/common.json";
import newsJa from "@/locales/ja/news.json";
import sourcesJa from "@/locales/ja/sources.json";
import chatJa from "@/locales/ja/chat.json";
import automationJa from "@/locales/ja/automation.json";
import settingsJa from "@/locales/ja/settings.json";

import commonFr from "@/locales/fr/common.json";
import newsFr from "@/locales/fr/news.json";
import sourcesFr from "@/locales/fr/sources.json";
import chatFr from "@/locales/fr/chat.json";
import automationFr from "@/locales/fr/automation.json";
import settingsFr from "@/locales/fr/settings.json";

import commonDe from "@/locales/de/common.json";
import newsDe from "@/locales/de/news.json";
import sourcesDe from "@/locales/de/sources.json";
import chatDe from "@/locales/de/chat.json";
import automationDe from "@/locales/de/automation.json";
import settingsDe from "@/locales/de/settings.json";

import commonIt from "@/locales/it/common.json";
import newsIt from "@/locales/it/news.json";
import sourcesIt from "@/locales/it/sources.json";
import chatIt from "@/locales/it/chat.json";
import automationIt from "@/locales/it/automation.json";
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
export const NAMESPACES = ["common", "news", "sources", "chat", "automation", "settings"] as const;

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
            en: { common: commonEn, news: newsEn, sources: sourcesEn, chat: chatEn, automation: automationEn, settings: settingsEn },
            zh: { common: commonZh, news: newsZh, sources: sourcesZh, chat: chatZh, automation: automationZh, settings: settingsZh },
            "zh-TW": { common: commonZhTw, news: newsZhTw, sources: sourcesZhTw, chat: chatZhTw, automation: automationZhTw, settings: settingsZhTw },
            ja: { common: commonJa, news: newsJa, sources: sourcesJa, chat: chatJa, automation: automationJa, settings: settingsJa },
            fr: { common: commonFr, news: newsFr, sources: sourcesFr, chat: chatFr, automation: automationFr, settings: settingsFr },
            de: { common: commonDe, news: newsDe, sources: sourcesDe, chat: chatDe, automation: automationDe, settings: settingsDe },
            it: { common: commonIt, news: newsIt, sources: sourcesIt, chat: chatIt, automation: automationIt, settings: settingsIt },
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
