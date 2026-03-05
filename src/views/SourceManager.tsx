import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCcw, Trash2, Edit, Plus, Power, PowerOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

type Source = {
    id: number;
    name: string;
    source_type: string;
    url: string;
    config: string | null;
    fetch_interval: number;
    active: number;
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
    const navigate = useNavigate();
    const [sources, setSources] = useState<Source[]>([]);
    const [isFetchingAll, setIsFetchingAll] = useState(false);

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

    async function toggleActive(source: Source) {
        try {
            const newActive = source.active ? 0 : 1;
            const db = await getDb();
            await db.execute("UPDATE sources SET active = $1 WHERE id = $2", [newActive, source.id]);
            toast({ title: newActive ? "Source activated" : "Source deactivated" });
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

    async function fetchAll() {
        const activeSources = sources.filter(s => s.active);
        if (activeSources.length === 0) {
            toast({ title: "No active sources to fetch" });
            return;
        }

        setIsFetchingAll(true);
        let totalArticles = 0;
        let successCount = 0;
        let failCount = 0;

        toast({ title: `Fetching ${activeSources.length} active sources...` });

        for (const source of activeSources) {
            try {
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

                for (const a of articles) {
                    try {
                        await db.execute(
                            "INSERT INTO articles (source_id, guid, title, content, summary, author, published_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                            [source.id, a.link, a.title, a.content, a.description, a.author, a.pub_date]
                        );
                        totalArticles++;
                    } catch (e: any) {
                        // ignore duplicate constraint
                        if (!String(e).includes("UNIQUE constraint")) {
                            console.error("Insert error:", e);
                        }
                    }
                }
                successCount++;
            } catch (err) {
                console.error(`Failed to fetch ${source.name}:`, err);
                failCount++;
            }
        }

        setIsFetchingAll(false);
        toast({
            title: "Fetch All Complete",
            description: `Fetched ${totalArticles} new articles. ${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ''}.`
        });
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
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Source Manager</h1>
                    <p className="text-muted-foreground mt-2">Manage your RSS feeds, Twitter accounts, and URL monitors.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchAll} disabled={isFetchingAll || sources.filter(s => s.active).length === 0}>
                        <RefreshCcw className={`h-4 w-4 mr-2 ${isFetchingAll ? 'animate-spin' : ''}`} />
                        {isFetchingAll ? 'Fetching All...' : 'Fetch All'}
                    </Button>
                    <Button onClick={() => navigate("/sources/add")}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Source
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Active Sources</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {sources.map(s => (
                        <Card key={s.id} className={`relative overflow-hidden ${!s.active ? 'opacity-75 bg-muted/50' : ''}`}>
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold">{s.name}</h3>
                                        {!s.active && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">Inactive</span>}
                                    </div>
                                    <span className="text-xs uppercase bg-muted text-muted-foreground px-2 py-1 rounded-md">{s.source_type}</span>
                                </div>
                                <p className="text-sm text-muted-foreground truncate" title={s.url}>{s.url}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => fetchNow(s)} disabled={!s.active}>
                                        <RefreshCcw className="h-4 w-4 mr-2" /> Fetch
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => navigate(`/sources/edit/${s.id}`)}>
                                        <Edit className="h-4 w-4 mr-2" /> Edit
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => toggleActive(s)}>
                                        {s.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteSource(s.id)} className="text-destructive ml-auto">
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
