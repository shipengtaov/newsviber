import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const getFaviconUrl = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'], iconUrl: getFaviconUrl('openai.com') },
    { id: 'claude', name: 'Anthropic (Claude)', url: 'https://api.anthropic.com/v1', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'], iconUrl: getFaviconUrl('anthropic.com') },
    { id: 'gemini', name: 'Google (Gemini)', url: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], iconUrl: getFaviconUrl('gemini.google.com') },
    { id: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'], iconUrl: getFaviconUrl('deepseek.com') },
    { id: 'qwen', name: 'Aliyun (Qwen)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'], iconUrl: getFaviconUrl('tongyi.aliyun.com') },
    { id: 'kimi', name: 'Moonshot (Kimi)', url: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'], iconUrl: getFaviconUrl('moonshot.cn') },
    { id: 'glm', name: 'Zhipu (GLM)', url: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash'], iconUrl: getFaviconUrl('zhipuai.cn') },
    { id: 'minimax', name: 'MiniMax', url: 'https://api.minimaxi.com/anthropic', models: ['minimax-text-01', 'minimax-text-01v', 'abab6.5s-chat'], iconUrl: getFaviconUrl('minimaxi.com') },
    { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', models: [], iconUrl: getFaviconUrl('openrouter.ai') },
    { id: 'siliconflow', name: 'SiliconFlow', url: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'], iconUrl: getFaviconUrl('siliconflow.cn') },
    { id: 'vercel', name: 'Vercel AI Gateway', url: 'https://ai-gateway.vercel.sh', models: [], iconUrl: getFaviconUrl('vercel.com') },
    { id: 'azure', name: 'Azure OpenAI', url: 'https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT_NAME', models: ['gpt-4o', 'gpt-4o-mini'], iconUrl: getFaviconUrl('azure.microsoft.com') },
    { id: 'ollama', name: 'Ollama (Local)', url: 'http://127.0.0.1:11434/v1', models: ['llama3', 'qwen2', 'mistral'], iconUrl: getFaviconUrl('ollama.com') },
    { id: 'custom', name: 'Custom', url: '', models: [], iconUrl: 'https://api.iconify.design/lucide:globe.svg?color=%23888888' }
];

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
    const [aiProvider, setAiProvider] = useState("openai");
    const [aiUrl, setAiUrl] = useState("https://api.openai.com/v1");
    const [aiKey, setAiKey] = useState("");
    const [aiModel, setAiModel] = useState("gpt-4o-mini");
    const [azureVersion, setAzureVersion] = useState("2024-02-15-preview");

    useEffect(() => {
        // In a real app, these should be securely stored in tauri-plugin-store or OS keyring.
        // For this prototype, we'll use localStorage or standard db.
        setJinaKey(localStorage.getItem("JINA_API_KEY") || "");
        setAiProvider(localStorage.getItem("AI_PROVIDER") || "openai");
        setAiUrl(localStorage.getItem("AI_API_URL") || "https://api.openai.com/v1");
        setAiKey(localStorage.getItem("AI_API_KEY") || "");
        setAiModel(localStorage.getItem("AI_MODEL") || "gpt-4o-mini");
        setAzureVersion(localStorage.getItem("AZURE_API_VERSION") || "2024-02-15-preview");
    }, []);

    const handleProviderChange = (providerId: string) => {
        setAiProvider(providerId);
        const provider = PROVIDERS.find(p => p.id === providerId);
        if (provider && providerId !== 'custom') {
            setAiUrl(provider.url);
            if (provider.models.length > 0) {
                setAiModel(provider.models[0]);
            } else {
                setAiModel("");
            }
        }
    };

    function saveKeys(e: React.FormEvent) {
        e.preventDefault();
        localStorage.setItem("JINA_API_KEY", jinaKey);
        localStorage.setItem("AI_PROVIDER", aiProvider);
        localStorage.setItem("AI_API_URL", aiUrl);
        localStorage.setItem("AI_API_KEY", aiKey);
        localStorage.setItem("AI_MODEL", aiModel);
        localStorage.setItem("AZURE_API_VERSION", azureVersion);
        toast({ title: "Settings Saved", description: "API configurations have been updated." });
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
                    <form onSubmit={saveKeys} className="space-y-6">
                        <div className="space-y-4 max-w-lg">
                            <div className="space-y-2">
                                <Label>Select Provider</Label>
                                <Select value={aiProvider} onValueChange={handleProviderChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select an AI Provider" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROVIDERS.map((provider) => {
                                            return (
                                                <SelectItem key={provider.id} value={provider.id}>
                                                    <div className="flex items-center gap-2">
                                                        <img src={provider.iconUrl} alt={provider.name} className="w-5 h-5 rounded-sm" />
                                                        <span>{provider.name}</span>
                                                    </div>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                            <div className="space-y-2 md:col-span-2">
                                <Label>AI Base URL</Label>
                                <Input value={aiUrl} onChange={e => setAiUrl(e.target.value)} />
                            </div>

                            {aiProvider === 'azure' && (
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Azure API Version</Label>
                                    <Input value={azureVersion} onChange={e => setAzureVersion(e.target.value)} placeholder="e.g., 2024-02-15-preview" />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>AI API Key</Label>
                                <Input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="sk-..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Model Name</Label>
                                <Input
                                    list="model-suggestions"
                                    value={aiModel}
                                    onChange={e => setAiModel(e.target.value)}
                                    placeholder="e.g., gpt-4o-mini"
                                />
                                <datalist id="model-suggestions">
                                    {PROVIDERS.find(p => p.id === aiProvider)?.models.map(model => (
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
                        <Button onClick={saveKeys}>Save Jina Settings</Button>
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
