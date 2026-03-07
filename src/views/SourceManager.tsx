import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCcw, Trash2, Edit, Plus, Power, PowerOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchSource, fetchSources, type FetchableSource } from "@/lib/source-fetch";
import { addSourceFetchSyncListener, dispatchSourceFetchSyncEvent } from "@/lib/source-events";
import { formatFetchInterval, formatLastFetchSummary, normalizeFetchInterval } from "@/lib/source-utils";
import { PageShell } from "@/components/layout/PageShell";

type Source = FetchableSource & {
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
    const navigate = useNavigate();
    const [sources, setSources] = useState<Source[]>([]);
    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [fetchingSourceId, setFetchingSourceId] = useState<number | null>(null);

    const activeSourceCount = sources.filter((source) => Boolean(source.active)).length;
    const isAnyFetchInProgress = isFetchingAll || fetchingSourceId !== null;

    useEffect(() => {
        void loadSources();
        return addSourceFetchSyncListener(() => {
            void loadSources();
        });
    }, []);

    async function loadSources() {
        try {
            const db = await getDb();
            const result: Source[] = await db.select("SELECT * FROM sources ORDER BY id DESC");
            setSources(result.map((source) => ({
                ...source,
                fetch_interval: normalizeFetchInterval(source.fetch_interval),
                last_fetch: source.last_fetch ?? null,
            })));
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
        const activeSources = sources.filter((source) => Boolean(source.active));
        if (activeSources.length === 0) {
            toast({ title: "No active sources to fetch" });
            return;
        }

        setIsFetchingAll(true);
        toast({ title: `Fetching ${activeSources.length} active sources...` });

        try {
            const result = await fetchSources(activeSources);
            if (result.insertedCount > 0) {
                dispatchSourceFetchSyncEvent();
            }
            toast({
                title: "Fetch All Complete",
                description: `Fetched ${result.insertedCount} new articles. ${result.successCount} succeeded${result.failCount > 0 ? `, ${result.failCount} failed` : ""}.`,
            });
        } catch (err: any) {
            toast({ title: "Fetch failed", description: String(err), variant: "destructive" });
        } finally {
            await loadSources();
            setIsFetchingAll(false);
        }
    }

    async function fetchNow(source: Source) {
        if (!source.active) {
            return;
        }

        setFetchingSourceId(source.id);
        try {
            toast({ title: `Fetching ${source.name}...` });
            const result = await fetchSource(source);
            if (result.insertedCount > 0) {
                dispatchSourceFetchSyncEvent();
            }
            toast({
                title: "Fetch complete",
                description: `Fetched ${result.fetchedCount} articles, saved ${result.insertedCount} new.`,
            });
        } catch (err: any) {
            toast({ title: "Fetch failed", description: String(err), variant: "destructive" });
        } finally {
            await loadSources();
            setFetchingSourceId(null);
        }
    }

    return (
        <PageShell className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Source Manager</h1>
                    <p className="text-muted-foreground mt-2">Manage your RSS feeds, Twitter accounts, and URL monitors.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchAll} disabled={isAnyFetchInProgress || activeSourceCount === 0}>
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
                                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                    <p>{formatFetchInterval(s.fetch_interval)}</p>
                                    <p>{formatLastFetchSummary(s.last_fetch)}</p>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => fetchNow(s)} disabled={!s.active || isAnyFetchInProgress}>
                                        <RefreshCcw className={`h-4 w-4 mr-2 ${fetchingSourceId === s.id ? 'animate-spin' : ''}`} /> Fetch
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
        </PageShell>
    );
}
