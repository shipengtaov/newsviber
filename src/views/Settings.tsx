import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

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
    const [aiUrl, setAiUrl] = useState("https://api.openai.com/v1");
    const [aiKey, setAiKey] = useState("");
    const [aiModel, setAiModel] = useState("gpt-4o-mini");

    useEffect(() => {
        // In a real app, these should be securely stored in tauri-plugin-store or OS keyring.
        // For this prototype, we'll use localStorage or standard db.
        setJinaKey(localStorage.getItem("JINA_API_KEY") || "");
        setAiUrl(localStorage.getItem("AI_API_URL") || "https://api.openai.com/v1");
        setAiKey(localStorage.getItem("AI_API_KEY") || "");
        setAiModel(localStorage.getItem("AI_MODEL") || "gpt-4o-mini");
    }, []);

    function saveKeys(e: React.FormEvent) {
        e.preventDefault();
        localStorage.setItem("JINA_API_KEY", jinaKey);
        localStorage.setItem("AI_API_URL", aiUrl);
        localStorage.setItem("AI_API_KEY", aiKey);
        localStorage.setItem("AI_MODEL", aiModel);
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
                    <CardTitle>API Configuration</CardTitle>
                    <CardDescription>Setup your API keys for Jina (Scraping) and OpenAI-compatible endpoints.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={saveKeys} className="space-y-6">
                        <div className="space-y-2">
                            <Label>Jina AI API Key (r.jina.ai / s.jina.ai)</Label>
                            <Input type="password" value={jinaKey} onChange={e => setJinaKey(e.target.value)} placeholder="jina_..." />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                            <div className="space-y-2 md:col-span-2">
                                <Label>AI Base URL</Label>
                                <Input value={aiUrl} onChange={e => setAiUrl(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>AI API Key</Label>
                                <Input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="sk-..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Model Name</Label>
                                <Input value={aiModel} onChange={e => setAiModel(e.target.value)} />
                            </div>
                        </div>

                        <Button type="submit">Save API Settings</Button>
                    </form>
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
