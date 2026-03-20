import { useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Bug, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getDb } from "@/lib/db";
import {
    AIProviderConfig,
    AIProviderConfigs,
    PROVIDERS,
    getDefaultProviderConfig,
    getProviderById,
    normalizeProviderConfig,
    readCurrentProviderId,
    readStoredProviderConfigs,
    saveCurrentProviderId,
    saveProviderConfig,
} from "@/lib/ai-config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, AUTO_DETECT_VALUE, getLanguagePreference, setLanguagePreference } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/PageShell";

function getProviderConfigSnapshot(providerId: string, providerConfig: AIProviderConfig) {
    return JSON.stringify(normalizeProviderConfig(providerId, providerConfig));
}

type BrandIconProps = {
    className?: string;
};

function XLogoIcon({ className }: BrandIconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
            <path
                fill="currentColor"
                d="M18.244 2H21.5L14.4 10.142L22.75 22H16.21L11.088 14.75L4.767 22H1.509L9.104 13.286L1 2H7.706L12.352 8.53L18.244 2ZM17.101 20.002H18.904L6.726 3.893H4.791L17.101 20.002Z"
            />
        </svg>
    );
}

function GitHubLogoIcon({ className }: BrandIconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
            <path
                fill="currentColor"
                d="M12 .297C5.373.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.387c.6.111.82-.261.82-.577v-2.234c-3.338.726-4.042-1.417-4.042-1.417c-.546-1.387-1.333-1.756-1.333-1.756c-1.089-.744.083-.729.083-.729c1.205.085 1.839 1.237 1.839 1.237c1.07 1.835 2.809 1.305 3.495.998c.108-.775.418-1.305.762-1.605c-2.665-.304-5.467-1.333-5.467-5.931c0-1.311.468-2.381 1.236-3.221c-.124-.303-.535-1.524.117-3.176c0 0 1.008-.323 3.301 1.23a11.49 11.49 0 0 1 3.006-.404c1.02.005 2.047.138 3.006.404c2.291-1.553 3.297-1.23 3.297-1.23c.653 1.653.242 2.874.119 3.176c.77.84 1.235 1.91 1.235 3.221c0 4.609-2.807 5.624-5.479 5.921c.43.372.814 1.103.814 2.222v3.293c0 .319.216.694.825.576C20.565 22.092 24 17.597 24 12.297C24 5.67 18.627.297 12 .297Z"
            />
        </svg>
    );
}

type AboutLink = {
    key: string;
    labelKey: string;
    url: string;
    Icon: ComponentType<BrandIconProps>;
};

const ABOUT_LINKS: AboutLink[] = [
    {
        key: "twitter",
        labelKey: "aboutTwitter",
        url: "https://x.com/shipengtao",
        Icon: XLogoIcon,
    },
    {
        key: "github",
        labelKey: "aboutGithub",
        url: "https://github.com/shipengtaov/newsviber",
        Icon: GitHubLogoIcon,
    },
    {
        key: "feedback",
        labelKey: "aboutFeedback",
        url: "https://github.com/shipengtaov/newsviber/issues/new",
        Icon: Bug,
    },
];

