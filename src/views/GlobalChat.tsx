import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Bot, ChevronLeft, ChevronRight, MessageSquare, Plus, Send, Trash2, User } from "lucide-react";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStreamingConversation } from "@/hooks/use-streaming-conversation";
import type { Message } from "@/lib/ai";
import { buildGlobalChatSystemPrompt } from "@/lib/chat-prompts";
import { cn } from "@/lib/utils";
import { EmptyState, WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { CONTENT_GUTTER_X_CLASS } from "@/components/layout/layout-spacing";
import {
    buildGlobalChatTitle,
    createDefaultGlobalChatScopeInput,
    createGlobalChatCustomRangeFromPresetDays,
    deleteGlobalChatThread,
    formatGlobalChatContextLine,
    formatLocalDateInputValue,
    getGlobalChatThread,
    listGlobalChatContextArticles,
    listGlobalChatMessages,
    listGlobalChatSources,
    listGlobalChatThreads,
    normalizeGlobalChatScopeInput,
    persistGlobalChatMessage,
    saveGlobalChatThreadScope,
    type GlobalChatScopeInput,
    type GlobalChatSourceOption,
    type GlobalChatThread,
} from "@/lib/global-chat-service";
import { formatUtcDateTime } from "@/lib/time";

type ParsedThreadParam = {
    threadId: number | null;
    isWellFormed: boolean;
};

const PRESET_TIME_RANGE_OPTIONS = [
    { value: 1, key: "last24Hours" },
    { value: 3, key: "last3Days" },
    { value: 7, key: "last7Days" },
    { value: 30, key: "last30Days" },
] as const;
const DESKTOP_LAYOUT_MEDIA_QUERY = "(min-width: 1024px)";
const CHAT_THREADS_PANEL_WIDTH_STORAGE_KEY = "globalChatThreadsPanelWidth_v1";
const SCOPE_PANEL_COLLAPSED_STORAGE_KEY = "globalChatScopePanelCollapsed_v1";
const DEFAULT_CHAT_THREADS_PANEL_WIDTH = 288;
const MIN_CHAT_THREADS_PANEL_WIDTH = 220;
const MAX_CHAT_THREADS_PANEL_WIDTH = 420;
const EXPANDED_SCOPE_PANEL_WIDTH = 320;
const COLLAPSED_SCOPE_PANEL_WIDTH = 56;

function clampChatThreadsPanelWidth(width: number): number {
    return Math.min(MAX_CHAT_THREADS_PANEL_WIDTH, Math.max(MIN_CHAT_THREADS_PANEL_WIDTH, width));
}

function readStoredChatThreadsPanelWidth(): number {
    try {
        const raw = localStorage.getItem(CHAT_THREADS_PANEL_WIDTH_STORAGE_KEY);
        if (!raw) {
            return DEFAULT_CHAT_THREADS_PANEL_WIDTH;
        }

        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) {
            return DEFAULT_CHAT_THREADS_PANEL_WIDTH;
        }

        return clampChatThreadsPanelWidth(parsed);
    } catch {
        return DEFAULT_CHAT_THREADS_PANEL_WIDTH;
    }
}

function readStoredScopePanelCollapsed(): boolean {
    try {
        const raw = localStorage.getItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY);
        if (raw === null) {
            return true;
        }

        return raw === "true";
    } catch {
        return true;
    }
}

function parseThreadParam(rawThreadId: string | undefined): ParsedThreadParam {
    if (rawThreadId === undefined) {
        return { threadId: null, isWellFormed: true };
    }

    if (!/^\d+$/.test(rawThreadId)) {
        return { threadId: null, isWellFormed: false };
    }

    const parsed = Number.parseInt(rawThreadId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return { threadId: null, isWellFormed: false };
    }

    return { threadId: parsed, isWellFormed: true };
}

function toChatMessageArray(messages: Array<{ role: "user" | "assistant"; content: string }>): Message[] {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
}

function buildScopeSelectValue(scope: GlobalChatScopeInput): string {
    return scope.time_range_mode === "custom"
        ? "custom"
        : `preset:${scope.preset_days ?? 7}`;
}

