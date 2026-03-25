import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { AlertTriangle, ChevronDown, Edit, Plus, Power, PowerOff, RefreshCcw, Trash2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { dispatchNewsSyncEvent } from "@/lib/news-events";
import { addSourceFetchSyncListener, dispatchSourceFetchSyncEvent } from "@/lib/source-events";
import { normalizeSourceUrl, parseOpmlText, type ImportOpmlMode, type OpmlSourceEntry } from "@/lib/source-opml";
import { fetchSource, fetchSources } from "@/lib/source-fetch";
import {
    deleteSource as deleteSourceRecord,
    importOpmlSources,
    listSources,
    setSourceActive,
    type ManagedSource,
} from "@/lib/source-service";
import { formatFetchInterval, formatLastFetchSummary } from "@/lib/source-utils";

function formatSourceTypeLabel(sourceType: string, t: ReturnType<typeof useTranslation>["t"]): string {
    switch (sourceType) {
        case "rss":
            return t("rssAtomFeed");
        default:
            return sourceType;
    }
}

type PendingImport = {
    entries: OpmlSourceEntry[];
    duplicateCount: number;
    missingFetchIntervalCount: number;
    skippedDuplicateCount: number;
    skippedInvalidCount: number;
};

function countDuplicateEntries(entries: OpmlSourceEntry[], existingSources: ManagedSource[]): number {
    const existingUrls = new Set(
        existingSources
            .map((source) => normalizeSourceUrl(source.url))
            .filter((url): url is string => Boolean(url)),
    );

    let duplicateCount = 0;

    for (const entry of entries) {
        const normalizedUrl = normalizeSourceUrl(entry.url);
        if (normalizedUrl && existingUrls.has(normalizedUrl)) {
            duplicateCount += 1;
        }
    }

    return duplicateCount;
}

function countMissingFetchIntervals(entries: OpmlSourceEntry[]): number {
    return entries.filter((entry) => entry.fetchInterval === null).length;
}

function parseMissingFetchIntervalInput(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (!/^\d+$/.test(trimmed)) {
        return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function SourceManager() {
    const { t } = useTranslation("sources");
    const { toast } = useToast();
    const navigate = useNavigate();
    const [sources, setSources] = useState<ManagedSource[]>([]);
    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [fetchingSourceId, setFetchingSourceId] = useState<number | null>(null);
    const [pendingDeleteSource, setPendingDeleteSource] = useState<ManagedSource | null>(null);
    const [deletingSourceId, setDeletingSourceId] = useState<number | null>(null);
    const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
    const [missingFetchIntervalInput, setMissingFetchIntervalInput] = useState("");
    const [isImportingOpml, setIsImportingOpml] = useState(false);

    const activeSourceCount = sources.filter((source) => source.active).length;
    const inactiveSourceCount = Math.max(0, sources.length - activeSourceCount);
    const isAnyFetchInProgress = isFetchingAll || fetchingSourceId !== null;
    const isAnyActionInProgress = isAnyFetchInProgress || deletingSourceId !== null || isImportingOpml;
    const isManagerLocked = isAnyActionInProgress || pendingImport !== null;
    const requiresMissingFetchInterval = (pendingImport?.missingFetchIntervalCount ?? 0) > 0;
    const missingFetchIntervalFallback = requiresMissingFetchInterval
        ? parseMissingFetchIntervalInput(missingFetchIntervalInput)
        : null;
    const isPendingImportReady = !requiresMissingFetchInterval || missingFetchIntervalFallback !== null;

    useEffect(() => {
        void loadSources();
        return addSourceFetchSyncListener(() => {
            void loadSources();
        });
    }, []);

    async function loadSources() {
        try {
            setSources(await listSources());
        } catch (err) {
            console.error(err);
        }
    }

    async function toggleActive(source: ManagedSource) {
        try {
            const nextActive = !source.active;
            await setSourceActive(source.id, nextActive);
            dispatchNewsSyncEvent();
            toast({ title: nextActive ? t("sourceActivated") : t("sourceDeactivated") });
            await loadSources();
        } catch (err: unknown) {
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

    function handleImportReviewDialogOpenChange(open: boolean) {
        if (isImportingOpml) {
            return;
        }

        if (!open) {
            setPendingImport(null);
            setMissingFetchIntervalInput("");
        }
    }

    async function deleteSource(sourceId: number) {
        setDeletingSourceId(sourceId);
        try {
            await deleteSourceRecord(sourceId);
            dispatchNewsSyncEvent();
            toast({ title: t("sourceDeleted") });
            setPendingDeleteSource(null);
            await loadSources();
        } catch (err: unknown) {
            toast({ title: t("error", { ns: "common" }), description: String(err), variant: "destructive" });
        } finally {
            setDeletingSourceId(null);
        }
    }

    async function fetchAll() {
        const activeSources = sources.filter((source) => source.active);
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
                dispatchNewsSyncEvent();
            }
            toast({
                title: t("fetchAllComplete"),
                description: t("fetchAllCompleteDesc", {
                    inserted: result.insertedCount,
                    succeeded: result.successCount,
                    failedPart: result.failCount > 0 ? `, ${result.failCount} failed` : "",
                }),
            });
        } catch (err: unknown) {
            toast({ title: t("fetchFailed"), description: String(err), variant: "destructive" });
        } finally {
            await loadSources();
            setIsFetchingAll(false);
        }
    }

    async function fetchNow(source: ManagedSource) {
        if (!source.active) {
            return;
        }

        setFetchingSourceId(source.id);
        try {
            toast({ title: t("fetchingSource", { name: source.name }) });
            const result = await fetchSource(source);
            if (result.insertedCount > 0) {
                dispatchSourceFetchSyncEvent();
                dispatchNewsSyncEvent();
            }
            toast({
                title: t("fetchComplete"),
                description: t("fetchCompleteDesc", { fetched: result.fetchedCount, inserted: result.insertedCount }),
            });
        } catch (err: unknown) {
            toast({ title: t("fetchFailed"), description: String(err), variant: "destructive" });
        } finally {
            await loadSources();
            setFetchingSourceId(null);
        }
    }

    async function importEntries(
        payload: PendingImport,
        mode: ImportOpmlMode,
        importedMissingFetchInterval: number | null,
    ) {
        const importResult = await importOpmlSources(payload.entries, mode, importedMissingFetchInterval);
        const summary = {
            insertedCount: importResult.insertedCount,
            updatedCount: importResult.updatedCount,
            skippedDuplicateCount: importResult.skippedDuplicateCount + payload.skippedDuplicateCount,
            skippedInvalidCount: importResult.skippedInvalidCount + payload.skippedInvalidCount,
        };

        if (summary.insertedCount > 0 || summary.updatedCount > 0) {
            dispatchNewsSyncEvent();
        }
        await loadSources();
        toast({
            title: t("importOpmlComplete"),
            description: t("importOpmlCompleteDesc", {
                inserted: summary.insertedCount,
                updated: summary.updatedCount,
                duplicates: summary.skippedDuplicateCount,
                invalid: summary.skippedInvalidCount,
            }),
        });
    }

    async function handleImportOpml() {
        setIsImportingOpml(true);

        try {
            const selectedPath = await open({
                title: t("importOpmlDialogTitle"),
                filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
                multiple: false,
                directory: false,
            });

            if (!selectedPath || Array.isArray(selectedPath)) {
                return;
            }

            const fileContents = await readTextFile(selectedPath);
            const parsed = parseOpmlText(fileContents);

            if (parsed.entries.length === 0) {
                toast({
                    title: t("importOpmlNoFeeds"),
                    description: t("importOpmlNoFeedsDesc", { invalid: parsed.skippedInvalidCount }),
                    variant: "destructive",
                });
                return;
            }

            const latestSources = await listSources();
            const payload: PendingImport = {
                entries: parsed.entries,
                duplicateCount: countDuplicateEntries(parsed.entries, latestSources),
                missingFetchIntervalCount: countMissingFetchIntervals(parsed.entries),
                skippedDuplicateCount: parsed.skippedDuplicateCount,
                skippedInvalidCount: parsed.skippedInvalidCount,
            };

            if (payload.duplicateCount === 0 && payload.missingFetchIntervalCount === 0) {
                await importEntries(payload, "skip", null);
                return;
            }

            setMissingFetchIntervalInput(payload.missingFetchIntervalCount > 0 ? "60" : "");
            setPendingImport(payload);
        } catch (err: unknown) {
            toast({ title: t("importOpmlFailed"), description: String(err), variant: "destructive" });
        } finally {
            setIsImportingOpml(false);
        }
    }

    async function confirmImport(mode: ImportOpmlMode) {
        if (!pendingImport) {
            return;
        }

        const importPayload = pendingImport;
        const importMissingFetchInterval = importPayload.missingFetchIntervalCount > 0
            ? parseMissingFetchIntervalInput(missingFetchIntervalInput)
            : null;

        if (importPayload.missingFetchIntervalCount > 0 && importMissingFetchInterval === null) {
            return;
        }

        setPendingImport(null);
        setIsImportingOpml(true);

        try {
            await importEntries(importPayload, mode, importMissingFetchInterval);
        } catch (err: unknown) {
            toast({ title: t("importOpmlFailed"), description: String(err), variant: "destructive" });
        } finally {
            setMissingFetchIntervalInput("");
            setIsImportingOpml(false);
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
                            <Button
                                variant="outline"
                                onClick={() => void fetchAll()}
                                disabled={isManagerLocked || activeSourceCount === 0}
                            >
                                <RefreshCcw className={`mr-2 h-4 w-4 ${isFetchingAll ? "animate-spin" : ""}`} />
                                {isFetchingAll ? t("fetchingAll") : t("fetchAll")}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={isManagerLocked}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        {t("addSource")}
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onSelect={() => navigate("/sources/add")}>
                                        <Plus className="h-4 w-4" />
                                        {t("createSourceAction")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => void handleImportOpml()}>
                                        <Upload className="h-4 w-4" />
                                        {isImportingOpml ? t("importingOpml") : t("importOpml")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
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
                                        <p>{t("type")} {formatSourceTypeLabel(source.source_type, t)}</p>
                                        <p>{t("status")} {source.active ? t("active", { ns: "common" }) : t("inactive", { ns: "common" })}</p>
                                        <p>{formatFetchInterval(source.fetch_interval)}</p>
                                        <p>{formatLastFetchSummary(source.last_fetch)}</p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void fetchNow(source)}
                                            disabled={!source.active || isManagerLocked}
                                        >
                                            <RefreshCcw className={`mr-2 h-4 w-4 ${fetchingSourceId === source.id ? "animate-spin" : ""}`} />
                                            {t("fetch")}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => navigate(`/sources/edit/${source.id}`)}
                                            disabled={isManagerLocked}
                                        >
                                            <Edit className="mr-2 h-4 w-4" /> {t("edit", { ns: "common" })}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void toggleActive(source)}
                                            title={source.active ? t("deactivateSource") : t("activateSource")}
                                            disabled={isManagerLocked}
                                        >
                                            {source.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPendingDeleteSource(source)}
                                            className="ml-auto text-destructive"
                                            title={t("deleteSourceTitle")}
                                            disabled={isManagerLocked}
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

            <Dialog open={pendingImport !== null} onOpenChange={handleImportReviewDialogOpenChange}>
                <DialogContent
                    className="border-amber-200/90 bg-amber-50/95 text-stone-950 shadow-2xl dark:border-amber-300/30 dark:bg-stone-900/96 dark:text-amber-50"
                    overlayClassName="bg-stone-950/35 backdrop-blur-sm"
                    closeButtonClassName="border-amber-200/90 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-300/25 dark:bg-stone-800 dark:text-amber-100 dark:hover:bg-stone-700"
                >
                    <DialogHeader>
                        <DialogTitle className="text-xl text-stone-950 dark:text-amber-50">
                            {t("importOpmlReviewTitle")}
                        </DialogTitle>
                        <DialogDescription className="text-stone-700 dark:text-amber-100/85">
                            {t("importOpmlReviewDesc", { count: pendingImport?.entries.length ?? 0 })}
                        </DialogDescription>
                    </DialogHeader>

                    {pendingImport && (
                        <div className="space-y-4">
                            <div className="rounded-[1.5rem] border border-amber-200/90 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-50 p-4 text-amber-950 shadow-sm dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-50">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                                    <div className="space-y-2">
                                        <p className="font-semibold">{t("importOpmlReviewSummary")}</p>
                                        {pendingImport.duplicateCount > 0 && (
                                            <p className="text-sm">{t("importOpmlReviewDuplicates", { count: pendingImport.duplicateCount })}</p>
                                        )}
                                        {pendingImport.missingFetchIntervalCount > 0 && (
                                            <p className="text-sm">
                                                {t("importOpmlReviewMissingFetchInterval", {
                                                    count: pendingImport.missingFetchIntervalCount,
                                                })}
                                            </p>
                                        )}
                                        {pendingImport.skippedDuplicateCount > 0 && (
                                            <p className="text-sm">
                                                {t("importOpmlReviewFileDuplicates", {
                                                    count: pendingImport.skippedDuplicateCount,
                                                })}
                                            </p>
                                        )}
                                        {pendingImport.skippedInvalidCount > 0 && (
                                            <p className="text-sm">
                                                {t("importOpmlReviewInvalid", { count: pendingImport.skippedInvalidCount })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {pendingImport.missingFetchIntervalCount > 0 && (
                                <div className="space-y-3 rounded-[1.5rem] border border-amber-200/80 bg-stone-50/90 p-4 dark:border-amber-300/20 dark:bg-stone-800/80">
                                    <Label
                                        htmlFor="import-opml-fetch-interval"
                                        className="text-stone-900 dark:text-amber-50"
                                    >
                                        {t("importOpmlMissingFetchIntervalLabel")}
                                    </Label>
                                    <Input
                                        id="import-opml-fetch-interval"
                                        type="number"
                                        min="0"
                                        step="1"
                                        inputMode="numeric"
                                        value={missingFetchIntervalInput}
                                        onChange={(event) => setMissingFetchIntervalInput(event.target.value)}
                                        placeholder={t("importOpmlMissingFetchIntervalPlaceholder")}
                                        className="border-amber-200/90 bg-white text-stone-950 placeholder:text-stone-500 focus-visible:border-amber-500 focus-visible:ring-amber-500/30 dark:border-amber-300/20 dark:bg-stone-900 dark:text-amber-50 dark:placeholder:text-stone-400"
                                    />
                                    <p className="text-xs text-stone-600 dark:text-stone-300">
                                        {t("importOpmlMissingFetchIntervalHelp", {
                                            count: pendingImport.missingFetchIntervalCount,
                                        })}
                                    </p>
                                    {!isPendingImportReady && (
                                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                                            {t("importOpmlMissingFetchIntervalRequired")}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isImportingOpml}
                            onClick={() => handleImportReviewDialogOpenChange(false)}
                            className="border-amber-200/90 bg-stone-50 text-stone-700 hover:bg-amber-50 dark:border-amber-300/20 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                        >
                            {t("cancel", { ns: "common" })}
                        </Button>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            {pendingImport?.duplicateCount ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isImportingOpml || !isPendingImportReady}
                                        onClick={() => void confirmImport("overwrite")}
                                        className="border-amber-300/90 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-50 dark:hover:bg-amber-400/15"
                                    >
                                        {t("importModeOverwrite")}
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={isImportingOpml || !isPendingImportReady}
                                        onClick={() => void confirmImport("skip")}
                                        className="bg-amber-400 text-amber-950 shadow-soft hover:bg-amber-300 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                                    >
                                        {t("importModeSkip")}
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    type="button"
                                    disabled={isImportingOpml || !isPendingImportReady}
                                    onClick={() => void confirmImport("skip")}
                                    className="bg-amber-400 text-amber-950 shadow-soft hover:bg-amber-300 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                                >
                                    {t("confirmImportOpml")}
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
