import { useEffect, useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Check, Eye, EyeOff } from "lucide-react";
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
import {
    DEFAULT_AI_PROVIDER_ID,
    AIProviderConfig,
    AIProviderConfigs,
    PROVIDERS,
    getDefaultProviderConfig,
    getDefaultProviderConfigs,
    getProviderById,
    normalizeProviderConfig,
    readCurrentProviderId,
    readStoredProviderConfigs,
    saveCurrentProviderId,
    saveProviderConfig,
} from "@/lib/ai-config";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/PageShell";

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

function getProviderConfigSnapshot(providerId: string, providerConfig: AIProviderConfig) {
    return JSON.stringify(normalizeProviderConfig(providerId, providerConfig));
}

export default function Settings() {
    const { toast } = useToast();
    const [selectedProviderId, setSelectedProviderId] = useState(DEFAULT_AI_PROVIDER_ID);
    const [providerDrafts, setProviderDrafts] = useState<AIProviderConfigs>(getDefaultProviderConfigs);
    const [savedProviderDrafts, setSavedProviderDrafts] = useState<AIProviderConfigs>(getDefaultProviderConfigs);
    const [showAiApiKey, setShowAiApiKey] = useState(false);
    const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
    const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

    useEffect(() => {
        // In a real app, these should be securely stored in tauri-plugin-store or OS keyring.
        // For this prototype, we'll use localStorage or standard db.
        const storedProviderId = readCurrentProviderId();
        const storedProviderConfigs = readStoredProviderConfigs();

        setSelectedProviderId(storedProviderId);
        setProviderDrafts(storedProviderConfigs);
        setSavedProviderDrafts(storedProviderConfigs);
    }, []);

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
        saveProviderConfig(selectedProviderId, selectedConfig);
        setProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: normalizedSelectedConfig,
        }));
        setSavedProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: normalizedSelectedConfig,
        }));
        toast({ title: "Settings Saved", description: "AI provider configuration has been updated." });
    }

    function resetSelectedProviderDraft() {
        setProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: { ...savedSelectedConfig },
        }));
    }

    function switchProvider(nextProviderId: string) {
        saveCurrentProviderId(nextProviderId);
        setSelectedProviderId(nextProviderId);
    }

    function handleProviderChange(nextProviderId: string) {
        if (nextProviderId === selectedProviderId) {
            return;
        }

        if (isAiDirty) {
            setPendingProviderId(nextProviderId);
            setDiscardDialogOpen(true);
            return;
        }

        switchProvider(nextProviderId);
    }

    function handleDiscardDialogOpenChange(open: boolean) {
        setDiscardDialogOpen(open);

        if (!open) {
            setPendingProviderId(null);
        }
    }

    function confirmProviderSwitch() {
        if (!pendingProviderId) {
            return;
        }

        resetSelectedProviderDraft();
        switchProvider(pendingProviderId);
        setPendingProviderId(null);
        setDiscardDialogOpen(false);
    }

    function handleSaveAiSettings(e: React.FormEvent) {
        e.preventDefault();
        persistAiSettings();
    }

    async function cleanupData(days: number) {
        try {
            const db = await getDb();
            // SQLite syntax: datetime('now', '-30 days')
            await db.execute(`DELETE FROM articles WHERE published_at < datetime('now', '-${days} days')`);
            toast({ title: "Data Cleanup Complete", description: `Deleted articles older than ${days} days.` });
        } catch (err: any) {
            toast({ title: "Cleanup Error", description: String(err), variant: "destructive" });
        }
    }

    return (
        <PageShell
            variant="workspace"
            contentClassName="space-y-8"
            header={{
                density: "compact",
                eyebrow: "Settings",
                title: "System configuration",
                showTitle: false,
                description: "Configure providers, keys, and housekeeping behavior.",
                showDescription: false,
                stats: [
                    { label: "Active provider", value: selectedProvider?.name ?? "Unknown", tone: "accent" },
                ],
            }}
        >

            <Card>
                <CardHeader>
                    <CardTitle>AI Provider Configuration</CardTitle>
                    <CardDescription>Configure your AI provider for article chat and summaries.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveAiSettings} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Select Provider</Label>
                                <div className="flex flex-wrap gap-2">
                                    {PROVIDERS.map((provider) => {
                                        const isSelected = provider.id === selectedProviderId;

                                        return (
                                            <button
                                                key={provider.id}
                                                type="button"
                                                onClick={() => handleProviderChange(provider.id)}
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
                                <Label>{selectedProviderId === "azure" ? "Azure Base URL" : "AI Base URL"}</Label>
                                <Input
                                    value={selectedConfig.url}
                                    onChange={e => updateSelectedProviderConfig({ url: e.target.value })}
                                />
                            </div>

                            {selectedProviderId === 'azure' && (
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Azure API Version</Label>
                                    <Input
                                        value={selectedConfig.azureApiVersion || ""}
                                        onChange={e => updateSelectedProviderConfig({ azureApiVersion: e.target.value })}
                                        placeholder="e.g., 2024-02-15-preview"
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>AI API Key</Label>
                                <div className="relative">
                                    <Input
                                        type={showAiApiKey ? "text" : "password"}
                                        value={selectedConfig.apiKey}
                                        onChange={e => updateSelectedProviderConfig({ apiKey: e.target.value })}
                                        placeholder="sk-..."
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAiApiKey((prev) => !prev)}
                                        aria-label={showAiApiKey ? "Hide API key" : "Show API key"}
                                        aria-pressed={showAiApiKey}
                                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        {showAiApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>{selectedProviderId === "azure" ? "Deployment Name" : "Model Name"}</Label>
                                <Input
                                    list="model-suggestions"
                                    value={selectedConfig.model}
                                    onChange={e => updateSelectedProviderConfig({ model: e.target.value })}
                                    placeholder={selectedProviderId === "azure" ? "e.g., my-gpt-4o-deployment" : "e.g., gpt-4o-mini"}
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
                            Save
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Dialog open={discardDialogOpen} onOpenChange={handleDiscardDialogOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Discard unsaved provider changes?</DialogTitle>
                        <DialogDescription>
                            Your changes for {selectedProvider.name} have not been saved. Discard them and switch providers?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleDiscardDialogOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={confirmProviderSwitch}>
                            Discard and Switch
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Card>
                <CardHeader>
                    <CardTitle>Data Management</CardTitle>
                    <CardDescription>Clean up your locally stored articles and manage database size.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-muted/40 p-4 border rounded-lg flex items-center justify-between">
                        <div>
                            <div className="font-medium">Delete Old Articles (30 Days)</div>
                            <div className="text-sm text-muted-foreground">Remove all articles published more than 30 days ago.</div>
                        </div>
                        <Button variant="destructive" onClick={() => cleanupData(30)}>Run Cleanup</Button>
                    </div>
                    <div className="bg-muted/40 p-4 border rounded-lg flex items-center justify-between">
                        <div>
                            <div className="font-medium">Delete Old Articles (7 Days)</div>
                            <div className="text-sm text-muted-foreground">Keep your database very lean.</div>
                        </div>
                        <Button variant="destructive" onClick={() => cleanupData(7)}>Run Cleanup</Button>
                    </div>
                </CardContent>
            </Card>
        </PageShell>
    );
}
