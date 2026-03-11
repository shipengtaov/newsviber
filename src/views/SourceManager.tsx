import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
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

function formatSourceTypeLabel(sourceType: string): string {
    switch (sourceType) {
        case "rss":
            return "RSS Feed";
        case "jina_url":
            return "Jina URL Scrape";
        case "twitter":
            return "Twitter (/X)";
        default:
            return sourceType;
    }
}

export default function SourceManager() {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [sources, setSources] = useState<Source[]>([]);
    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [fetchingSourceId, setFetchingSourceId] = useState<number | null>(null);
    const [pendingDeleteSource, setPendingDeleteSource] = useState<Source | null>(null);
    const [deletingSourceId, setDeletingSourceId] = useState<number | null>(null);

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

    function handleDeleteDialogOpenChange(open: boolean) {
        if (deletingSourceId !== null) {
            return;
        }

        if (!open) {
            setPendingDeleteSource(null);
        }
    }

    async function deleteSource(id: number) {
        setDeletingSourceId(id);
        try {
            const db = await getDb();
            await db.execute("DELETE FROM sources WHERE id = $1", [id]);
            toast({ title: "Source deleted" });
            setPendingDeleteSource(null);
            await loadSources();
        } catch (err: any) {
            toast({ title: "Error", description: String(err), variant: "destructive" });
        } finally {
            setDeletingSourceId(null);
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
        <>
            <PageShell variant="workspace" className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Source Manager</h1>
                        <p className="mt-2 text-muted-foreground">Manage your RSS feeds, Twitter accounts, and URL monitors.</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={fetchAll} disabled={isAnyFetchInProgress || activeSourceCount === 0}>
                            <RefreshCcw className={`mr-2 h-4 w-4 ${isFetchingAll ? "animate-spin" : ""}`} />
                            {isFetchingAll ? "Fetching All..." : "Fetch All"}
                        </Button>
                        <Button onClick={() => navigate("/sources/add")}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Source
                        </Button>
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold">Active Sources</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {sources.map((source) => (
                            <Card
                                key={source.id}
                                className={`flex flex-col transition-all hover:border-primary/50 hover:shadow-md ${!source.active ? "bg-muted/50 opacity-75" : ""}`}
                            >
                                <CardHeader className="px-4 py-4 pb-2">
                                    <div className="min-w-0 flex-1">
                                        <CardTitle className="truncate text-lg">{source.name}</CardTitle>
                                        <CardDescription className="mt-1.5 line-clamp-2 text-sm" title={source.url}>
                                            {source.url}
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex flex-1 flex-col px-4 pb-4 pt-0 text-sm text-muted-foreground">
                                    <div className="space-y-1.5">
                                        <p>Type: {formatSourceTypeLabel(source.source_type)}</p>
                                        <p>Status: {source.active ? "Active" : "Inactive"}</p>
                                        <p>{formatFetchInterval(source.fetch_interval)}</p>
                                        <p>{formatLastFetchSummary(source.last_fetch)}</p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button variant="outline" size="sm" onClick={() => fetchNow(source)} disabled={!source.active || isAnyFetchInProgress}>
                                            <RefreshCcw className={`mr-2 h-4 w-4 ${fetchingSourceId === source.id ? "animate-spin" : ""}`} /> Fetch
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => navigate(`/sources/edit/${source.id}`)}>
                                            <Edit className="mr-2 h-4 w-4" /> Edit
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => toggleActive(source)} title={source.active ? "Deactivate source" : "Activate source"}>
                                            {source.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPendingDeleteSource(source)}
                                            className="ml-auto text-destructive"
                                            title="Delete source"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {sources.length === 0 && (
                            <div className="col-span-full rounded-xl border-2 border-dashed p-12 text-center text-muted-foreground">
                                No sources added yet.
                            </div>
                        )}
                    </div>
                </div>
            </PageShell>

            <Dialog open={pendingDeleteSource !== null} onOpenChange={handleDeleteDialogOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete source?</DialogTitle>
                        <DialogDescription>
                            {pendingDeleteSource
                                ? `Delete "${pendingDeleteSource.name}"? This permanently removes the source, its fetched articles, and any saved source scope references that point to it.`
                                : "Delete this source? This permanently removes the source, its fetched articles, and any saved source scope references that point to it."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={deletingSourceId !== null}
                            onClick={() => handleDeleteDialogOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={pendingDeleteSource === null || deletingSourceId !== null}
                            onClick={() => {
                                if (!pendingDeleteSource) {
                                    return;
                                }

                                void deleteSource(pendingDeleteSource.id);
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
