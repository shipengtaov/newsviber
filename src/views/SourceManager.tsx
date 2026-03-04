import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCcw, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

type Source = {
    id: number;
    name: string;
    source_type: string;
    url: string;
    config: string | null;
    fetch_interval: number;
};

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

export default function SourceManager() {
    const { toast } = useToast();
    const [sources, setSources] = useState<Source[]>([]);
    const [name, setName] = useState("");
    const [type, setType] = useState("rss");
    const [url, setUrl] = useState("");
    const [interval, setInterval] = useState("60");

    useEffect(() => {
        loadSources();
    }, []);

    async function loadSources() {
        try {
            const db = await getDb();
            const result: Source[] = await db.select("SELECT * FROM sources ORDER BY id DESC");
            setSources(result);
        } catch (err) {
            console.error(err);
        }
    }

    async function addSource(e: React.FormEvent) {
        e.preventDefault();
        if (!name || !url) return;
        try {
            const db = await getDb();
            await db.execute(
                "INSERT INTO sources (name, source_type, url, fetch_interval) VALUES ($1, $2, $3, $4)",
                [name, type, url, parseInt(interval) || 60]
            );
            setName("");
            setUrl("");
            toast({ title: "Source added successfully" });
            loadSources();
        } catch (err: any) {
            toast({ title: "Error", description: String(err), variant: "destructive" });
        }
    }

    async function deleteSource(id: number) {
        try {
            const db = await getDb();
            await db.execute("DELETE FROM sources WHERE id = $1", [id]);
            toast({ title: "Source deleted" });
            loadSources();
        } catch (err: any) {
            toast({ title: "Error", description: String(err), variant: "destructive" });
        }
    }

    async function fetchNow(source: Source) {
        try {
            toast({ title: "Fetching data..." });
            const db = await getDb();
            let articles: any[] = [];

            if (source.source_type === "rss") {
                articles = await invoke("fetch_rss_cmd", { url: source.url });
            } else {
                const jinaData: any = await invoke("fetch_jina_cmd", { url: source.url, apiKey: null });
                if (jinaData) {
                    articles.push({
                        title: jinaData.title || "Untitled",
                        link: jinaData.url || source.url,
                        content: jinaData.content || "",
                        description: jinaData.description || "",
                        pub_date: new Date().toISOString(),
                        author: "",
                    });
                }
            }

            console.log(`Fetched ${articles.length} articles`);
            for (const a of articles) {
                try {
                    await db.execute(
                        "INSERT INTO articles (source_id, guid, title, content, summary, author, published_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                        [source.id, a.link, a.title, a.content, a.description, a.author, a.pub_date]
                    );
                } catch (e: any) {
                    // ignore duplicate constraint
                    if (!String(e).includes("UNIQUE constraint")) {
                        console.error("Insert error:", e);
                    }
                }
            }
            toast({ title: `Fetched and saved ${articles.length} articles` });
        } catch (err: any) {
            toast({ title: "Fetch failed", description: String(err), variant: "destructive" });
        }
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Source Manager</h1>
                <p className="text-muted-foreground mt-2">Manage your RSS feeds, Twitter accounts, and URL monitors.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Add New Source</CardTitle>
                    <CardDescription>Add a new data source to track automatically.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={addSource} className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Source Name</Label>
                            <Input placeholder="e.g. HN RSS" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="rss">RSS Feed</SelectItem>
                                    <SelectItem value="jina_url">Jina URL Scrape</SelectItem>
                                    <SelectItem value="twitter">Twitter (/X)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Target URL</Label>
                            <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Fetch Interval (minutes)</Label>
                            <Input type="number" value={interval} inline-block="true" onChange={e => setInterval(e.target.value)} />
                        </div>
                        <div className="md:col-span-2 mt-2">
                            <Button type="submit">Add Source</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Active Sources</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {sources.map(s => (
                        <Card key={s.id} className="relative overflow-hidden">
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-semibold">{s.name}</h3>
                                    <span className="text-xs uppercase bg-muted text-muted-foreground px-2 py-1 rounded-md">{s.source_type}</span>
                                </div>
                                <p className="text-sm text-muted-foreground truncate" title={s.url}>{s.url}</p>
                                <div className="mt-4 flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => fetchNow(s)}>
                                        <RefreshCcw className="h-4 w-4 mr-2" /> Fetch Now
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteSource(s.id)} className="text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                    {sources.length === 0 && (
                        <div className="text-muted-foreground py-8 text-center md:col-span-2 border rounded-lg border-dashed">
                            No sources added yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
