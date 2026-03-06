import { useEffect, useMemo, useRef, useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ExternalLink, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { fetchSource, fetchSources, type FetchableSource } from "@/lib/source-fetch";

type Article = {
    id: number;
    source_id: number;
    source_name: string;
    guid: string;
    title: string;
    summary: string;
    published_at: string;
    inserted_at: string;
    is_read: boolean;
};

type SourceFilterItem = FetchableSource & {
    article_count: number;
};

type ParsedSourceParam = {
    sourceId: number | null;
    isWellFormed: boolean;
};

const MAIN_MENU_SCROLL_STORAGE_KEY = "mainMenuScrollPositions_v1";
const SOURCES_PANEL_WIDTH_STORAGE_KEY = "newsSourcesPanelWidth_v1";
const PAGE_SIZE = 20;
const DEFAULT_SOURCES_PANEL_WIDTH = 240;
const MIN_SOURCES_PANEL_WIDTH = 200;
const MAX_SOURCES_PANEL_WIDTH = 420;

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

function parsePageParam(rawPage: string | null): number {
    const parsed = Number.parseInt(rawPage ?? "0", 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
}

function parseSourceParam(rawSource: string | null): ParsedSourceParam {
    if (rawSource === null) return { sourceId: null, isWellFormed: true };
    if (!/^\d+$/.test(rawSource)) return { sourceId: null, isWellFormed: false };

    const parsed = Number.parseInt(rawSource, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return { sourceId: null, isWellFormed: false };

    return { sourceId: parsed, isWellFormed: true };
}

function buildListParams(page: number, query: string, sourceId: number | null): Record<string, string> {
    const params: Record<string, string> = {};
    const normalizedQuery = query.trim();
    const normalizedPage = Math.max(0, page);

    if (normalizedQuery) params.q = normalizedQuery;
    if (normalizedPage > 0) params.page = String(normalizedPage);
    if (sourceId !== null) params.source = String(sourceId);

    return params;
}

function clampSourcesPanelWidth(width: number): number {
    return Math.min(MAX_SOURCES_PANEL_WIDTH, Math.max(MIN_SOURCES_PANEL_WIDTH, width));
}

function readStoredSourcesPanelWidth(): number {
    try {
        const raw = localStorage.getItem(SOURCES_PANEL_WIDTH_STORAGE_KEY);
        if (!raw) return DEFAULT_SOURCES_PANEL_WIDTH;

        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return DEFAULT_SOURCES_PANEL_WIDTH;

        return clampSourcesPanelWidth(parsed);
    } catch {
        return DEFAULT_SOURCES_PANEL_WIDTH;
    }
}

type SourceFilterRowProps = {
    label: string;
    title: string;
    count: number;
    isSelected: boolean;
    isFetching: boolean;
    isDisabled: boolean;
    fetchAriaLabel: string;
    onSelect: () => void;
    onFetch: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

function SourceFilterRow({
    label,
    title,
    count,
    isSelected,
    isFetching,
    isDisabled,
    fetchAriaLabel,
    onSelect,
    onFetch,
}: SourceFilterRowProps) {
    return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
            <Button
                type="button"
                variant="ghost"
                className={cn(
                    "h-9 min-w-0 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-sky-100/70 dark:hover:bg-sky-900/35",
                    isSelected && "bg-sky-100 hover:bg-sky-100 dark:bg-sky-900/45 dark:hover:bg-sky-900/45",
                )}
                onClick={onSelect}
                title={title}
            >
                <span className="min-w-0 truncate text-sm">{label}</span>
                <span className={cn(
                    "min-w-[2.5rem] shrink-0 text-right text-xs tabular-nums",
                    isSelected ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground",
                )}>
                    {count}
                </span>
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-sky-100/70 hover:text-sky-700 dark:hover:bg-sky-900/35 dark:hover:text-sky-300"
                onClick={onFetch}
                disabled={isDisabled}
                aria-label={fetchAriaLabel}
                title={fetchAriaLabel}
            >
                <RefreshCcw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
        </div>
    );
}

export default function NewsList() {
    const { toast } = useToast();
    const [articles, setArticles] = useState<Article[]>([]);
    const [sources, setSources] = useState<SourceFilterItem[]>([]);
    const [sourcesLoaded, setSourcesLoaded] = useState(false);
    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [fetchingSourceId, setFetchingSourceId] = useState<number | null>(null);
    const [sourcesPanelWidth, setSourcesPanelWidth] = useState<number>(() => readStoredSourcesPanelWidth());
    const [isResizingSourcesPanel, setIsResizingSourcesPanel] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const page = parsePageParam(searchParams.get("page"));
    const search = searchParams.get("q") || "";
    const parsedSource = parseSourceParam(searchParams.get("source"));
    const [searchInput, setSearchInput] = useState(search);
    const resizeStartXRef = useRef(0);
    const resizeStartWidthRef = useRef(DEFAULT_SOURCES_PANEL_WIDTH);

    useEffect(() => {
        setSearchInput(search);
    }, [search]);

    useEffect(() => {
        try {
            localStorage.setItem(SOURCES_PANEL_WIDTH_STORAGE_KEY, String(sourcesPanelWidth));
        } catch {
            // Ignore persistence failures (e.g. storage restrictions).
        }
    }, [sourcesPanelWidth]);

    useEffect(() => {
        if (!isResizingSourcesPanel) return;

        const handlePointerMove = (event: PointerEvent) => {
            const delta = event.clientX - resizeStartXRef.current;
            setSourcesPanelWidth(clampSourcesPanelWidth(resizeStartWidthRef.current + delta));
        };

        const stopResizing = () => {
            setIsResizingSourcesPanel(false);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", stopResizing);
        window.addEventListener("pointercancel", stopResizing);
        window.addEventListener("blur", stopResizing);
        document.body.classList.add("cursor-col-resize", "select-none");

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", stopResizing);
            window.removeEventListener("pointercancel", stopResizing);
            window.removeEventListener("blur", stopResizing);
            document.body.classList.remove("cursor-col-resize", "select-none");
        };
    }, [isResizingSourcesPanel]);

    const activeSourceIds = useMemo(() => new Set(sources.map((source) => source.id)), [sources]);

    const selectedSourceId = useMemo(() => {
        if (parsedSource.sourceId === null) return null;
        if (!sourcesLoaded) return parsedSource.sourceId;
        return activeSourceIds.has(parsedSource.sourceId) ? parsedSource.sourceId : null;
    }, [activeSourceIds, parsedSource.sourceId, sourcesLoaded]);

    const allArticleCount = useMemo(
        () => sources.reduce((total, source) => total + source.article_count, 0),
        [sources],
    );
    const isAnyFetchInProgress = isFetchingAll || fetchingSourceId !== null;

    useEffect(() => {
        loadSources();
    }, []);

    useEffect(() => {
        loadArticles(page, search, selectedSourceId);
    }, [page, search, selectedSourceId]);

    useEffect(() => {
        if (parsedSource.isWellFormed) return;
        setSearchParams(buildListParams(page, search, null), { replace: true });
    }, [page, parsedSource.isWellFormed, search, setSearchParams]);

    useEffect(() => {
        if (!sourcesLoaded) return;
        if (parsedSource.sourceId === null) return;
        if (activeSourceIds.has(parsedSource.sourceId)) return;

        setSearchParams(buildListParams(page, search, null), { replace: true });
    }, [activeSourceIds, page, parsedSource.sourceId, search, setSearchParams, sourcesLoaded]);

    async function loadSources() {
        try {
            const db = await getDb();
            const result: SourceFilterItem[] = await db.select(`
                SELECT s.id, s.name, s.source_type, s.url, s.active, COUNT(a.id) as article_count
                FROM sources s
                LEFT JOIN articles a ON a.source_id = s.id
                WHERE s.active = 1
                GROUP BY s.id, s.name, s.source_type, s.url, s.active
                ORDER BY LOWER(s.name) ASC
            `);
            setSources(
                result.map((source) => ({
                    ...source,
                    article_count: Number(source.article_count) || 0,
                })),
            );
        } catch (err) {
            console.error(err);
        } finally {
            setSourcesLoaded(true);
        }
    }

    async function loadArticles(p: number, q: string, sourceId: number | null) {
        try {
            const db = await getDb();
            const normalizedQuery = q.trim();
            let query = `
                SELECT a.id, a.source_id, s.name as source_name, a.guid, a.title, a.summary, a.published_at, a.created_at as inserted_at, a.is_read
                FROM articles a
                JOIN sources s ON a.source_id = s.id
            `;
            const params: Array<number | string> = [];
            const conditions: string[] = ["s.active = 1"];

            if (normalizedQuery) {
                query += `
                    JOIN articles_fts ON a.id = articles_fts.rowid
                `;
                conditions.push(`articles_fts MATCH $${params.length + 1}`);
                params.push(normalizedQuery);
            }

            if (sourceId !== null) {
                conditions.push(`a.source_id = $${params.length + 1}`);
                params.push(sourceId);
            }

            query += ` WHERE ${conditions.join(" AND ")}`;
            query += ` ORDER BY a.created_at DESC LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}`;
            params.push(p * PAGE_SIZE);

            const result: Article[] = await db.select(query, params);
            setArticles(result);
        } catch (err) {
            console.error(err);
        }
    }

    async function refreshCurrentView() {
        await Promise.all([
            loadSources(),
            loadArticles(page, search, selectedSourceId),
        ]);
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        setSearchParams(buildListParams(0, searchInput, selectedSourceId));
    }

    function goToPage(p: number) {
        setSearchParams(buildListParams(p, search, selectedSourceId));
    }

    function selectSource(sourceId: number | null) {
        setSearchParams(buildListParams(0, search, sourceId));
    }

    function handleExternalLink(e: React.MouseEvent, url: string) {
        e.preventDefault();
        e.stopPropagation();
        openUrl(url);
    }

    function handleHtmlLinkClick(e: React.MouseEvent) {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && anchor.href) {
            e.preventDefault();
            e.stopPropagation();
            openUrl(anchor.href);
        }
    }

    function handleArticleClick() {
        const main = document.querySelector("main");
        if (!(main instanceof HTMLElement)) return;

        let scrollMap: Record<string, number> = {};
        const raw = sessionStorage.getItem(MAIN_MENU_SCROLL_STORAGE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    scrollMap = parsed as Record<string, number>;
                }
            } catch {
                scrollMap = {};
            }
        }

        scrollMap["/"] = Math.max(0, Math.floor(main.scrollTop));
        sessionStorage.setItem(MAIN_MENU_SCROLL_STORAGE_KEY, JSON.stringify(scrollMap));
    }

    function handleSourcesResizeStart(event: React.PointerEvent<HTMLDivElement>) {
        if (event.button !== 0) return;

        event.preventDefault();
        resizeStartXRef.current = event.clientX;
        resizeStartWidthRef.current = sourcesPanelWidth;
        setIsResizingSourcesPanel(true);
    }

    async function handleFetchAll(event: React.MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
        event.stopPropagation();

        if (isAnyFetchInProgress) return;
        if (sources.length === 0) {
            toast({ title: "No active sources to fetch" });
            return;
        }

        setIsFetchingAll(true);
        toast({ title: `Fetching ${sources.length} active sources...` });

        try {
            const result = await fetchSources(sources);
            toast({
                title: "Fetch All Complete",
                description: `Fetched ${result.insertedCount} new articles. ${result.successCount} succeeded${result.failCount > 0 ? `, ${result.failCount} failed` : ""}.`,
            });
        } catch (err: any) {
            toast({ title: "Fetch failed", description: String(err), variant: "destructive" });
        } finally {
            await refreshCurrentView();
            setIsFetchingAll(false);
        }
    }

    async function handleFetchSource(event: React.MouseEvent<HTMLButtonElement>, source: SourceFilterItem) {
        event.preventDefault();
        event.stopPropagation();

        if (isAnyFetchInProgress) return;

        setFetchingSourceId(source.id);
        toast({ title: `Fetching ${source.name}...` });

        try {
            const result = await fetchSource(source);
            toast({
                title: "Fetch complete",
                description: `Fetched ${result.fetchedCount} articles, saved ${result.insertedCount} new.`,
            });
        } catch (err: any) {
            toast({ title: "Fetch failed", description: String(err), variant: "destructive" });
        } finally {
            await refreshCurrentView();
            setFetchingSourceId(null);
        }
    }

    const hasActiveSources = sources.length > 0;
    const isAllSelected = selectedSourceId === null;

    let emptyStateMessage = "No articles found.";
    if (!hasActiveSources) {
        emptyStateMessage = "No active sources.";
    } else if (selectedSourceId !== null) {
        emptyStateMessage = "This source has no articles yet.";
    }

    const newsLayoutStyle = {
        "--news-sources-panel-width": `${sourcesPanelWidth}px`,
    } as React.CSSProperties;

    return (
        <div className="pt-0 px-4 md:px-6 pb-4 md:pb-6 max-w-7xl mx-auto flex flex-col gap-4 lg:h-full lg:overflow-hidden">
            <div className="flex justify-end">
                <form onSubmit={handleSearch} className="flex items-center space-x-2 relative w-full md:w-80">
                    <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
                    <Input
                        placeholder="Search articles..."
                        className="pl-9 border-sky-200/70 focus-visible:ring-sky-400/50 focus-visible:border-sky-300 dark:border-sky-900/60"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                </form>
            </div>

            <div
                className="grid gap-4 lg:gap-0 lg:grid-cols-[var(--news-sources-panel-width)_minmax(0,1fr)] lg:flex-1 lg:min-h-0"
                style={newsLayoutStyle}
            >
                <div className="relative min-w-0">
                    <div className="space-y-2 lg:pr-4 lg:border-r lg:border-r-sky-200/70 dark:lg:border-r-sky-900/60 lg:min-h-0 lg:flex lg:flex-col">
                        <div>
                            <h2 className="text-sm font-semibold text-sky-700/90 dark:text-sky-300/90 uppercase tracking-wide">Sources</h2>
                        </div>

                        <div className="space-y-1 pr-1 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                            <SourceFilterRow
                                label="All Articles"
                                title={`All Articles (${allArticleCount})`}
                                count={allArticleCount}
                                isSelected={isAllSelected}
                                isFetching={isFetchingAll}
                                isDisabled={isAnyFetchInProgress || !hasActiveSources}
                                fetchAriaLabel="Fetch all active sources"
                                onSelect={() => selectSource(null)}
                                onFetch={handleFetchAll}
                            />

                            {sources.map((source) => {
                                const isSelected = selectedSourceId === source.id;
                                return (
                                    <SourceFilterRow
                                        key={source.id}
                                        label={source.name}
                                        title={`${source.name} (${source.article_count})`}
                                        count={source.article_count}
                                        isSelected={isSelected}
                                        isFetching={fetchingSourceId === source.id}
                                        isDisabled={isAnyFetchInProgress}
                                        fetchAriaLabel={`Fetch ${source.name}`}
                                        onSelect={() => selectSource(source.id)}
                                        onFetch={(event) => void handleFetchSource(event, source)}
                                    />
                                );
                            })}

                            {sourcesLoaded && sources.length === 0 && (
                                <div className="text-xs text-muted-foreground border border-dashed rounded-md p-2">
                                    No active sources.
                                </div>
                            )}
                        </div>
                    </div>
                    <div
                        role="separator"
                        aria-label="Resize sources panel"
                        aria-orientation="vertical"
                        aria-valuemin={MIN_SOURCES_PANEL_WIDTH}
                        aria-valuemax={MAX_SOURCES_PANEL_WIDTH}
                        aria-valuenow={sourcesPanelWidth}
                        data-no-window-drag
                        onPointerDown={handleSourcesResizeStart}
                        className="absolute inset-y-0 -right-2 z-10 hidden w-4 touch-none cursor-col-resize lg:block"
                    >
                        <div
                            className={cn(
                                "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full transition-colors",
                                isResizingSourcesPanel
                                    ? "bg-sky-400/90 dark:bg-sky-500/90"
                                    : "bg-sky-200/80 dark:bg-sky-900/60",
                            )}
                        />
                    </div>
                </div>

                <div className="min-w-0 lg:pl-4 lg:min-h-0 flex flex-col gap-3">
                    <div className="space-y-3 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                        {articles.map(article => (
                            <Link to={`/news/${article.id}`} key={article.id} className="block" onClick={handleArticleClick}>
                                <Card className="border-0 shadow-none bg-transparent hover:bg-cyan-500/10 transition-colors duration-150">
                                    <CardHeader className="px-3 py-3">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mb-1">
                                            <span className="text-cyan-700 dark:text-cyan-300">{article.source_name}</span>
                                            <span>Published {new Date(article.published_at).toLocaleString()}</span>
                                            <span>Inserted {new Date(article.inserted_at).toLocaleString()}</span>
                                            {!article.is_read && <span className="bg-blue-500 w-2 h-2 rounded-full inline-block"></span>}
                                        </div>
                                        <CardTitle className="text-xl leading-tight">{article.title}</CardTitle>
                                        <div className="flex items-center gap-3 mt-2">
                                            {article.summary && (
                                                <CardDescription className="line-clamp-1 text-sm flex-1 min-w-0" dangerouslySetInnerHTML={{ __html: article.summary }} onClick={handleHtmlLinkClick} />
                                            )}
                                            {article.guid && (
                                                <a
                                                    href={article.guid}
                                                    className="inline-flex items-center text-xs text-muted-foreground hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors shrink-0"
                                                    onClick={(e) => handleExternalLink(e, article.guid)}
                                                >
                                                    <ExternalLink className="w-3 h-3 mr-1" />
                                                    Original
                                                </a>
                                            )}
                                        </div>
                                    </CardHeader>
                                </Card>
                            </Link>
                        ))}

                        {articles.length === 0 && (
                            <div className="text-center py-10 text-muted-foreground">
                                {emptyStateMessage}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                        <Button variant="outline" onClick={() => goToPage(Math.max(0, page - 1))} disabled={page === 0 || !hasActiveSources}>
                            Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                        <Button variant="outline" onClick={() => goToPage(page + 1)} disabled={articles.length < PAGE_SIZE || !hasActiveSources}>
                            Next
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
