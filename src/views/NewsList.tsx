import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, ExternalLink, RefreshCcw, ChevronLeft, ChevronRight, MoreHorizontal, Plus, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { fetchSource, fetchSources } from "@/lib/source-fetch";
import { addSourceFetchSyncListener, dispatchSourceFetchSyncEvent } from "@/lib/source-events";
import { getDb } from "@/lib/db";
import { formatFetchInterval, formatLastFetchSummary } from "@/lib/source-utils";
import { formatUtcDateTime } from "@/lib/time";
import { resolveArticlePreview, sanitizeArticleHtml } from "@/lib/article-html";
import { listNewsSources, markScopedNewsArticlesAsRead, type NewsSource } from "@/lib/news-service";
import { ArticleDetailView } from "@/views/NewsDetail";

type Article = {
    id: number;
    source_id: number;
    source_name: string;
    guid: string;
    title: string;
    summary: string | null;
    content: string | null;
    published_at: string;
    inserted_at: string;
    is_read: boolean;
};

type SourceFilterItem = NewsSource;

type ParsedSourceParam = {
    sourceId: number | null;
    isWellFormed: boolean;
};

type PaginationItem =
    | { type: "page"; page: number }
    | { type: "ellipsis"; key: string };

const NEWS_LIST_SCROLL_STORAGE_KEY = "newsListScrollPositions_v1";
const SOURCES_PANEL_WIDTH_STORAGE_KEY = "newsSourcesPanelWidth_v1";
const NEWS_PATHNAME = "/";
const DESKTOP_LAYOUT_MEDIA_QUERY = "(min-width: 1024px)";
const NEWS_SCROLL_RESTORE_TOLERANCE_PX = 2;
const NEWS_SCROLL_MAX_RESTORE_ATTEMPTS = 180;
const PAGE_SIZE = 20;
const DEFAULT_SOURCES_PANEL_WIDTH = 240;
const MIN_SOURCES_PANEL_WIDTH = 200;
const MAX_SOURCES_PANEL_WIDTH = 420;
const SOURCE_ACTION_BUTTON_CLASS_NAME = "h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-sky-100/70 hover:text-sky-700 dark:hover:bg-sky-900/35 dark:hover:text-sky-300";

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

function buildSearchString(params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    return query ? `?${query}` : "";
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

function normalizeStoredScrollTop(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

function parseStoredNewsListScrollMap(raw: string | null): Record<string, number> {
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};

        return Object.fromEntries(
            Object.entries(parsed).flatMap(([key, value]) => (
                typeof value === "number" ? [[key, normalizeStoredScrollTop(value)]] : []
            )),
        );
    } catch {
        return {};
    }
}

function buildNewsListScrollKey(page: number, query: string, sourceId: number | null): string {
    return `${NEWS_PATHNAME}${buildSearchString(buildListParams(page, query, sourceId))}`;
}

function readStoredNewsListScroll(listKey: string): number {
    try {
        const map = parseStoredNewsListScrollMap(sessionStorage.getItem(NEWS_LIST_SCROLL_STORAGE_KEY));
        return normalizeStoredScrollTop(map[listKey] ?? 0);
    } catch {
        return 0;
    }
}

