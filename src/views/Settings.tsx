import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    saveAIProviderSettings,
} from "@/lib/ai-config";
import { cn } from "@/lib/utils";

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

export default function Settings() {
    const { toast } = useToast();
    const [jinaKey, setJinaKey] = useState("");
    const [selectedProviderId, setSelectedProviderId] = useState(DEFAULT_AI_PROVIDER_ID);
    const [providerDrafts, setProviderDrafts] = useState<AIProviderConfigs>(getDefaultProviderConfigs);

    useEffect(() => {
        // In a real app, these should be securely stored in tauri-plugin-store or OS keyring.
        // For this prototype, we'll use localStorage or standard db.
        setJinaKey(localStorage.getItem("JINA_API_KEY") || "");
        setSelectedProviderId(readCurrentProviderId());
        setProviderDrafts(readStoredProviderConfigs());
    }, []);

    const selectedProvider = getProviderById(selectedProviderId);
    const selectedConfig = providerDrafts[selectedProviderId] || getDefaultProviderConfig(selectedProviderId);

    function updateSelectedProviderConfig(updates: Partial<AIProviderConfig>) {
        setProviderDrafts((prev) => ({
            ...prev,
            [selectedProviderId]: normalizeProviderConfig(selectedProviderId, {
                ...prev[selectedProviderId],
                ...updates,
            }),
        }));
    }

    function persistSettings() {
        localStorage.setItem("JINA_API_KEY", jinaKey);
        saveAIProviderSettings(selectedProviderId, providerDrafts);
        toast({ title: "Settings Saved", description: "API configurations have been updated." });
    }

    function handleSaveAiSettings(e: React.FormEvent) {
        e.preventDefault();
        persistSettings();
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
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2">Configure AI providers and manage local data.</p>
            </div>

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
                                                onClick={() => setSelectedProviderId(provider.id)}
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
                                <Label>AI Base URL</Label>
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
                                <Input
                                    type="password"
                                    value={selectedConfig.apiKey}
                                    onChange={e => updateSelectedProviderConfig({ apiKey: e.target.value })}
                                    placeholder="sk-..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Model Name</Label>
                                <Input
                                    list="model-suggestions"
                                    value={selectedConfig.model}
                                    onChange={e => updateSelectedProviderConfig({ model: e.target.value })}
                                    placeholder="e.g., gpt-4o-mini"
                                />
                                <datalist id="model-suggestions">
                                    {selectedProvider.models.map(model => (
                                        <option key={model} value={model} />
                                    ))}
                                </datalist>
                            </div>
                        </div>

                        <Button type="submit">Save AI Settings</Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Jina AI Configuration</CardTitle>
                    <CardDescription>Setup your API keys for Jina (Web Scraping).</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4 max-w-lg">
                        <div className="space-y-2">
                            <Label>Jina AI API Key (r.jina.ai / s.jina.ai)</Label>
                            <Input type="password" value={jinaKey} onChange={e => setJinaKey(e.target.value)} placeholder="jina_..." />
                        </div>
                        <Button onClick={persistSettings}>Save Jina Settings</Button>
                    </div>
                </CardContent>
            </Card>

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

        </div>
    );
}