function buildScopeSummary(scope: GlobalChatScopeInput, sources: GlobalChatSourceOption[], t: (key: string, options?: Record<string, unknown>) => string): string {
    const normalizedScope = normalizeGlobalChatScopeInput(scope);
    const presetOption = PRESET_TIME_RANGE_OPTIONS.find((option) => option.value === normalizedScope.preset_days);
    const timeLabel = normalizedScope.time_range_mode === "custom"
        ? `${normalizedScope.custom_start_date} to ${normalizedScope.custom_end_date}`
        : presetOption ? t(presetOption.key) : t("last7Days");

    const selectedSourceNames = sources
        .filter((source) => normalizedScope.source_ids.includes(source.id))
        .map((source) => source.name);
    const sourceLabel = normalizedScope.source_ids.length === 0
        ? t("allActiveSources")
        : selectedSourceNames.length > 0
            ? selectedSourceNames.join(", ")
            : t("allActiveSources");

    return `Time range: ${timeLabel}. Data sources: ${sourceLabel}.`;
}

function pruneInactiveSourceIds(scope: GlobalChatScopeInput, sources: GlobalChatSourceOption[]): GlobalChatScopeInput {
    if (scope.source_ids.length === 0) {
        return scope;
    }

    const activeSourceIds = new Set(sources.map((source) => source.id));
    const nextSourceIds = scope.source_ids.filter((sourceId) => activeSourceIds.has(sourceId));
    if (nextSourceIds.length === scope.source_ids.length) {
        return scope;
    }

    return {
        ...scope,
        source_ids: nextSourceIds,
    };
}