function persistNewsListScroll(listKey: string, scrollTop: number): void {
    try {
        const map = parseStoredNewsListScrollMap(sessionStorage.getItem(NEWS_LIST_SCROLL_STORAGE_KEY));
        map[listKey] = normalizeStoredScrollTop(scrollTop);
        sessionStorage.setItem(NEWS_LIST_SCROLL_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Ignore persistence failures (e.g. storage restrictions).
    }
}

function buildArticleQueryParts(query: string, sourceId: number | null) {
    const normalizedQuery = query.trim();
    const params: Array<number | string> = [];
    const conditions: string[] = ["s.active = 1"];
    let joins = "";

    if (normalizedQuery) {
        joins += `
            JOIN articles_fts ON a.id = articles_fts.rowid
        `;
        conditions.push(`articles_fts MATCH $${params.length + 1}`);
        params.push(normalizedQuery);
    }

    if (sourceId !== null) {
        conditions.push(`a.source_id = $${params.length + 1}`);
        params.push(sourceId);
    }

    return {
        joins,
        conditions,
        params,
    };
}

function buildPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
    if (totalPages <= 1) return [];

    const candidatePages = new Set(
        [0, totalPages - 1, currentPage - 1, currentPage, currentPage + 1]
            .filter((page) => page >= 0 && page < totalPages),
    );

    const sortedPages = Array.from(candidatePages).sort((left, right) => left - right);
    const items: PaginationItem[] = [];

    let previousPage: number | null = null;
    for (const page of sortedPages) {
        if (previousPage !== null) {
            const gap = page - previousPage;

            if (gap === 2) {
                items.push({ type: "page", page: previousPage + 1 });
            } else if (gap > 2) {
                items.push({ type: "ellipsis", key: `ellipsis-${previousPage}-${page}` });
            }
        }

        items.push({ type: "page", page });
        previousPage = page;
    }

    return items;
}

function formatUnreadArticleCount(count: number): string {
    return count > 99 ? "99+" : String(Math.max(0, count));
}