export default function Settings() {
    const { t } = useTranslation("settings");
    const { toast } = useToast();
    const [selectedProviderId, setSelectedProviderId] = useState(readCurrentProviderId);
    const [providerDrafts, setProviderDrafts] = useState<AIProviderConfigs>(readStoredProviderConfigs);
    const [savedProviderDrafts, setSavedProviderDrafts] = useState<AIProviderConfigs>(readStoredProviderConfigs);
    const [showAiApiKey, setShowAiApiKey] = useState(false);
    const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
    const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

    const selectedProvider = getProviderById(selectedProviderId);
    const selectedConfig = providerDrafts[selectedProviderId] || getDefaultProviderConfig(selectedProviderId);
    const savedSelectedConfig = savedProviderDrafts[selectedProviderId] || getDefaultProviderConfig(selectedProviderId);
    const selectedConfigSnapshot = getProviderConfigSnapshot(selectedProviderId, selectedConfig);
    const savedSelectedConfigSnapshot = getProviderConfigSnapshot(selectedProviderId, savedSelectedConfig);
    const normalizedSelectedConfig = normalizeProviderConfig(selectedProviderId, selectedConfig);
    const isAiDirty = selectedConfigSnapshot !== savedSelectedConfigSnapshot;

    function updateSelectedProviderConfig(updates: Partial<AIProviderConfig>) {
        setProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: normalizeProviderConfig(selectedProviderId, {
                ...prev[selectedProviderId],
                ...updates,
            }),
        }));
    }

    function persistAiSettings() {
        return saveProviderConfig(selectedProviderId, selectedConfig);
    }

    function showPersistenceError(error: unknown) {
        toast({
            title: t("error", { ns: "common" }),
            description: String(error),
            variant: "destructive",
        });
    }

    function markSelectedProviderDraftSaved() {
        setProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: normalizedSelectedConfig,
        }));
        setSavedProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: normalizedSelectedConfig,
        }));
    }

    function resetSelectedProviderDraft() {
        setProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: { ...savedSelectedConfig },
        }));
    }

    async function switchProvider(nextProviderId: string) {
        await saveCurrentProviderId(nextProviderId);
        setSelectedProviderId(nextProviderId);
    }

    async function handleProviderChange(nextProviderId: string) {
        if (nextProviderId === selectedProviderId) {
            return;
        }

        if (isAiDirty) {
            setPendingProviderId(nextProviderId);
            setDiscardDialogOpen(true);
            return;
        }

        try {
            await switchProvider(nextProviderId);
        } catch (error) {
            showPersistenceError(error);
        }
    }

    function handleDiscardDialogOpenChange(open: boolean) {
        setDiscardDialogOpen(open);

        if (!open) {
            setPendingProviderId(null);
        }
    }

    async function confirmProviderSwitch() {
        if (!pendingProviderId) {
            return;
        }

        try {
            resetSelectedProviderDraft();
            await switchProvider(pendingProviderId);
            setPendingProviderId(null);
            setDiscardDialogOpen(false);
        } catch (error) {
            showPersistenceError(error);
        }
    }

    async function handleSaveAiSettings(e: React.FormEvent) {
        e.preventDefault();

        try {
            await persistAiSettings();
            markSelectedProviderDraftSaved();
            toast({ title: t("settingsSaved"), description: t("settingsSavedDesc") });
        } catch (error) {
            showPersistenceError(error);
        }
    }

    async function handleLanguageChange(value: string) {
        try {
            await setLanguagePreference(value);
        } catch (error) {
            showPersistenceError(error);
        }
    }

    async function cleanupData(days: number) {
        try {
            const db = await getDb();
            // SQLite syntax: datetime('now', '-30 days')
            await db.execute(`DELETE FROM articles WHERE published_at < datetime('now', '-${days} days')`);
            toast({ title: t("dataCleanupComplete"), description: t("dataCleanupCompleteDesc", { days }) });
        } catch (err: any) {
            toast({ title: t("cleanupError"), description: String(err), variant: "destructive" });
        }
    }

    function handleOpenExternalLink(url: string) {
        void openUrl(url);
    }

    return (
        <PageShell
            variant="workspace"
            contentClassName="space-y-8"
            header={{
                density: "compact",
                eyebrow: t("eyebrow"),
                title: t("title"),
                showTitle: false,
                description: t("description"),
                showDescription: false,
            }}
        >

            <Card>
                <CardHeader>
                    <CardTitle>{t("general")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>{t("language", { ns: "common" })}</Label>
                            <p className="text-sm text-muted-foreground">{t("languageDesc", { ns: "common" })}</p>
                        </div>
                        <Select
                            value={getLanguagePreference()}
                            onValueChange={(value) => {
                                void handleLanguageChange(value);
                            }}
                        >
                            <SelectTrigger className="w-[200px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={AUTO_DETECT_VALUE}>
                                    {t("autoDetect", { ns: "common" })}
                                </SelectItem>
                                {SUPPORTED_LANGUAGES.map((lang) => (
                                    <SelectItem key={lang.code} value={lang.code}>
                                        {lang.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t("aiProviderConfig")}</CardTitle>
                    <CardDescription>{t("aiProviderDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveAiSettings} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>{t("selectProvider")}</Label>
                                <div className="flex flex-wrap gap-2">
                                    {PROVIDERS.map((provider) => {
                                        const isSelected = provider.id === selectedProviderId;

                                        return (
                                            <button
                                                key={provider.id}
                                                type="button"
                                                onClick={() => {
                                                    void handleProviderChange(provider.id);
                                                }}
                                                aria-pressed={isSelected}
                                                className={cn(
                                                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                                                    isSelected
                                                        ? "border-primary bg-primary/10 text-foreground shadow-sm"
                                                        : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                                                )}
                                            >
                                                <img src={provider.iconUrl} alt={provider.name} className="w-5 h-5 rounded-sm" />
                                                <span>{provider.name}</span>
                                                <Check
                                                    className={cn(
                                                        "h-4 w-4 transition-opacity",
                                                        isSelected ? "opacity-100 text-primary" : "opacity-0",
                                                    )}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                            <div className="space-y-2 md:col-span-2">
                                <Label>{selectedProviderId === "azure" ? t("azureBaseUrl") : t("aiBaseUrl")}</Label>
                                <Input
                                    value={selectedConfig.url}
                                    onChange={e => updateSelectedProviderConfig({ url: e.target.value })}
                                />
                            </div>

                            {selectedProviderId === 'azure' && (
                                <div className="space-y-2 md:col-span-2">
                                    <Label>{t("azureApiVersion")}</Label>
                                    <Input
                                        value={selectedConfig.azureApiVersion || ""}
                                        onChange={e => updateSelectedProviderConfig({ azureApiVersion: e.target.value })}
                                        placeholder={t("azureApiVersionPlaceholder")}
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>{t("aiApiKey")}</Label>
                                <div className="relative">
                                    <Input
                                        type={showAiApiKey ? "text" : "password"}
                                        value={selectedConfig.apiKey}
                                        onChange={e => updateSelectedProviderConfig({ apiKey: e.target.value })}
                                        placeholder={t("apiKeyPlaceholder")}
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAiApiKey((prev) => !prev)}
                                        aria-label={showAiApiKey ? t("hideApiKey") : t("showApiKey")}
                                        aria-pressed={showAiApiKey}
                                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        {showAiApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>{selectedProviderId === "azure" ? t("deploymentName") : t("modelName")}</Label>
                                <Input
                                    list="model-suggestions"
                                    value={selectedConfig.model}
                                    onChange={e => updateSelectedProviderConfig({ model: e.target.value })}
                                    placeholder={selectedProviderId === "azure" ? t("deploymentPlaceholder") : t("modelPlaceholder")}
                                />
                                <datalist id="model-suggestions">
                                    {selectedProvider.models.map(model => (
                                        <option key={model} value={model} />
                                    ))}
                                </datalist>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={!isAiDirty}
                            className="disabled:border disabled:border-input disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
                        >
                            {t("save", { ns: "common" })}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Dialog open={discardDialogOpen} onOpenChange={handleDiscardDialogOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("discardUnsavedChanges")}</DialogTitle>
                        <DialogDescription>
                            {t("discardUnsavedDesc", { provider: selectedProvider.name })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleDiscardDialogOpenChange(false)}>
                            {t("cancel", { ns: "common" })}
                        </Button>
                        <Button type="button" onClick={() => {
                            void confirmProviderSwitch();
                        }}>
                            {t("discardAndSwitch")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Card>
                <CardHeader>
                    <CardTitle>{t("dataManagement")}</CardTitle>
                    <CardDescription>{t("dataManagementDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-muted/40 p-4 border rounded-lg flex items-center justify-between">
                        <div>
                            <div className="font-medium">{t("deleteOldArticles30")}</div>
                            <div className="text-sm text-muted-foreground">{t("deleteOldArticles30Desc")}</div>
                        </div>
                        <Button variant="destructive" onClick={() => cleanupData(30)}>{t("runCleanup")}</Button>
                    </div>
                    <div className="bg-muted/40 p-4 border rounded-lg flex items-center justify-between">
                        <div>
                            <div className="font-medium">{t("deleteOldArticles7")}</div>
                            <div className="text-sm text-muted-foreground">{t("deleteOldArticles7Desc")}</div>
                        </div>
                        <Button variant="destructive" onClick={() => cleanupData(7)}>{t("runCleanup")}</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t("about")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    {ABOUT_LINKS.map(({ key, labelKey, url, Icon }) => (
                        <Button
                            key={key}
                            asChild
                            variant="outline"
                            className="h-11 w-full justify-start rounded-[1rem] px-4 sm:w-auto"
                        >
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={(event) => {
                                    event.preventDefault();
                                    handleOpenExternalLink(url);
                                }}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span>{t(labelKey)}</span>
                            </a>
                        </Button>
                    ))}
                </CardContent>
            </Card>
        </PageShell>
    );
}
