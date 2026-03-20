import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { getDb } from "@/lib/db";
import { fetchSource, fetchSources, type FetchableSource } from "@/lib/source-fetch";
import { addSourceFetchSyncListener, dispatchSourceFetchSyncEvent } from "@/lib/source-events";
import { formatFetchInterval, formatLastFetchSummary, normalizeFetchInterval } from "@/lib/source-utils";
import { PageShell } from "@/components/layout/PageShell";

type Source = FetchableSource & {
    config: string | null;
    fetch_interval: number;
};

export default function SourceManager() {
    const { t } = useTranslation("sources");
    const { toast } = useToast();
    const navigate = useNavigate();
    const [sources, setSources] = useState<Source[]>([]);
    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [fetchingSourceId, setFetchingSourceId] = useState<number | null>(null);
    const [pendingDeleteSource, setPendingDeleteSource] = useState<Source | null>(null);
    const [deletingSourceId, setDeletingSourceId] = useState<number | null>(null);

    function formatSourceTypeLabel(sourceType: string): string {
        switch (sourceType) {
            case "rss":
                return t("rssAtomFeed");
            default:
                return sourceType;
        }
    }

    const activeSourceCount = sources.filter((source) => Boolean(source.active)).length;
    const inactiveSourceCount = Math.max(0, sources.length - activeSourceCount);
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
            toast({ title: newActive ? t("sourceActivated") : t("sourceDeactivated") });
            loadSources();
        } catch (err: any) {
            toast({ title: t("error", { ns: "common" }), description: String(err), variant: "destructive" });
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
            toast({ title: t("sourceDeleted") });
            setPendingDeleteSource(null);
            await loadSources();
        } catch (err: any) {
            toast({ title: t("error", { ns: "common" }), description: String(err), variant: "destructive" });
        } finally {
            setDeletingSourceId(null);
        }
    }

    async function fetchAll() {
        const activeSources = sources.filter((source) => Boolean(source.active));
        if (activeSources.length === 0) {
            toast({ title: t("noActiveSourceToFetch") });
            return;
        }

        setIsFetchingAll(true);
        toast({ title: t("fetchingNSources", { count: activeSources.length }) });

        try {
            const result = await fetchSources(activeSources);
            if (result.insertedCount > 0) {
                dispatchSourceFetchSyncEvent();
            }
            toast({
                title: t("fetchAllComplete"),
                description: t("fetchAllCompleteDesc", { inserted: result.insertedCount, succeeded: result.successCount, failedPart: result.failCount > 0 ? `, ${result.failCount} failed` : "" }),
            });
        } catch (err: any) {
            toast({ title: t("fetchFailed"), description: String(err), variant: "destructive" });
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
            toast({ title: t("fetchingSource", { name: source.name }) });
            const result = await fetchSource(source);
            if (result.insertedCount > 0) {
                dispatchSourceFetchSyncEvent();
            }
            toast({
                title: t("fetchComplete"),
                description: t("fetchCompleteDesc", { fetched: result.fetchedCount, inserted: result.insertedCount }),
            });
        } catch (err: any) {
            toast({ title: t("fetchFailed"), description: String(err), variant: "destructive" });
        } finally {
            await loadSources();
            setFetchingSourceId(null);
        }
    }

    return (
        <>
            <PageShell
                variant="workspace"
                contentClassName="space-y-8"
                header={{
                    density: "compact",
                    eyebrow: t("eyebrow"),
                    title: t("title"),
                    showTitle: false,
                    titlelessLayout: "compact",
                    description: t("description"),
                    showDescription: false,
                    stats: [
                        { label: t("active", { ns: "common" }), value: t("activeCount", { count: activeSourceCount }), tone: "accent" },
                        { label: t("inactive", { ns: "common" }), value: t("inactiveCount", { count: inactiveSourceCount }) },
                    ],
                    actions: (
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={fetchAll} disabled={isAnyFetchInProgress || activeSourceCount === 0}>
                                <RefreshCcw className={`mr-2 h-4 w-4 ${isFetchingAll ? "animate-spin" : ""}`} />
                                {isFetchingAll ? t("fetchingAll") : t("fetchAll")}
                            </Button>
                            <Button onClick={() => navigate("/sources/add")}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t("addSource")}
                            </Button>
                        </div>
                    ),
                }}
            >

                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {sources.map((source) => (
                            <Card
                                key={source.id}
                                className={`flex flex-col ${!source.active ? "bg-muted/40 opacity-80" : ""}`}
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
                                        <p>{t("type")} {formatSourceTypeLabel(source.source_type)}</p>
                                        <p>{t("status")} {source.active ? t("active", { ns: "common" }) : t("inactive", { ns: "common" })}</p>
                                        <p>{formatFetchInterval(source.fetch_interval)}</p>
                                        <p>{formatLastFetchSummary(source.last_fetch)}</p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button variant="outline" size="sm" onClick={() => fetchNow(source)} disabled={!source.active || isAnyFetchInProgress}>
                                            <RefreshCcw className={`mr-2 h-4 w-4 ${fetchingSourceId === source.id ? "animate-spin" : ""}`} /> {t("fetch")}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => navigate(`/sources/edit/${source.id}`)}>
                                            <Edit className="mr-2 h-4 w-4" /> {t("edit", { ns: "common" })}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => toggleActive(source)} title={source.active ? t("deactivateSource") : t("activateSource")}>
                                            {source.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPendingDeleteSource(source)}
                                            className="ml-auto text-destructive"
                                            title={t("deleteSourceTitle")}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {sources.length === 0 && (
                            <div className="editor-empty col-span-full">
                                {t("noSourcesAdded")}
                            </div>
                        )}
                    </div>
                </div>
            </PageShell>

            <Dialog open={pendingDeleteSource !== null} onOpenChange={handleDeleteDialogOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("deleteSourceDialog")}</DialogTitle>
                        <DialogDescription>
                            {pendingDeleteSource
                                ? t("deleteSourceDesc", { name: pendingDeleteSource.name })
                                : t("deleteSourceDescGeneric")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={deletingSourceId !== null}
                            onClick={() => handleDeleteDialogOpenChange(false)}
                        >
                            {t("cancel", { ns: "common" })}
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
                            {t("delete", { ns: "common" })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