type SourceFilterRowProps = {
    label: string;
    title: string;
    count: number;
    unreadCount: number;
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
    unreadCount,
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
                <span className="inline-flex min-w-[4.75rem] shrink-0 items-center justify-end gap-1.5">
                    <span className={cn(
                        "text-right text-xs tabular-nums",
                        isSelected ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground",
                    )}>
                        {count}
                    </span>
                    {unreadCount > 0 && (
                        <span
                            className="inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none tabular-nums text-white shadow-[0_8px_18px_-14px_rgba(239,68,68,0.95)] ring-1 ring-background dark:bg-red-500 dark:ring-slate-950"
                        >
                            {formatUnreadArticleCount(unreadCount)}
                        </span>
                    )}
                </span>
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className={SOURCE_ACTION_BUTTON_CLASS_NAME}
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
    const location = useLocation();
    const navigate = useNavigate();
    const { id: articleIdParam } = useParams();
    const [articles, setArticles] = useState<Article[]>([]);
    const [totalArticleCount, setTotalArticleCount] = useState<number | null>(null);
    const [sources, setSources] = useState<SourceFilterItem[]>([]);
    const [sourcesLoaded, setSourcesLoaded] = useState(false);
    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [fetchingSourceId, setFetchingSourceId] = useState<number | null>(null);
    const [isMarkingScopedRead, setIsMarkingScopedRead] = useState(false);
    const [sourcesPanelWidth, setSourcesPanelWidth] = useState<number>(() => readStoredSourcesPanelWidth());
    const [isResizingSourcesPanel, setIsResizingSourcesPanel] = useState(false);
    const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia(DESKTOP_LAYOUT_MEDIA_QUERY).matches;
    });
    const [searchParams, setSearchParams] = useSearchParams();
    const page = parsePageParam(searchParams.get("page"));
    const search = searchParams.get("q") || "";
    const parsedSource = parseSourceParam(searchParams.get("source"));
    const selectedArticleId = useMemo(() => {
        if (!articleIdParam) return null;

        const parsed = Number.parseInt(articleIdParam, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;

        return parsed;
    }, [articleIdParam]);
    const hasSelectedArticle = selectedArticleId !== null;
    const [searchInput, setSearchInput] = useState(search);
    const resizeStartXRef = useRef(0);
    const resizeStartWidthRef = useRef(DEFAULT_SOURCES_PANEL_WIDTH);
    const articlesScrollRef = useRef<HTMLDivElement>(null);

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
        const mediaQueryList = window.matchMedia(DESKTOP_LAYOUT_MEDIA_QUERY);
        const handleChange = (event: MediaQueryListEvent) => {
            setIsDesktopLayout(event.matches);
        };

        setIsDesktopLayout(mediaQueryList.matches);
        mediaQueryList.addEventListener("change", handleChange);

        return () => {
            mediaQueryList.removeEventListener("change", handleChange);
        };
    }, []);

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
    const allUnreadCount = useMemo(
        () => sources.reduce((total, source) => total + source.unread_count, 0),
        [sources],
    );
    const selectedSource = useMemo(() => {
        if (selectedSourceId === null) return null;

        return sources.find((source) => source.id === selectedSourceId) ?? null;
    }, [selectedSourceId, sources]);
    const scopedUnreadCount = selectedSource?.unread_count ?? allUnreadCount;
    const hasActiveSources = sources.length > 0;
    const isAllSelected = selectedSourceId === null;
    const isAnyFetchInProgress = isFetchingAll || fetchingSourceId !== null;
    const totalPages = totalArticleCount === null ? null : Math.ceil(totalArticleCount / PAGE_SIZE);
    const paginationItems = useMemo(
        () => (totalPages && totalPages > 1 ? buildPaginationItems(page, totalPages) : []),
        [page, totalPages],
    );
    const hasPaginationPages = totalPages !== null && totalPages > 0;
    const canGoToPreviousPage = hasActiveSources && page > 0;
    const canGoToNextPage = hasActiveSources && (
        totalPages !== null
            ? page < totalPages - 1
            : articles.length === PAGE_SIZE
    );
    const compactPaginationLabel = totalPages === null
        ? "Loading pages..."
        : hasPaginationPages
            ? `Page ${Math.min(page + 1, totalPages)} / ${totalPages}`
            : "No more pages";
    const resultSummaryLabel = totalArticleCount === null
        ? "Loading results..."
        : `${totalArticleCount} result${totalArticleCount === 1 ? "" : "s"}`;
    const activeSourceSummaryLabel = `${sources.length} active source${sources.length === 1 ? "" : "s"}`;
    const markScopedReadLabel = selectedSource
        ? `Mark all unread in ${selectedSource.name} as read`
        : "Mark all unread in all active sources as read";
    const shouldRenderDetailOverlay = isDesktopLayout && selectedArticleId !== null;
    const shouldRenderStandaloneDetail = !isDesktopLayout && selectedArticleId !== null;
    const newsListScrollKey = useMemo(
        () => buildNewsListScrollKey(page, search, selectedSourceId),
        [page, search, selectedSourceId],
    );

    useEffect(() => {
        if (!isDesktopLayout || hasSelectedArticle) return;

        const container = articlesScrollRef.current;
        if (!container) return;

        const handleScroll = () => {
            persistNewsListScroll(newsListScrollKey, container.scrollTop);
        };

        container.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            persistNewsListScroll(newsListScrollKey, container.scrollTop);
            container.removeEventListener("scroll", handleScroll);
        };
    }, [hasSelectedArticle, isDesktopLayout, newsListScrollKey]);

    useEffect(() => {
        if (!isDesktopLayout || hasSelectedArticle) return;

        const targetScrollTop = readStoredNewsListScroll(newsListScrollKey);
        let animationFrame: number | null = null;
        let restoreAttempts = 0;

        const restoreScrollPosition = () => {
            const container = articlesScrollRef.current;
            if (!container) return;

            container.scrollTop = targetScrollTop;

            const reachedTarget = Math.abs(container.scrollTop - targetScrollTop) <= NEWS_SCROLL_RESTORE_TOLERANCE_PX;
            if (reachedTarget || restoreAttempts >= NEWS_SCROLL_MAX_RESTORE_ATTEMPTS) {
                return;
            }

            restoreAttempts += 1;
            animationFrame = window.requestAnimationFrame(restoreScrollPosition);
        };

        animationFrame = window.requestAnimationFrame(restoreScrollPosition);

        return () => {
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }
        };
    }, [articles.length, hasSelectedArticle, isDesktopLayout, newsListScrollKey]);

    useEffect(() => {
        void loadSources();
    }, []);

    useEffect(() => (
        addSourceFetchSyncListener(() => {
            void refreshCurrentView();
        })
    ), [page, search, selectedSourceId]);

    useEffect(() => {
        loadArticles(page, search, selectedSourceId);
    }, [page, search, selectedSourceId]);

    useEffect(() => {
        loadTotalArticleCount(search, selectedSourceId);
    }, [search, selectedSourceId]);

    useEffect(() => {
        if (parsedSource.isWellFormed) return;
        setSearchParams(buildListParams(page, search, null), { replace: true });
    }, [page, parsedSource.isWellFormed, search, setSearchParams]);

    useEffect(() => {
        if (articleIdParam === undefined || selectedArticleId !== null) return;
        navigate({
            pathname: "/",
            search: searchParams.toString() ? `?${searchParams.toString()}` : "",
        }, { replace: true });
    }, [articleIdParam, navigate, searchParams, selectedArticleId]);

    useEffect(() => {
        if (!sourcesLoaded) return;
        if (parsedSource.sourceId === null) return;
        if (activeSourceIds.has(parsedSource.sourceId)) return;

        setSearchParams(buildListParams(page, search, null), { replace: true });
    }, [activeSourceIds, page, parsedSource.sourceId, search, setSearchParams, sourcesLoaded]);

    useEffect(() => {
        if (totalPages === null) return;

        const lastValidPage = totalPages > 0 ? totalPages - 1 : 0;
        if (page <= lastValidPage) return;

        setSearchParams(buildListParams(lastValidPage, search, selectedSourceId), { replace: true });
    }, [page, search, selectedSourceId, setSearchParams, totalPages]);

    async function loadSources() {
        try {
            setSources(await listNewsSources());
        } catch (err) {
            console.error(err);
        } finally {
            setSourcesLoaded(true);
        }
    }

    async function loadArticles(p: number, q: string, sourceId: number | null) {
        try {
            const db = await getDb();
            const { joins, conditions, params } = buildArticleQueryParts(q, sourceId);
            const query = `
                SELECT a.id, a.source_id, s.name as source_name, a.guid, a.title, a.summary, a.content, a.published_at, a.created_at as inserted_at, a.is_read
                FROM articles a
                JOIN sources s ON a.source_id = s.id
                ${joins}
                WHERE ${conditions.join(" AND ")}
                ORDER BY a.created_at DESC LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}
            `;
            const listParams = [...params, p * PAGE_SIZE];

            const result: Article[] = await db.select(query, listParams);
            setArticles(result.map((article) => ({
                ...article,
                summary: article.summary ?? null,
                content: article.content ?? null,
            })));
        } catch (err) {
            console.error(err);
        }
    }

    async function loadTotalArticleCount(q: string, sourceId: number | null) {
        setTotalArticleCount(null);

        try {
            const db = await getDb();
            const { joins, conditions, params } = buildArticleQueryParts(q, sourceId);
            const result: Array<{ total_count: number }> = await db.select(`
                SELECT COUNT(DISTINCT a.id) as total_count
                FROM articles a
                JOIN sources s ON a.source_id = s.id
                ${joins}
                WHERE ${conditions.join(" AND ")}
            `, params);

            setTotalArticleCount(Number(result[0]?.total_count ?? 0));
        } catch (err) {
            console.error(err);
            setTotalArticleCount(0);
        }
    }

    async function refreshCurrentView() {
        await Promise.all([
            loadSources(),
            loadArticles(page, search, selectedSourceId),
            loadTotalArticleCount(search, selectedSourceId),
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
        const nextParams = buildListParams(0, search, sourceId);

        if (hasSelectedArticle) {
            navigate({
                pathname: "/",
                search: buildSearchString(nextParams),
            });
            return;
        }

        setSearchParams(nextParams);
    }

    function handleAddSource() {
        const returnTo = `${location.pathname}${location.search}`;
        const params = new URLSearchParams({ returnTo });
        navigate({
            pathname: "/sources/add",
            search: `?${params.toString()}`,
        });
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
        if (isDesktopLayout && articlesScrollRef.current) {
            persistNewsListScroll(newsListScrollKey, articlesScrollRef.current.scrollTop);
        }
    }

    function buildArticleHref(articleId: number) {
        return `/news/${articleId}${buildSearchString(buildListParams(page, search, selectedSourceId))}`;
    }

    function closeArticleDetail() {
        navigate({
            pathname: "/",
            search: buildSearchString(buildListParams(page, search, selectedSourceId)),
        });
    }

    function markArticleAsRead(articleId: number) {
        const targetArticle = articles.find((article) => article.id === articleId);
        if (!targetArticle || targetArticle.is_read) {
            return;
        }

        setArticles((currentArticles) => currentArticles.map((article) => (
            article.id === articleId ? { ...article, is_read: true } : article
        )));
        setSources((currentSources) => currentSources.map((source) => (
            source.id === targetArticle.source_id
                ? { ...source, unread_count: Math.max(0, source.unread_count - 1) }
                : source
        )));
    }

    function markVisibleArticlesInScopeAsRead(sourceId: number | null) {
        setArticles((currentArticles) => currentArticles.map((article) => {
            if (article.is_read) {
                return article;
            }

            if (sourceId !== null && article.source_id !== sourceId) {
                return article;
            }

            return { ...article, is_read: true };
        }));
    }

    function clearUnreadCountsInScope(sourceId: number | null) {
        setSources((currentSources) => currentSources.map((source) => {
            if (sourceId !== null && source.id !== sourceId) {
                return source;
            }

            if (source.unread_count === 0) {
                return source;
            }

            return { ...source, unread_count: 0 };
        }));
    }

    async function handleMarkScopedRead() {
        if (isMarkingScopedRead || scopedUnreadCount === 0) {
            return;
        }

        setIsMarkingScopedRead(true);
        markVisibleArticlesInScopeAsRead(selectedSourceId);
        clearUnreadCountsInScope(selectedSourceId);

        try {
            await markScopedNewsArticlesAsRead(selectedSourceId);
        } catch (error) {
            toast({ title: "Failed to mark articles as read", description: String(error), variant: "destructive" });
            await refreshCurrentView();
        } finally {
            setIsMarkingScopedRead(false);
        }
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
            await refreshCurrentView();
            setFetchingSourceId(null);
        }
    }

    let emptyStateMessage = "No articles found.";
    if (!hasActiveSources) {
        emptyStateMessage = "No active sources.";
    } else if (selectedSourceId !== null) {
        emptyStateMessage = "This source has no articles yet.";
    }

    return (
        <div className="flex w-full min-w-0 flex-col gap-4 p-4 pb-4 md:p-6 md:pb-6 lg:h-full lg:flex-row lg:gap-0 lg:overflow-hidden lg:p-0">
            <div
                className="relative min-w-0 lg:h-full lg:shrink-0"
                style={isDesktopLayout ? { width: sourcesPanelWidth } : undefined}
            >
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-4 lg:h-full lg:min-h-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pl-4 lg:py-4">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 pr-1 lg:pr-[5px]">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700/90 dark:text-sky-300/90">Sources</h2>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={SOURCE_ACTION_BUTTON_CLASS_NAME}
                            onClick={handleAddSource}
                            aria-label="Add source"
                            title="Add source"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="space-y-1 pr-1 lg:pr-[5px] lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                        <SourceFilterRow
                            label="All Articles"
                            title={`All Articles (${allArticleCount}${allUnreadCount > 0 ? `, ${formatUnreadArticleCount(allUnreadCount)} unread` : ""})`}
                            count={allArticleCount}
                            unreadCount={allUnreadCount}
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
                                    title={`${source.name} (${source.article_count}${source.unread_count > 0 ? `, ${formatUnreadArticleCount(source.unread_count)} unread` : ""})`}
                                    count={source.article_count}
                                    unreadCount={source.unread_count}
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
                            <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
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
                            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
                            isResizingSourcesPanel
                                ? "bg-muted-foreground/60"
                                : "bg-border",
                        )}
                    />
                </div>
            </div>

            <div className="min-w-0 lg:flex lg:h-full lg:flex-1 lg:overflow-hidden">
                <div className={cn(
                    "flex w-full min-w-0 flex-col rounded-xl border border-border bg-card/30 lg:mx-auto lg:h-full lg:rounded-none lg:border-b-0 lg:border-l-0 lg:border-r lg:border-t-0",
                    shouldRenderDetailOverlay ? "relative lg:max-w-none" : "lg:max-w-4xl",
                )}>
                    {shouldRenderStandaloneDetail && selectedArticleId !== null ? (
                        <ArticleDetailView
                            articleId={selectedArticleId}
                            showAssistant={false}
                            onBack={closeArticleDetail}
                            onMarkAsRead={markArticleAsRead}
                        />
                    ) : (
                        <>
                            <div className="border-b border-border bg-background/80 px-4 py-4 backdrop-blur-sm md:px-6 lg:py-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                                    <div className="hidden min-w-0 lg:block">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {selectedSource?.name ?? "All Articles"}
                                        </p>
                                        {selectedSource ? (
                                            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground/75">
                                                <span className="shrink-0">{resultSummaryLabel}</span>
                                                <span className="shrink-0" aria-hidden="true">•</span>
                                                <span className="shrink-0">{formatLastFetchSummary(selectedSource.last_fetch)}</span>
                                                <span className="shrink-0" aria-hidden="true">•</span>
                                                <span className="shrink-0">{formatFetchInterval(selectedSource.fetch_interval)}</span>
                                                <span className="shrink-0" aria-hidden="true">•</span>
                                                <a
                                                    href={selectedSource.url}
                                                    title={selectedSource.url}
                                                    className="min-w-0 truncate transition-colors hover:text-muted-foreground"
                                                    onClick={(event) => handleExternalLink(event, selectedSource.url)}
                                                >
                                                    {selectedSource.url}
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground/75">
                                                <span className="shrink-0">{activeSourceSummaryLabel}</span>
                                                <span className="shrink-0" aria-hidden="true">•</span>
                                                <span className="truncate">{resultSummaryLabel}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:flex-none">
                                        <form onSubmit={handleSearch} className="relative flex w-full items-center sm:flex-1 lg:w-auto lg:flex-none">
                                            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search articles..."
                                                className="pl-9 border-input focus-visible:border-ring focus-visible:ring-ring/30 lg:w-56 lg:transition-[width] lg:duration-200 lg:focus:w-72"
                                                value={searchInput}
                                                onChange={e => setSearchInput(e.target.value)}
                                            />
                                        </form>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => void handleMarkScopedRead()}
                                            disabled={isMarkingScopedRead || scopedUnreadCount === 0}
                                            aria-label={markScopedReadLabel}
                                            title={markScopedReadLabel}
                                            className="shrink-0"
                                        >
                                            {isMarkingScopedRead ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Marking...
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCheck className="h-4 w-4" />
                                                    Mark all as read
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div ref={articlesScrollRef} className="px-4 py-4 md:px-6 md:py-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                                <div className="space-y-2">
                                    {articles.map(article => {
                                        const preview = resolveArticlePreview(article.summary, article.content);

                                        return (
                                            <Link to={buildArticleHref(article.id)} key={article.id} className="block" onClick={handleArticleClick}>
                                                <Card className="border-0 bg-transparent shadow-none transition-colors duration-150 hover:bg-cyan-500/10">
                                                    <CardHeader className="space-y-1 px-3 py-2.5">
                                                        <div className="flex items-start gap-2">
                                                            {!article.is_read && <span className="inline-block h-2 w-2 shrink-0 self-center rounded-full bg-blue-500"></span>}
                                                            <CardTitle className="min-w-0 flex-1 text-lg leading-snug">{article.title}</CardTitle>
                                                        </div>
                                                        {preview.source === "summary" && article.summary && (
                                                            <CardDescription
                                                                className="min-w-0 line-clamp-1 text-sm"
                                                                dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.summary) }}
                                                                onClick={handleHtmlLinkClick}
                                                            />
                                                        )}
                                                        {preview.source === "content" && (
                                                            <CardDescription className="min-w-0 line-clamp-1 text-sm">
                                                                {preview.text}
                                                            </CardDescription>
                                                        )}
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                            <span className="text-cyan-700 dark:text-cyan-300">{article.source_name}</span>
                                                            <span>Published {formatUtcDateTime(article.published_at)}</span>
                                                            <span>Inserted {formatUtcDateTime(article.inserted_at)}</span>
                                                            {article.guid && (
                                                                <a
                                                                    href={article.guid}
                                                                    className="inline-flex shrink-0 items-center text-xs text-muted-foreground transition-colors hover:text-cyan-700 dark:hover:text-cyan-300"
                                                                    onClick={(e) => handleExternalLink(e, article.guid)}
                                                                >
                                                                    <ExternalLink className="mr-1 h-3 w-3" />
                                                                    Original
                                                                </a>
                                                            )}
                                                        </div>
                                                    </CardHeader>
                                                </Card>
                                            </Link>
                                        );
                                    })}

                                    {articles.length === 0 && (
                                        <div className="py-10 text-center text-muted-foreground">
                                            {emptyStateMessage}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-background/80 px-4 py-3 backdrop-blur-sm md:px-6">
                                <div className="flex items-center justify-between gap-2 sm:hidden">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => goToPage(Math.max(0, page - 1))}
                                        disabled={!canGoToPreviousPage}
                                        className="h-9 rounded-md border border-border bg-background px-3 text-foreground shadow-sm hover:bg-accent/60"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        <span className="sr-only">Previous page</span>
                                    </Button>
                                    <span className="min-w-0 flex-1 text-center text-sm font-medium text-muted-foreground">
                                        {compactPaginationLabel}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => goToPage(page + 1)}
                                        disabled={!canGoToNextPage}
                                        className="h-9 rounded-md border border-border bg-background px-3 text-foreground shadow-sm hover:bg-accent/60"
                                    >
                                        <span className="sr-only">Next page</span>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="hidden items-center justify-center gap-3 sm:flex">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => goToPage(Math.max(0, page - 1))}
                                        disabled={!canGoToPreviousPage}
                                        className="h-9 rounded-md border border-border bg-background px-3 text-foreground shadow-sm hover:bg-accent/60"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Previous
                                    </Button>

                                    {totalPages !== null && totalPages > 1 ? (
                                        <nav aria-label="Pagination" className="flex items-center gap-1">
                                            {paginationItems.map((item) => {
                                                if (item.type === "ellipsis") {
                                                    return (
                                                        <span
                                                            key={item.key}
                                                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground"
                                                            aria-hidden="true"
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </span>
                                                    );
                                                }

                                                const isCurrentPage = item.page === page;

                                                return (
                                                    <Button
                                                        key={item.page}
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        aria-current={isCurrentPage ? "page" : undefined}
                                                        onClick={isCurrentPage ? undefined : () => goToPage(item.page)}
                                                        className={cn(
                                                            "h-9 min-w-9 rounded-md border px-3 text-sm shadow-sm",
                                                            isCurrentPage
                                                                ? "pointer-events-none border-foreground bg-foreground text-background"
                                                                : "border-border bg-background text-foreground hover:bg-accent/60",
                                                        )}
                                                    >
                                                        {item.page + 1}
                                                    </Button>
                                                );
                                            })}
                                        </nav>
                                    ) : (
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {compactPaginationLabel}
                                        </span>
                                    )}

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => goToPage(page + 1)}
                                        disabled={!canGoToNextPage}
                                        className="h-9 rounded-md border border-border bg-background px-3 text-foreground shadow-sm hover:bg-accent/60"
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {shouldRenderDetailOverlay && selectedArticleId !== null && (
                                <div className="absolute inset-0 z-10 bg-background">
                                    <ArticleDetailView
                                        articleId={selectedArticleId}
                                        className="h-full"
                                        showAssistant={false}
                                        onBack={closeArticleDetail}
                                        onMarkAsRead={markArticleAsRead}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