export default function GlobalChat() {
    const { t } = useTranslation("chat");
    const navigate = useNavigate();
    const { toast } = useToast();
    const { threadId: threadIdParam } = useParams();
    const parsedThread = useMemo(() => parseThreadParam(threadIdParam), [threadIdParam]);
    const bottomRef = useRef<HTMLDivElement>(null);
    const pendingCreatedThreadIdRef = useRef<number | null>(null);
    const threadLoadRequestIdRef = useRef(0);
    const scopeSaveRequestIdRef = useRef(0);
    const activeThreadIdRef = useRef<number | null>(null);
    const resizeStartXRef = useRef(0);
    const resizeStartWidthRef = useRef(DEFAULT_CHAT_THREADS_PANEL_WIDTH);

    const [threads, setThreads] = useState<GlobalChatThread[]>([]);
    const [sources, setSources] = useState<GlobalChatSourceOption[]>([]);
    const [sourcesLoaded, setSourcesLoaded] = useState(false);
    const [isLoadingThreads, setIsLoadingThreads] = useState(true);
    const [isLoadingThread, setIsLoadingThread] = useState(false);
    const [isDeletingThreadId, setIsDeletingThreadId] = useState<number | null>(null);
    const [pendingDeleteThread, setPendingDeleteThread] = useState<GlobalChatThread | null>(null);
    const [chatThreadsPanelWidth, setChatThreadsPanelWidth] = useState<number>(() => readStoredChatThreadsPanelWidth());
    const [isResizingThreadsPanel, setIsResizingThreadsPanel] = useState(false);
    const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
        if (typeof window === "undefined") {
            return false;
        }

        return window.matchMedia(DESKTOP_LAYOUT_MEDIA_QUERY).matches;
    });
    const [isScopePanelCollapsed, setIsScopePanelCollapsed] = useState<boolean>(() => readStoredScopePanelCollapsed());
    const [activeThread, setActiveThread] = useState<GlobalChatThread | null>(null);
    const [scope, setScope] = useState<GlobalChatScopeInput>(() => createDefaultGlobalChatScopeInput());
    const [input, setInput] = useState("");
    const {
        messages,
        isStreaming,
        streamPhase,
        send,
        replaceMessages,
    } = useStreamingConversation();

    const normalizedScope = useMemo(() => normalizeGlobalChatScopeInput(scope), [scope]);
    const currentThreadId = activeThread?.id ?? null;
    const useAllSources = normalizedScope.source_ids.length === 0;
    const allActiveSourceIds = useMemo(() => sources.map((source) => source.id), [sources]);
    const selectedSourceIds = useMemo(
        () => new Set(useAllSources ? allActiveSourceIds : normalizedScope.source_ids),
        [allActiveSourceIds, normalizedScope.source_ids, useAllSources],
    );
    const selectedSourceCount = useAllSources ? sources.length : normalizedScope.source_ids.length;
    const shouldRenderCollapsedScopePanel = isDesktopLayout && isScopePanelCollapsed;
    const presetOptionForLabel = PRESET_TIME_RANGE_OPTIONS.find((option) => option.value === normalizedScope.preset_days);
    const scopeTimeLabel = normalizedScope.time_range_mode === "custom"
        ? `${normalizedScope.custom_start_date ?? formatLocalDateInputValue(new Date())} - ${normalizedScope.custom_end_date ?? formatLocalDateInputValue(new Date())}`
        : presetOptionForLabel ? t(presetOptionForLabel.key) : t("last7Days");
    const scopeSourceSummary = useAllSources
        ? t("allNActiveSources", { count: sources.length })
        : t("nSelectedSources", { count: selectedSourceCount });

    activeThreadIdRef.current = currentThreadId;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
    }, [messages, streamPhase]);

    useEffect(() => {
        if (!parsedThread.isWellFormed) {
            navigate("/chat", { replace: true });
        }
    }, [navigate, parsedThread.isWellFormed]);

    useEffect(() => {
        try {
            localStorage.setItem(CHAT_THREADS_PANEL_WIDTH_STORAGE_KEY, String(chatThreadsPanelWidth));
        } catch {
            // Ignore persistence failures.
        }
    }, [chatThreadsPanelWidth]);

    useEffect(() => {
        try {
            localStorage.setItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY, String(isScopePanelCollapsed));
        } catch {
            // Ignore persistence failures.
        }
    }, [isScopePanelCollapsed]);

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
        if (!isResizingThreadsPanel) {
            return;
        }

        const handlePointerMove = (event: PointerEvent) => {
            const delta = event.clientX - resizeStartXRef.current;
            setChatThreadsPanelWidth(clampChatThreadsPanelWidth(resizeStartWidthRef.current + delta));
        };

        const stopResizing = () => {
            setIsResizingThreadsPanel(false);
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
    }, [isResizingThreadsPanel]);

    useEffect(() => {
        void refreshThreads();
    }, []);

    useEffect(() => {
        void refreshSources();
    }, [
        normalizedScope.time_range_mode,
        normalizedScope.preset_days,
        normalizedScope.custom_start_date,
        normalizedScope.custom_end_date,
    ]);

    useEffect(() => {
        if (!sourcesLoaded) {
            return;
        }

        setScope((currentScope) => pruneInactiveSourceIds(currentScope, sources));
    }, [sources, sourcesLoaded]);

    useEffect(() => {
        if (parsedThread.threadId === null) {
            setActiveThread(null);
            setScope(createDefaultGlobalChatScopeInput());
            setInput("");
            replaceMessages([]);
            return;
        }

        if (pendingCreatedThreadIdRef.current === parsedThread.threadId) {
            pendingCreatedThreadIdRef.current = null;
            return;
        }

        void loadPersistedThread(parsedThread.threadId);
    }, [parsedThread.threadId, replaceMessages]);

    async function refreshThreads() {
        setIsLoadingThreads(true);
        try {
            setThreads(await listGlobalChatThreads());
        } catch (error) {
            toast({ title: t("failedToLoadChats"), description: String(error), variant: "destructive" });
        } finally {
            setIsLoadingThreads(false);
        }
    }

    async function refreshSources() {
        try {
            setSources(await listGlobalChatSources(normalizedScope));
        } catch (error) {
            toast({ title: t("failedToLoadSources"), description: String(error), variant: "destructive" });
        } finally {
            setSourcesLoaded(true);
        }
    }

    async function loadPersistedThread(threadId: number) {
        const requestId = ++threadLoadRequestIdRef.current;
        setIsLoadingThread(true);

        try {
            const [thread, persistedMessages] = await Promise.all([
                getGlobalChatThread(threadId),
                listGlobalChatMessages(threadId),
            ]);

            if (threadLoadRequestIdRef.current !== requestId) {
                return;
            }

            if (!thread) {
                toast({ title: t("chatNotFound"), description: t("chatNotFoundDesc"), variant: "destructive" });
                navigate("/chat", { replace: true });
                return;
            }

            setActiveThread(thread);
            setScope(normalizeGlobalChatScopeInput(thread));
            setInput("");
            replaceMessages(toChatMessageArray(persistedMessages));
        } catch (error) {
            if (threadLoadRequestIdRef.current === requestId) {
                toast({ title: t("failedToLoadChat"), description: String(error), variant: "destructive" });
            }
        } finally {
            if (threadLoadRequestIdRef.current === requestId) {
                setIsLoadingThread(false);
            }
        }
    }

    async function refreshActiveThread(threadId: number) {
        const refreshedThread = await getGlobalChatThread(threadId);
        if (!refreshedThread) {
            return;
        }

        if (activeThreadIdRef.current === threadId) {
            setActiveThread(refreshedThread);
        }
    }

    function updateScope(nextScopeInput: GlobalChatScopeInput) {
        const nextScope = normalizeGlobalChatScopeInput(nextScopeInput);
        setScope(nextScope);

        if (!currentThreadId) {
            return;
        }

        const requestId = ++scopeSaveRequestIdRef.current;
        void (async () => {
            try {
                const savedThread = await saveGlobalChatThreadScope(nextScope, currentThreadId);
                if (scopeSaveRequestIdRef.current !== requestId || activeThreadIdRef.current !== savedThread.id) {
                    return;
                }

                setActiveThread(savedThread);
                await refreshThreads();
            } catch (error) {
                toast({ title: t("failedToUpdateChatScope"), description: String(error), variant: "destructive" });
            }
        })();
    }

    function resetDraftConversation() {
        threadLoadRequestIdRef.current += 1;
        pendingCreatedThreadIdRef.current = null;
        setIsLoadingThread(false);
        setActiveThread(null);
        setScope(createDefaultGlobalChatScopeInput());
        setInput("");
        replaceMessages([]);
    }

    function handleThreadsResizeStart(event: React.PointerEvent<HTMLDivElement>) {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        resizeStartXRef.current = event.clientX;
        resizeStartWidthRef.current = chatThreadsPanelWidth;
        setIsResizingThreadsPanel(true);
    }

    function handleScopeSelectionChange(value: string) {
        if (value === "custom") {
            const nextCustomRange = normalizedScope.time_range_mode === "custom"
                ? {
                    custom_start_date: normalizedScope.custom_start_date,
                    custom_end_date: normalizedScope.custom_end_date,
                }
                : createGlobalChatCustomRangeFromPresetDays(normalizedScope.preset_days ?? 7);

            updateScope({
                ...normalizedScope,
                time_range_mode: "custom",
                preset_days: null,
                ...nextCustomRange,
            });
            return;
        }

        const presetDays = Number.parseInt(value.replace("preset:", ""), 10);
        updateScope({
            ...normalizedScope,
            time_range_mode: "preset",
            preset_days: presetDays,
            custom_start_date: null,
            custom_end_date: null,
        });
    }

    function handleCustomStartDateChange(nextStartDate: string) {
        if (!nextStartDate) {
            return;
        }

        const currentEndDate = normalizedScope.custom_end_date ?? nextStartDate;
        updateScope({
            ...normalizedScope,
            time_range_mode: "custom",
            preset_days: null,
            custom_start_date: nextStartDate,
            custom_end_date: currentEndDate < nextStartDate ? nextStartDate : currentEndDate,
        });
    }

    function handleCustomEndDateChange(nextEndDate: string) {
        if (!nextEndDate) {
            return;
        }

        const currentStartDate = normalizedScope.custom_start_date ?? nextEndDate;
        updateScope({
            ...normalizedScope,
            time_range_mode: "custom",
            preset_days: null,
            custom_start_date: currentStartDate > nextEndDate ? nextEndDate : currentStartDate,
            custom_end_date: nextEndDate,
        });
    }

    function handleUseAllSourcesChange(checked: boolean) {
        updateScope({
            ...normalizedScope,
            source_ids: checked ? [] : allActiveSourceIds,
        });
    }

    function handleSourceToggle(sourceId: number, checked: boolean) {
        const baseSelection = useAllSources ? allActiveSourceIds : normalizedScope.source_ids;
        const nextSelection = checked
            ? Array.from(new Set([...baseSelection, sourceId]))
            : baseSelection.filter((currentSourceId) => currentSourceId !== sourceId);

        if (nextSelection.length === 0) {
            return;
        }

        updateScope({
            ...normalizedScope,
            source_ids: nextSelection,
        });
    }

    function handleDeleteDialogOpenChange(open: boolean) {
        if (isDeletingThreadId !== null) {
            return;
        }

        if (!open) {
            setPendingDeleteThread(null);
        }
    }

    async function handleDeleteThread(threadId: number) {
        const isDeletingActiveThread = activeThreadIdRef.current === threadId;
        setIsDeletingThreadId(threadId);
        try {
            await deleteGlobalChatThread(threadId);
            setThreads((currentThreads) => currentThreads.filter((thread) => thread.id !== threadId));
            setPendingDeleteThread(null);

            if (isDeletingActiveThread) {
                resetDraftConversation();
                navigate("/chat", { replace: true });
            }

            await refreshThreads();
        } catch (error) {
            toast({ title: t("failedToDeleteChat"), description: String(error), variant: "destructive" });
        } finally {
            setIsDeletingThreadId(null);
        }
    }

    async function handleSend(event: FormEvent) {
        event.preventDefault();
        if (!input.trim() || isStreaming || isLoadingThread) {
            return;
        }

        const inputValue = input.trim();
        const scopeSnapshot = normalizeGlobalChatScopeInput(scope);
        let targetThread = activeThread;
        setInput("");

        await send({
            content: inputValue,
            onUserMessageCommitted: async ({ userMessage }) => {
                if (!targetThread) {
                    const createdThread = await saveGlobalChatThreadScope({
                        ...scopeSnapshot,
                        title: buildGlobalChatTitle(userMessage.content),
                    });
                    targetThread = createdThread;
                    setActiveThread(createdThread);
                    pendingCreatedThreadIdRef.current = createdThread.id;
                    navigate(`/chat/${createdThread.id}`, { replace: true });
                    void refreshThreads();
                }

                if (!targetThread) {
                    throw new Error("Unable to create a chat thread.");
                }

                await persistGlobalChatMessage({
                    threadId: targetThread.id,
                    role: "user",
                    content: userMessage.content,
                });
                void refreshActiveThread(targetThread.id);
                void refreshThreads();
            },
            buildConversation: async (history, userMessage) => {
                const articles = await listGlobalChatContextArticles(scopeSnapshot);
                const normalizedScope = normalizeGlobalChatScopeInput(scopeSnapshot);
                const scopedSources = normalizedScope.source_ids.length === 0
                    ? sources
                    : sources.filter((source) => normalizedScope.source_ids.includes(source.id));
                const sourceCoverageLines = scopedSources.length === 0
                    ? ["- No active sources are currently selected."]
                    : scopedSources.map((source) => (
                        `- ${source.name}: ${source.matching_article_count} matching article(s) in the current time range, ${source.article_count} total stored`
                    ));
                const contextLines = articles.length === 0
                    ? ["- No articles matched the current thread filters."]
                    : articles.map((article) => formatGlobalChatContextLine(article));
                const systemPrompt = buildGlobalChatSystemPrompt({
                    scopeSummary: buildScopeSummary(scopeSnapshot, sources, t),
                    sourceCoverageLines,
                    contextLines,
                });

                return [
                    { role: "system", content: systemPrompt } as Message,
                    ...history,
                    userMessage,
                ];
            },
            onAssistantComplete: async ({ assistantMessage }) => {
                if (!targetThread) {
                    return;
                }

                try {
                    await persistGlobalChatMessage({
                        threadId: targetThread.id,
                        role: "assistant",
                        content: assistantMessage.content,
                    });
                    await refreshActiveThread(targetThread.id);
                    await refreshThreads();
                } catch (error) {
                    toast({ title: t("failedToSaveAssistantReply"), description: String(error), variant: "destructive" });
                }
            },
            onAssistantError: async ({ assistantMessage }) => {
                if (!targetThread) {
                    return;
                }

                try {
                    await persistGlobalChatMessage({
                        threadId: targetThread.id,
                        role: "assistant",
                        content: assistantMessage.content,
                    });
                    await refreshActiveThread(targetThread.id);
                    await refreshThreads();
                } catch (error) {
                    toast({ title: t("failedToSaveAssistantError"), description: String(error), variant: "destructive" });
                }
            },
        });
    }

    return (
        <div className={cn("flex min-h-full w-full min-w-0 flex-col gap-4 py-4 md:py-6", CONTENT_GUTTER_X_CLASS)}>
            <WorkspaceHeader
                density="compact"
                eyebrow={t("eyebrow")}
                title={activeThread?.title ?? t("title")}
                showTitle={threadIdParam !== undefined}
                titlelessLayout="compact"
                description={t("description")}
                showDescription={false}
                stats={[
                    { label: t("timeRangeLabel"), value: scopeTimeLabel, tone: "accent" },
                    { label: t("sourceScopeLabel"), value: scopeSourceSummary },
                ]}
                actions={(
                    <Button onClick={() => navigate("/chat")}>
                        <Plus className="h-4 w-4" />
                        {t("newChat")}
                    </Button>
                )}
            />

            <Dialog open={pendingDeleteThread !== null} onOpenChange={handleDeleteDialogOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("deleteChatDialog")}</DialogTitle>
                        <DialogDescription>
                            {pendingDeleteThread
                                ? t("deleteChatDesc", { title: pendingDeleteThread.title })
                                : t("deleteChatDescGeneric")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isDeletingThreadId !== null}
                            onClick={() => handleDeleteDialogOpenChange(false)}
                        >
                            {t("cancel", { ns: "common" })}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={pendingDeleteThread === null || isDeletingThreadId !== null}
                            onClick={() => {
                                if (!pendingDeleteThread) {
                                    return;
                                }

                                void handleDeleteThread(pendingDeleteThread.id);
                            }}
                        >
                            {t("delete", { ns: "common" })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                <div
                    className="relative shrink-0"
                    style={isDesktopLayout ? { width: chatThreadsPanelWidth } : undefined}
                >
                    <aside className="surface-panel flex h-full min-h-0 flex-col">
                        <div className="border-b border-border/60 px-4 py-4 lg:px-5">
                            <div className="space-y-3">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("conversations")}</p>
                                    <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-foreground">{t("savedThreads")}</h2>
                                </div>
                                <Button className="w-full justify-start" onClick={() => navigate("/chat")}>
                                    <Plus className="h-4 w-4" />
                                    {t("startNewThread")}
                                </Button>
                            </div>
                        </div>
                        <ScrollArea className="max-h-72 min-h-0 flex-1 lg:max-h-none">
                            <div className="space-y-2.5 p-3 lg:pr-[17px]">
                                {isLoadingThreads && threads.length === 0 && (
                                    <EmptyState
                                        title={t("loadingConversations")}
                                        description={t("loadingConversationsDesc")}
                                        className="px-4 py-10"
                                    />
                                )}
                                {!isLoadingThreads && threads.length === 0 && (
                                    <EmptyState
                                        icon={<MessageSquare className="h-8 w-8" />}
                                        title={t("noSavedConversations")}
                                        description={t("noSavedConversationsDesc")}
                                        className="px-4 py-10"
                                    />
                                )}
                                {threads.map((thread) => {
                                    const isActive = thread.id === currentThreadId;

                                    return (
                                        <div
                                            key={thread.id}
                                            className={cn(
                                                "flex items-start gap-2 rounded-[1.2rem] border p-2 transition-all duration-200",
                                                isActive
                                                    ? "border-primary/20 bg-accent/78 shadow-soft"
                                                    : "border-transparent bg-background/42 hover:border-primary/12 hover:bg-background/78",
                                            )}
                                        >
                                            <button
                                                type="button"
                                                className="min-w-0 flex-1 text-left"
                                                onClick={() => navigate(`/chat/${thread.id}`)}
                                            >
                                                <div className="truncate text-sm font-medium text-foreground">{thread.title}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">{formatUtcDateTime(thread.updated_at, t("unknown", { ns: "common" }))}</div>
                                            </button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                                disabled={isDeletingThreadId === thread.id}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setPendingDeleteThread(thread);
                                                }}
                                                aria-label={t("deleteChat")}
                                                title={t("deleteChat")}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </aside>
                    {isDesktopLayout && (
                        <div
                            role="separator"
                            aria-label={t("resizeChatThreadsPanel")}
                            aria-orientation="vertical"
                            aria-valuemin={MIN_CHAT_THREADS_PANEL_WIDTH}
                            aria-valuemax={MAX_CHAT_THREADS_PANEL_WIDTH}
                            aria-valuenow={chatThreadsPanelWidth}
                            data-no-window-drag
                            onPointerDown={handleThreadsResizeStart}
                            className="absolute inset-y-0 -right-2 z-10 hidden w-4 touch-none cursor-col-resize lg:block"
                        >
                            <div
                                className={cn(
                                    "absolute inset-y-4 left-1/2 w-px -translate-x-1/2 rounded-full transition-colors",
                                    isResizingThreadsPanel ? "bg-muted-foreground/60" : "bg-border",
                                )}
                            />
                        </div>
                    )}
                </div>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:flex-row">
                    <section className="surface-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        <div className="border-b border-border/60 px-6 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("liveThread")}</p>
                                    <h1 className="mt-1 truncate font-display text-2xl font-semibold tracking-[-0.04em] text-foreground">
                                        {activeThread?.title ?? t("newChat")}
                                    </h1>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {t("scopeChangesNote")}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <ScrollArea className="min-h-0 flex-1">
                            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-5 md:px-6 md:py-6">
                                {messages.length === 0 && !isLoadingThread && (
                                    <EmptyState
                                        icon={<MessageSquare className="h-10 w-10" />}
                                        title={t("startScopedConversation")}
                                        description={t("startScopedDesc")}
                                        className="mx-auto mt-20 max-w-lg"
                                    />
                                )}

                                {isLoadingThread && (
                                    <div className="mx-auto mt-20 text-sm text-muted-foreground">
                                        {t("loadingConversation")}
                                    </div>
                                )}

                                <div className="space-y-6 pb-20">
                                    {messages.map((message, index) => (
                                        <div key={`${message.role}-${index}`} className={`flex gap-4 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                                            <div className={cn(
                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-soft",
                                                message.role === "user"
                                                    ? "bg-primary text-primary-foreground"
                                                    : "border border-border/60 bg-background/82 text-primary",
                                            )}>
                                                {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                            </div>
                                            <div className={cn(
                                                "max-w-[88%] rounded-[1.5rem] px-4 py-3 text-sm shadow-soft",
                                                message.role === "user"
                                                    ? "bg-primary text-primary-foreground"
                                                    : "border border-border/60 bg-card/72",
                                            )}>
                                                {(() => {
                                                    const isLiveAssistantMessage = message.role === "assistant"
                                                        && isStreaming
                                                        && index === messages.length - 1;
                                                    const isPreparingMessage = isLiveAssistantMessage
                                                        && streamPhase === "preparing"
                                                        && message.content.trim().length === 0;

                                                    if (isPreparingMessage) {
                                                        return (
                                                            <div className="flex items-center gap-3 text-muted-foreground">
                                                                <span>{t("connectingToModel")}</span>
                                                                <div className="flex items-center space-x-1">
                                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/40" />
                                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:0.2s]" />
                                                                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/80 [animation-delay:0.4s]" />
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div className="space-y-2">
                                                            <ChatMarkdown content={message.content} tone={message.role === "user" ? "inverse" : "default"} />
                                                            {isLiveAssistantMessage && streamPhase === "streaming" && (
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                    <span className="h-2 w-2 rounded-full bg-primary/80 animate-pulse" />
                                                                    <span>{t("streaming")}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={bottomRef} />
                                </div>
                            </div>
                        </ScrollArea>

                        <div className="border-t border-border/60 bg-background/70 px-4 py-4 backdrop-blur md:px-6">
                            <form onSubmit={handleSend} className="mx-auto flex max-w-4xl">
                                <div className="surface-panel-quiet flex w-full items-center gap-2 rounded-[1.45rem] px-2 py-2">
                                    <Input
                                        value={input}
                                        onChange={(event) => setInput(event.target.value)}
                                        placeholder={t("askAboutRecentNews")}
                                        className="h-11 flex-1 border-0 bg-transparent shadow-none backdrop-blur-none focus-visible:border-transparent focus-visible:ring-0"
                                        autoFocus
                                    />
                                    <Button type="submit" size="icon" disabled={isStreaming || isLoadingThread || !input.trim()}>
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </section>

                    <aside
                        className={cn(
                            "surface-panel flex shrink-0 flex-col overflow-hidden lg:transition-[width]",
                            shouldRenderCollapsedScopePanel && "items-center",
                        )}
                        style={isDesktopLayout ? { width: shouldRenderCollapsedScopePanel ? COLLAPSED_SCOPE_PANEL_WIDTH : EXPANDED_SCOPE_PANEL_WIDTH } : undefined}
                    >
                        {shouldRenderCollapsedScopePanel ? (
                            <div className="flex h-full w-full items-start justify-center px-2 py-4">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10"
                                    onClick={() => setIsScopePanelCollapsed(false)}
                                    aria-label={t("expandThreadScope")}
                                    title={t("expandThreadScope")}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="border-b border-border/60 px-5 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("threadScope")}</p>
                                            <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em] text-foreground">{t("contextFilters")}</h2>
                                            <p className="mt-2 text-xs leading-6 text-muted-foreground">
                                                {t("tuneDescription")}
                                            </p>
                                        </div>
                                        {isDesktopLayout && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 shrink-0"
                                                onClick={() => setIsScopePanelCollapsed(true)}
                                                aria-label={t("collapseThreadScope")}
                                                title={t("collapseThreadScope")}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <ScrollArea className="min-h-0 flex-1">
                                    <div className="space-y-6 p-5">
                                        <div className="surface-panel-quiet px-4 py-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("currentScope")}</p>
                                            <p className="mt-2 text-sm leading-6 text-foreground">
                                                {buildScopeSummary(scope, sources, t)}
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="global-chat-time-range">{t("timeRange")}</Label>
                                            <Select value={buildScopeSelectValue(normalizedScope)} onValueChange={handleScopeSelectionChange}>
                                                <SelectTrigger id="global-chat-time-range">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {PRESET_TIME_RANGE_OPTIONS.map((option) => (
                                                        <SelectItem key={option.value} value={`preset:${option.value}`}>
                                                            {t(option.key)}
                                                        </SelectItem>
                                                    ))}
                                                    <SelectItem value="custom">{t("customRange")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {normalizedScope.time_range_mode === "custom" && (
                                            <div className="grid gap-3">
                                                <div className="space-y-2">
                                                    <Label htmlFor="global-chat-custom-start">{t("startDate")}</Label>
                                                    <Input
                                                        id="global-chat-custom-start"
                                                        type="date"
                                                        value={normalizedScope.custom_start_date ?? formatLocalDateInputValue(new Date())}
                                                        onChange={(event) => handleCustomStartDateChange(event.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="global-chat-custom-end">{t("endDate")}</Label>
                                                    <Input
                                                        id="global-chat-custom-end"
                                                        type="date"
                                                        value={normalizedScope.custom_end_date ?? formatLocalDateInputValue(new Date())}
                                                        onChange={(event) => handleCustomEndDateChange(event.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <Label>{t("dataSources")}</Label>
                                                <p className="text-xs text-muted-foreground">
                                                    {useAllSources
                                                        ? t("usingAllActiveSources", { count: sources.length })
                                                        : t("selectedActiveSources", { count: selectedSourceCount })}
                                                </p>
                                            </div>

                                            <label className="flex items-center gap-3 rounded-[1.15rem] border border-border/60 bg-background/70 px-3.5 py-3 text-sm shadow-soft">
                                                <Checkbox
                                                    checked={useAllSources}
                                                    onChange={(event) => handleUseAllSourcesChange(event.target.checked)}
                                                />
                                                <span>{t("useAllActiveSources")}</span>
                                            </label>

                                            <div className="space-y-2">
                                                {sourcesLoaded && sources.length === 0 && (
                                                    <EmptyState
                                                        title={t("noActiveSourcesAvailable")}
                                                        description={t("activateOrAddSource")}
                                                        className="px-4 py-10"
                                                    />
                                                )}

                                                {sources.map((source) => (
                                                    <label
                                                        key={source.id}
                                                        className={cn(
                                                            "flex items-center justify-between gap-3 rounded-[1.15rem] border px-3.5 py-3 text-sm shadow-soft transition-colors",
                                                            useAllSources
                                                                ? "border-border/50 bg-muted/35"
                                                                : "border-border/60 bg-background/72 hover:bg-background/86",
                                                        )}
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="truncate font-medium">{source.name}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {t("sourceMatchingInfo", { matching: source.matching_article_count, total: source.article_count })}
                                                            </div>
                                                        </div>
                                                        <Checkbox
                                                            checked={selectedSourceIds.has(source.id)}
                                                            disabled={useAllSources}
                                                            onChange={(event) => handleSourceToggle(source.id, event.target.checked)}
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                            </>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}
