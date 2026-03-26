import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Search, ExternalLink, RefreshCcw, ChevronLeft, ChevronRight, MoreHorizontal, Plus, CheckCheck, Loader2, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { dispatchNewsSyncEvent } from "@/lib/news-events";
import { fetchSource, fetchSources } from "@/lib/source-fetch";
import { addSourceFetchSyncListener, dispatchSourceFetchSyncEvent } from "@/lib/source-events";
import { getDb } from "@/lib/db";
import { formatFetchInterval, formatLastFetchSummary } from "@/lib/source-utils";
import { formatUtcDateTime } from "@/lib/time";
import { resolveArticlePreview, sanitizeArticleHtml } from "@/lib/article-html";
import { listNewsSources, markScopedNewsArticlesAsRead, type NewsSource } from "@/lib/news-service";
import { useMainLayoutScrollContainer } from "@/components/layout/MainLayout";
import { EmptyState, WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { CONTENT_GUTTER_X_CLASS } from "@/components/layout/layout-spacing";

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
const SOURCE_ACTION_BUTTON_CLASS_NAME = "h-10 w-10 shrink-0 rounded-lg border border-transparent text-muted-foreground shadow-none hover:bg-accent/50 hover:text-accent-foreground transition-colors";

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
                    "h-10 min-w-0 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-transparent bg-transparent px-3 text-left shadow-none transition-all duration-200 hover:bg-accent/50 hover:text-foreground",
                    isSelected && "bg-accent/70 text-accent-foreground font-medium",
                )}
                onClick={onSelect}
                title={title}
            >
                <span className="min-w-0 truncate text-sm font-medium">{label}</span>
                <span className="inline-flex min-w-[4.75rem] shrink-0 items-center justify-end gap-1.5">
                    <span className={cn(
                        "text-right text-xs tabular-nums",
                        isSelected ? "text-accent-foreground" : "text-muted-foreground",
                    )}>
                        {count}
                    </span>
                    {unreadCount > 0 && (
                        <span
                            className="inline-flex h-[1.2rem] min-w-[1.2rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold leading-none tabular-nums text-white shadow-[0_12px_22px_-16px_rgba(245,158,11,0.92)] ring-1 ring-background"
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
    const { t } = useTranslation("news");
    const { toast } = useToast();
    const mainScrollRef = useMainLayoutScrollContainer();
    const location = useLocation();
    const navigate = useNavigate();
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
    const [searchInput, setSearchInput] = useState(search);
    const resizeStartXRef = useRef(0);
    const resizeStartWidthRef = useRef(DEFAULT_SOURCES_PANEL_WIDTH);
    const articlesScrollRef = useRef<HTMLDivElement>(null);
    const pendingPaginationScrollResetRef = useRef(false);

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
        ? t("loadingPages")
        : hasPaginationPages
            ? t("pageXOfY", { current: Math.min(page + 1, totalPages), total: totalPages })
            : t("noMorePages");
    const resultSummaryLabel = totalArticleCount === null
        ? t("loadingResults")
        : t("nResults", { count: totalArticleCount });
    const activeSourceSummaryLabel = t("nActiveSources", { count: sources.length });
    const markScopedReadLabel = selectedSource
        ? t("markScopedReadSource", { name: selectedSource.name })
        : t("markScopedReadAll");
    const newsListScrollKey = useMemo(
        () => buildNewsListScrollKey(page, search, selectedSourceId),
        [page, search, selectedSourceId],
    );

    useEffect(() => {
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
    }, [newsListScrollKey]);

    useEffect(() => {
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
    }, [articles.length, newsListScrollKey]);

    useEffect(() => {
        if (!pendingPaginationScrollResetRef.current) return;

        const mainContainer = mainScrollRef.current;
        if (mainContainer) {
            mainContainer.scrollTop = 0;
            mainContainer.dispatchEvent(new Event("scroll"));
        }

        const articlesContainer = articlesScrollRef.current;
        if (articlesContainer) {
            articlesContainer.scrollTop = 0;
            articlesContainer.dispatchEvent(new Event("scroll"));
        }

        pendingPaginationScrollResetRef.current = false;
    }, [mainScrollRef, newsListScrollKey]);

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
        const nextPage = Math.max(0, p);

        if (nextPage === page) {
            return;
        }

        persistNewsListScroll(
            buildNewsListScrollKey(nextPage, search, selectedSourceId),
            0,
        );
        pendingPaginationScrollResetRef.current = true;
        setSearchParams(buildListParams(nextPage, search, selectedSourceId));
    }

    function selectSource(sourceId: number | null) {
        const nextParams = buildListParams(0, search, sourceId);
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
        if (articlesScrollRef.current) {
            persistNewsListScroll(newsListScrollKey, articlesScrollRef.current.scrollTop);
        }
    }

    function buildArticleHref(articleId: number) {
        return `/news/${articleId}`;
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
            toast({ title: t("failedToMarkArticlesAsRead"), description: String(error), variant: "destructive" });
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
            toast({ title: t("noActiveSourceToFetch") });
            return;
        }

        setIsFetchingAll(true);
        toast({ title: t("fetchingNSources", { count: sources.length }) });

        let insertedCount = 0;
        try {
            const result = await fetchSources(sources);
            insertedCount = result.insertedCount;
            toast({
                title: t("fetchAllComplete"),
                description: t("fetchAllCompleteDesc", { inserted: result.insertedCount, succeeded: result.successCount, failedPart: result.failCount > 0 ? `, ${result.failCount} failed` : "" }),
            });
        } catch (err: any) {
            toast({ title: t("fetchFailed"), description: String(err), variant: "destructive" });
        } finally {
            await refreshCurrentView();
            if (insertedCount > 0) {
                dispatchSourceFetchSyncEvent();
                dispatchNewsSyncEvent();
            }
            setIsFetchingAll(false);
        }
    }

    async function handleFetchSource(event: React.MouseEvent<HTMLButtonElement>, source: SourceFilterItem) {
        event.preventDefault();
        event.stopPropagation();

        if (isAnyFetchInProgress) return;

        setFetchingSourceId(source.id);
        toast({ title: t("fetchingSource", { name: source.name }) });

        let insertedCount = 0;
        try {
            const result = await fetchSource(source);
            insertedCount = result.insertedCount;
            toast({
                title: t("fetchComplete"),
                description: t("fetchCompleteDesc", { fetched: result.fetchedCount, inserted: result.insertedCount }),
            });
        } catch (err: any) {
            toast({ title: t("fetchFailed"), description: String(err), variant: "destructive" });
        } finally {
            await refreshCurrentView();
            if (insertedCount > 0) {
                dispatchSourceFetchSyncEvent();
                dispatchNewsSyncEvent();
            }
            setFetchingSourceId(null);
        }
    }

    let emptyStateMessage = t("noArticlesFound");
    if (!hasActiveSources) {
        emptyStateMessage = t("noActiveSourcesMsg");
    } else if (selectedSourceId !== null) {
        emptyStateMessage = t("noArticlesForSource");
    }

    return (
        <div className={cn("flex min-h-full w-full min-w-0 flex-col gap-4 py-4 md:py-6", CONTENT_GUTTER_X_CLASS)}>
            <WorkspaceHeader
                density="compact"
                eyebrow={t("eyebrow")}
                title={t("title")}
                showTitle={false}
                titlelessLayout="compact"
                description={t("description")}
                showDescription={false}
                stats={[
                    { label: t("scope"), value: selectedSource?.name ?? t("allActiveSources"), tone: selectedSource ? "accent" : "default" },
                    { label: t("unread"), value: t("unreadCount", { count: scopedUnreadCount }), tone: scopedUnreadCount > 0 ? "warning" : "default" },
                ]}
                actions={(
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <form onSubmit={handleSearch} className="relative flex min-w-0 flex-1 items-center sm:w-[20rem]">
                            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={t("searchArticles")}
                                className="pl-10 sm:w-full"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </form>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleMarkScopedRead()}
                            disabled={isMarkingScopedRead || scopedUnreadCount === 0}
                            aria-label={markScopedReadLabel}
                            title={markScopedReadLabel}
                        >
                            {isMarkingScopedRead ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("marking")}
                                </>
                            ) : (
                                <>
                                    <CheckCheck className="h-4 w-4" />
                                    {t("markAllAsRead")}
                                </>
                            )}
                        </Button>
                    </div>
                )}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                <div
                    className="relative min-w-0 lg:sticky lg:top-6 lg:self-start lg:shrink-0"
                    style={isDesktopLayout ? { width: sourcesPanelWidth } : undefined}
                >
                    <div className="surface-panel flex min-h-0 flex-col px-4 py-4 lg:max-h-[calc(100vh-8rem)]">
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sources")}</p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={SOURCE_ACTION_BUTTON_CLASS_NAME}
                                onClick={handleAddSource}
                                aria-label={t("addSource")}
                                title={t("addSource")}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="mt-4 space-y-1.5 pr-1 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                            <SourceFilterRow
                                label={t("allArticles")}
                                title={`${t("allArticles")} (${allArticleCount}${allUnreadCount > 0 ? `, ${t("unreadCount", { count: allUnreadCount })}` : ""})`}
                                count={allArticleCount}
                                unreadCount={allUnreadCount}
                                isSelected={isAllSelected}
                                isFetching={isFetchingAll}
                                isDisabled={isAnyFetchInProgress || !hasActiveSources}
                                fetchAriaLabel={t("fetchAllActiveSources")}
                                onSelect={() => selectSource(null)}
                                onFetch={handleFetchAll}
                            />

                            {sources.map((source) => {
                                const isSelected = selectedSourceId === source.id;
                                return (
                                    <SourceFilterRow
                                        key={source.id}
                                        label={source.name}
                                        title={`${source.name} (${source.article_count}${source.unread_count > 0 ? `, ${t("unreadCount", { count: source.unread_count })}` : ""})`}
                                        count={source.article_count}
                                        unreadCount={source.unread_count}
                                        isSelected={isSelected}
                                        isFetching={fetchingSourceId === source.id}
                                        isDisabled={isAnyFetchInProgress}
                                        fetchAriaLabel={t("fetchSource", { name: source.name })}
                                        onSelect={() => selectSource(source.id)}
                                        onFetch={(event) => void handleFetchSource(event, source)}
                                    />
                                );
                            })}

                            {sourcesLoaded && sources.length === 0 && (
                                <EmptyState
                                    icon={<Newspaper className="h-8 w-8" />}
                                    title={t("noActiveSources")}
                                    description={t("addSourceToStart")}
                                    className="px-4 py-10"
                                />
                            )}
                        </div>
                    </div>
                    <div
                        role="separator"
                        aria-label={t("resizeSourcesPanel")}
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
                                "absolute inset-y-4 left-1/2 w-px -translate-x-1/2 rounded-full transition-colors",
                                isResizingSourcesPanel ? "bg-muted-foreground/60" : "bg-border",
                            )}
                        />
                    </div>
                </div>

                <div className="min-w-0 flex-1 lg:min-h-0">
                    <div className="surface-panel flex h-full min-h-0 w-full min-w-0 flex-col">
                        <div className="border-b border-border/60 px-5 py-3.5 md:px-6">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0">
                                    <h2 className="truncate font-display text-xl font-semibold tracking-[-0.04em] text-foreground">
                                        {selectedSource?.name ?? t("allArticles")}
                                    </h2>
                                    {selectedSource ? (
                                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span>{resultSummaryLabel}</span>
                                            <span>{formatLastFetchSummary(selectedSource.last_fetch)}</span>
                                            <span>{formatFetchInterval(selectedSource.fetch_interval)}</span>
                                            <a
                                                href={selectedSource.url}
                                                title={selectedSource.url}
                                                className="min-w-0 truncate text-primary transition-colors hover:text-accent-foreground"
                                                onClick={(event) => handleExternalLink(event, selectedSource.url)}
                                            >
                                                {selectedSource.url}
                                            </a>
                                        </div>
                                    ) : (
                                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span>{activeSourceSummaryLabel}</span>
                                            <span>{resultSummaryLabel}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="shrink-0 rounded-full border border-border/60 bg-background/72 px-4 py-2 text-xs font-medium text-muted-foreground shadow-soft">
                                    {compactPaginationLabel}
                                </div>
                            </div>
                        </div>

                        <div ref={articlesScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-4 md:py-5">
                            <div className="space-y-3">
                                {articles.map((article) => {
                                    const preview = resolveArticlePreview(article.summary, article.content);

                                    return (
                                        <Link
                                            to={buildArticleHref(article.id)}
                                            state={{ returnTo: `${location.pathname}${location.search}` }}
                                            key={article.id}
                                            className="group block"
                                            onClick={handleArticleClick}
                                        >
                                            <Card
                                                className={cn(
                                                    "editor-list-card border border-border/55",
                                                    article.is_read
                                                        ? "bg-card/40 hover:border-primary/30"
                                                        : "border-amber-200/70 bg-amber-50/52 shadow-sm",
                                                )}
                                            >
                                                <CardHeader className="space-y-3 px-4 py-4">
                                                    <div className="flex items-start gap-3">
                                                        {!article.is_read && <span className="mt-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500"></span>}
                                                        <div className="min-w-0 flex-1">
                                                            <CardTitle className="text-[1.08rem] leading-7 text-foreground">{article.title}</CardTitle>
                                                        </div>
                                                    </div>
                                                    {preview.source === "summary" && article.summary && (
                                                        <CardDescription
                                                            className="min-w-0 line-clamp-2 text-sm leading-6 text-muted-foreground"
                                                            dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.summary) }}
                                                            onClick={handleHtmlLinkClick}
                                                        />
                                                    )}
                                                    {preview.source === "content" && (
                                                        <CardDescription className="min-w-0 line-clamp-2 text-sm leading-6 text-muted-foreground">
                                                            {preview.text}
                                                        </CardDescription>
                                                    )}
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                        <span className="rounded-full bg-accent/80 px-2.5 py-1 text-accent-foreground">{article.source_name}</span>
                                                        <span>{t("published", { date: formatUtcDateTime(article.published_at) })}</span>
                                                        <span>{t("saved", { date: formatUtcDateTime(article.inserted_at) })}</span>
                                                        {article.guid && (
                                                            <a
                                                                href={article.guid}
                                                                className="inline-flex shrink-0 items-center text-primary transition-colors hover:text-accent-foreground"
                                                                onClick={(e) => handleExternalLink(e, article.guid)}
                                                            >
                                                                <ExternalLink className="mr-1 h-3 w-3" />
                                                                {t("original")}
                                                            </a>
                                                        )}
                                                    </div>
                                                </CardHeader>
                                            </Card>
                                        </Link>
                                    );
                                })}

                                {articles.length === 0 && (
                                    <EmptyState
                                        icon={<Newspaper className="h-10 w-10" />}
                                        title={emptyStateMessage}
                                        description={hasActiveSources
                                            ? t("emptyHasSourcesDesc")
                                            : t("emptyNoSourcesDesc")}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="border-t border-border/60 px-4 py-3 md:px-6">
                            <div className="flex items-center justify-between gap-2 sm:hidden">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(Math.max(0, page - 1))}
                                    disabled={!canGoToPreviousPage}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    <span className="sr-only">{t("previousPage", { ns: "common" })}</span>
                                </Button>
                                <span className="min-w-0 flex-1 text-center text-sm font-medium text-muted-foreground">
                                    {compactPaginationLabel}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(page + 1)}
                                    disabled={!canGoToNextPage}
                                >
                                    <span className="sr-only">{t("nextPage", { ns: "common" })}</span>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="hidden items-center justify-center gap-3 sm:flex">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(Math.max(0, page - 1))}
                                    disabled={!canGoToPreviousPage}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    {t("previous", { ns: "common" })}
                                </Button>

                                {totalPages !== null && totalPages > 1 ? (
                                    <nav aria-label={t("pagination", { ns: "common" })} className="flex items-center gap-1.5">
                                        {paginationItems.map((item) => {
                                            if (item.type === "ellipsis") {
                                                return (
                                                    <span
                                                        key={item.key}
                                                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground"
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
                                                    variant={isCurrentPage ? "default" : "outline"}
                                                    size="sm"
                                                    aria-current={isCurrentPage ? "page" : undefined}
                                                    onClick={isCurrentPage ? undefined : () => goToPage(item.page)}
                                                    className={cn(
                                                        "min-w-9 px-3",
                                                        isCurrentPage && "pointer-events-none",
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
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(page + 1)}
                                    disabled={!canGoToNextPage}
                                >
                                    {t("next", { ns: "common" })}
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
