import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Settings from "@/views/Settings";

const translations: Record<string, Record<string, string>> = {
    common: {
        language: "Language",
        languageDesc: "Choose the display language.",
        autoDetect: "Auto Detect",
        save: "Save",
        cancel: "Cancel",
    },
    settings: {
        eyebrow: "Settings",
        title: "System configuration",
        description: "Configure providers, keys, and housekeeping behavior.",
        general: "General",
        aiProviderConfig: "AI Provider Configuration",
        aiProviderDesc: "Configure your AI provider for article chat and summaries.",
        selectProvider: "Select Provider",
        aiBaseUrl: "AI Base URL",
        azureBaseUrl: "Azure Base URL",
        aiApiKey: "AI API Key",
        hideApiKey: "Hide API key",
        showApiKey: "Show API key",
        modelName: "Model Name",
        deploymentName: "Deployment Name",
        modelPlaceholder: "e.g., gpt-4o-mini",
        deploymentPlaceholder: "e.g., my-gpt-4o-deployment",
        azureApiVersion: "Azure API Version",
        azureApiVersionPlaceholder: "e.g., 2024-02-15-preview",
        apiKeyPlaceholder: "sk-...",
        discardUnsavedChanges: "Discard unsaved provider changes?",
        discardUnsavedDesc: "Discard and switch?",
        discardAndSwitch: "Discard and Switch",
        dataManagement: "Data Management",
        dataManagementDesc: "Clean up your locally stored articles and manage database size.",
        deleteOldArticles30: "Delete Old Articles (30 Days)",
        deleteOldArticles30Desc: "Remove all articles published more than 30 days ago.",
        deleteOldArticles7: "Delete Old Articles (7 Days)",
        deleteOldArticles7Desc: "Keep your database very lean.",
        runCleanup: "Run Cleanup",
        about: "About",
        aboutTwitter: "Twitter",
        aboutGithub: "GitHub",
        aboutFeedback: "Issues",
    },
};

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(),
    },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
    openUrl: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: { ns?: string }) => {
            const namespace = options?.ns ?? ns ?? "common";
            return translations[namespace]?.[key] ?? key;
        },
    }),
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({
        toast: vi.fn(),
    }),
}));

vi.mock("@/lib/i18n", () => ({
    SUPPORTED_LANGUAGES: [{ code: "en", label: "English" }],
    AUTO_DETECT_VALUE: "auto",
    getLanguagePreference: () => "en",
    setLanguagePreference: vi.fn(),
}));

vi.mock("@/lib/ai-config", () => {
    const provider = {
        id: "openai",
        name: "OpenAI",
        url: "https://api.openai.com/v1",
        models: ["gpt-4o-mini"],
        iconUrl: "/openai.png",
    };
    const defaultConfig = {
        url: provider.url,
        apiKey: "",
        model: provider.models[0],
    };

    return {
        DEFAULT_AI_PROVIDER_ID: provider.id,
        PROVIDERS: [provider],
        getDefaultProviderConfig: () => ({ ...defaultConfig }),
        getDefaultProviderConfigs: () => ({ [provider.id]: { ...defaultConfig } }),
        getProviderById: () => provider,
        normalizeProviderConfig: (_providerId: string, value?: Partial<typeof defaultConfig>) => ({
            ...defaultConfig,
            ...value,
        }),
        readCurrentProviderId: () => provider.id,
        readStoredProviderConfigs: () => ({ [provider.id]: { ...defaultConfig } }),
        saveCurrentProviderId: vi.fn(),
        saveProviderConfig: vi.fn(),
    };
});

vi.mock("@/components/ui/select", () => ({
    Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
    ),
    SelectValue: () => <span>English</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <div data-value={value}>{children}</div>
    ),
}));

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("Settings", () => {
    it("renders the about card after data management with the expected external links", () => {
        const markup = renderToStaticMarkup(<Settings />);
        const dataManagementIndex = markup.indexOf(">Data Management<");
        const aboutIndex = markup.indexOf(">About<");

        expect(dataManagementIndex).toBeGreaterThan(-1);
        expect(aboutIndex).toBeGreaterThan(dataManagementIndex);
        expect(markup).toContain(">Twitter<");
        expect(markup).toContain(">GitHub<");
        expect(markup).toContain(">Issues<");
        expect(markup).toContain('href="https://x.com/shipengtao"');
        expect(markup).toContain('href="https://github.com/shipengtaov"');
        expect(markup).toContain('href="https://github.com/shipengtaov/stream-deck-support"');
        expect(markup).not.toContain(">https://x.com/shipengtao<");
        expect(markup).not.toContain(">https://github.com/shipengtaov<");
    });
});
