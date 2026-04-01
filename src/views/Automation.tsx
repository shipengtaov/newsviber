import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { addAutomationSyncListener } from "@/lib/automation-events";
import { AutomationReportDiscussionPanel, AutomationReportDiscussionRail } from "@/components/automation/AutomationReportDiscussionPanel";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import {
    type AutomationArticleCandidate,
    type AutomationReport,
    type AutomationReportContextArticle,
    type AutomationProject,
    type AutomationSourceOption,
    deleteAutomationProject,
    formatAutomationReportSupportingContextLine,
    generateAutomationReportForProject,
    listAutomationReports,
    listAutomationProjects,
    listAutomationReportSourceArticles,
    listAutomationSources,
    listProjectCandidateArticles,
    markAllAutomationReportsAsRead,
    markAutomationReportAsRead,
    saveAutomationProject,
    setAutomationReportFavorite,
} from "@/lib/automation-service";
import { optimizeAutomationProjectPrompt, type Message } from "@/lib/ai";
import { buildAutomationReportDiscussionSystemPrompt } from "@/lib/chat-prompts";
import { useMainLayoutScrollContainer } from "@/components/layout/MainLayout";
import { PageShell } from "@/components/layout/PageShell";
import { CONTENT_GUTTER_X_CLASS } from "@/components/layout/layout-spacing";
import { BackToTopButton } from "@/components/ui/BackToTopButton";
import { useScopedScrollMemory } from "@/hooks/use-scoped-scroll-memory";
import { useStreamingConversation } from "@/hooks/use-streaming-conversation";
import { getAutomationReportBodyMarkdown, getAutomationReportPreviewExcerpt } from "@/lib/automation-report";
import { formatUtcDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { hasConfiguredWebSearch } from "@/lib/web-search-service";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Ellipsis, LayoutGrid, Lightbulb, List, Loader2, MessageSquare, MoreHorizontal, Pencil, Plus, Star, Trash2, WandSparkles } from "lucide-react";

type ProjectFormState = {
    name: string;
    prompt: string;
    webSearchEnabled: boolean;
    autoEnabled: boolean;
    autoIntervalMinutes: string;
    maxArticlesPerReport: string;
    minArticlesPerReport: string;
    useAllSources: boolean;
    sourceIds: number[];
};

const DEFAULT_AUTO_INTERVAL_MINUTES = "60";
const DEFAULT_MAX_ARTICLES_PER_REPORT = "200";
const DEFAULT_MIN_ARTICLES_PER_REPORT = "10";
const GENERATED_TILE_PREVIEW_MAX_LENGTH = 360;
const DESKTOP_REPORT_DISCUSSION_MEDIA_QUERY = "(min-width: 1024px)";
const AUTOMATION_TILE_GRID_CLASS = "grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
const AUTOMATION_TILE_CARD_BASE_CLASS = "editor-list-card flex cursor-pointer flex-col overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const PROJECT_TILE_CARD_CLASS = `${AUTOMATION_TILE_CARD_BASE_CLASS} h-[240px]`;
const GENERATED_TILE_CARD_CLASS = `${AUTOMATION_TILE_CARD_BASE_CLASS} min-h-[220px]`;
const AUTOMATION_TILE_HEADER_CLASS = "px-3 py-2.5 pb-1.5";
const AUTOMATION_TILE_BODY_CLASS = "flex flex-1 flex-col px-3 pb-3 pt-0";
type CardViewMode = "card" | "list";
type ReportFilterMode = "all" | "favorites";
type AutomationPaginationItem =
    | { type: "page"; page: number }
    | { type: "ellipsis"; key: string };
const CARD_VIEW_MODE_STORAGE_KEY = "automationReportViewMode_v1";
const DEFAULT_PAGE_SIZE = 20;
const AUTOMATION_SPACE_SCROLL_STORAGE_KEY = "automationScrollPositions_v1";
const AUTOMATION_BOARD_SCROLL_SCOPE_KEY = "automation:board";

function buildAutomationProjectScrollScopeKey(projectId: number): string {
    return `automation:project:${projectId}`;
}

function buildAutomationPaginationItems(currentPage: number, totalPages: number): AutomationPaginationItem[] {
    if (totalPages <= 1) return [];

    const candidatePages = new Set(
        [0, totalPages - 1, currentPage - 1, currentPage, currentPage + 1]
            .filter((page) => page >= 0 && page < totalPages),
    );

    const sortedPages = Array.from(candidatePages).sort((left, right) => left - right);
    const items: AutomationPaginationItem[] = [];

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

function createEmptyProjectFormState(): ProjectFormState {
    return {
        name: "",
        prompt: "",
        webSearchEnabled: false,
        autoEnabled: false,
        autoIntervalMinutes: DEFAULT_AUTO_INTERVAL_MINUTES,
        maxArticlesPerReport: DEFAULT_MAX_ARTICLES_PER_REPORT,
        minArticlesPerReport: DEFAULT_MIN_ARTICLES_PER_REPORT,
        useAllSources: true,
        sourceIds: [],
    };
}

function createProjectFormState(project?: AutomationProject): ProjectFormState {
    if (!project) {
        return createEmptyProjectFormState();
    }

    return {
        name: project.name,
        prompt: project.prompt,
        webSearchEnabled: project.web_search_enabled,
        autoEnabled: project.auto_enabled,
        autoIntervalMinutes: String(project.auto_interval_minutes),
        maxArticlesPerReport: String(project.max_articles_per_report),
        minArticlesPerReport: String(project.min_articles_per_report),
        useAllSources: project.source_ids.length === 0,
        sourceIds: project.source_ids,
    };
}

function formatTimestamp(value: string | null): string {
    return formatUtcDateTime(value, i18n.t("common:never"));
}

function formatArticleCount(count: number): string {
    return i18n.t("automation:nArticles", { count });
}

function formatProjectScope(project: AutomationProject, sources: AutomationSourceOption[]): string {
    if (project.source_ids.length === 0) {
        return i18n.t("automation:allSources");
    }

    const sourceNames = sources
        .filter((source) => project.source_ids.includes(source.id))
        .map((source) => source.name);

    if (sourceNames.length === 0) {
        return i18n.t("automation:nSelectedSources", { count: project.source_ids.length });
    }

    return sourceNames.join(", ");
}

function formatAutoSummary(project: AutomationProject): string {
    if (!project.auto_enabled) {
        return i18n.t("automation:manualOnly");
    }

    return i18n.t("automation:everyNMinutes", { count: project.auto_interval_minutes });
}

function formatCompactAutoSummary(project: AutomationProject): string {
    if (!project.auto_enabled) {
        return i18n.t("automation:manual");
    }

    return `${project.auto_interval_minutes}m`;
}

function formatProjectScopeSummary(project: AutomationProject, sources: AutomationSourceOption[]): string {
    if (project.source_ids.length === 0) {
        return i18n.t("automation:allSources");
    }

    const sourceNames = sources
        .filter((source) => project.source_ids.includes(source.id))
        .map((source) => source.name);

    if (sourceNames.length === 1) {
        return sourceNames[0];
    }

    return i18n.t("automation:nSelectedSources", { count: project.source_ids.length });
}

function formatProjectRecentActivitySummary(project: AutomationProject): string {
    if (project.last_auto_generated_at) {
        return i18n.t("automation:generated", { date: formatTimestamp(project.last_auto_generated_at) });
    }

    if (project.last_auto_checked_at) {
        return i18n.t("automation:checked", { date: formatTimestamp(project.last_auto_checked_at) });
    }

    return i18n.t("automation:noRecentActivity");
}

function formatUnreadReportCount(count: number): string {
    return count > 99 ? "99+" : String(Math.max(0, count));
}

type ProjectOverviewItemProps = {
    label: string;
    value: React.ReactNode;
};

function ProjectOverviewItem({ label, value }: ProjectOverviewItemProps) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
            <div className="mt-1 break-words text-sm font-medium leading-snug text-foreground">{value}</div>
        </div>
    );
}

type ProjectDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingProjectId: number | null;
    projectForm: ProjectFormState;
    setProjectForm: React.Dispatch<React.SetStateAction<ProjectFormState>>;
    isSavingProject: boolean;
    sources: AutomationSourceOption[];
    onSubmit: (event: React.FormEvent) => void;
    onCancel: () => void;
    onToggleProjectSourceSelection: (sourceId: number) => void;
    onOptimizePrompt: () => void;
    isOptimizingPrompt: boolean;
    promptSuggestionOpen: boolean;
    onPromptSuggestionOpenChange: (open: boolean) => void;
    promptSuggestionOriginal: string;
    promptSuggestionDraft: string;
    setPromptSuggestionDraft: React.Dispatch<React.SetStateAction<string>>;
    onApplyPromptSuggestion: () => void;
    trigger?: React.ReactNode;
};

function ProjectDialog({
    open,
    onOpenChange,
    editingProjectId,
    projectForm,
    setProjectForm,
    isSavingProject,
    sources,
    onSubmit,
    onCancel,
    onToggleProjectSourceSelection,
    onOptimizePrompt,
    isOptimizingPrompt,
    promptSuggestionOpen,
    onPromptSuggestionOpenChange,
    promptSuggestionOriginal,
    promptSuggestionDraft,
    setPromptSuggestionDraft,
    onApplyPromptSuggestion,
    trigger,
}: ProjectDialogProps) {
    const { t } = useTranslation("automation");

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingProjectId ? t("editAutomationProject") : t("createAutomationProject")}</DialogTitle>
                        <DialogDescription>
                            {t("projectDialogDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t("projectName")}</Label>
                            <Input
                                value={projectForm.name}
                                onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder={t("projectNamePlaceholder")}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <Label>{t("focusPrompt")}</Label>
                                <span className="text-xs text-muted-foreground">{t("useAiToRefine")}</span>
                            </div>
                            <div className="relative">
                                <Textarea
                                    value={projectForm.prompt}
                                    onChange={(event) => setProjectForm((current) => ({ ...current, prompt: event.target.value }))}
                                    placeholder={t("promptPlaceholder")}
                                    className="min-h-32 resize-none pb-12 pr-12"
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute bottom-2 right-2 h-8 w-8 rounded-full border bg-background/90 shadow-sm"
                                    onClick={onOptimizePrompt}
                                    disabled={!projectForm.prompt.trim() || isOptimizingPrompt}
                                    aria-label={t("optimizeWithAi")}
                                    title={t("optimizeWithAi")}
                                >
                                    {isOptimizingPrompt ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <WandSparkles className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-xl border p-4">
                            <label className="flex items-center gap-3 text-sm font-medium">
                                <Checkbox
                                    checked={projectForm.webSearchEnabled}
                                    onChange={(event) => setProjectForm((current) => ({ ...current, webSearchEnabled: event.target.checked }))}
                                />
                                {t("enableWebSearch")}
                            </label>
                            <p className="text-sm text-muted-foreground">
                                {t("webSearchDesc")}
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-3 rounded-xl border p-4">
                                <label className="flex items-center gap-3 text-sm font-medium">
                                    <Checkbox
                                        checked={projectForm.autoEnabled}
                                        onChange={(event) => setProjectForm((current) => ({ ...current, autoEnabled: event.target.checked }))}
                                    />
                                    {t("enableAutoReportGeneration")}
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    {t("autoReportGenDesc")}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>{t("autoInterval")}</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={projectForm.autoIntervalMinutes}
                                    onChange={(event) => setProjectForm((current) => ({ ...current, autoIntervalMinutes: event.target.value }))}
                                    disabled={!projectForm.autoEnabled}
                                />
                                <p className="text-xs text-muted-foreground">{t("autoIntervalExample")}</p>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>{t("minArticlesPerReport")}</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={projectForm.minArticlesPerReport}
                                    onChange={(event) => setProjectForm((current) => ({ ...current, minArticlesPerReport: event.target.value }))}
                                />
                                <p className="text-xs text-muted-foreground">{t("minArticlesDesc")}</p>
                            </div>

                            <div className="space-y-2">
                                <Label>{t("maxArticlesPerReport")}</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={projectForm.maxArticlesPerReport}
                                    onChange={(event) => setProjectForm((current) => ({ ...current, maxArticlesPerReport: event.target.value }))}
                                />
                                <p className="text-xs text-muted-foreground">{t("maxArticlesDesc")}</p>
                            </div>
                        </div>

                        <div className="space-y-4 rounded-xl border p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <Label>{t("sourceScope")}</Label>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {t("chooseSourcesDesc")}
                                    </p>
                                </div>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={projectForm.useAllSources}
                                        onChange={(event) => setProjectForm((current) => ({
                                            ...current,
                                            useAllSources: event.target.checked,
                                            sourceIds: event.target.checked ? [] : current.sourceIds,
                                        }))}
                                    />
                                    {t("useAllSources")}
                                </label>
                            </div>

                            {projectForm.useAllSources && (
                                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                    {t("allSourcesEligible")}
                                </div>
                            )}

                            {!projectForm.useAllSources && (
                                <div className="max-h-64 space-y-2 overflow-y-auto">
                                    {sources.length === 0 && (
                                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                            {t("noSourcesAvailable")}
                                        </div>
                                    )}

                                    {sources.map((source) => (
                                        <label key={source.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                                            <Checkbox
                                                checked={projectForm.sourceIds.includes(source.id)}
                                                onChange={() => onToggleProjectSourceSelection(source.id)}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium">{source.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {t("nArticles", { count: source.article_count })} · {source.active ? t("active", { ns: "common" }) : t("inactive", { ns: "common" })}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onCancel}>
                                {t("cancel", { ns: "common" })}
                            </Button>
                            <Button type="submit" disabled={isSavingProject}>
                                {isSavingProject ? t("saving") : editingProjectId ? t("saveChanges") : t("createProject")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={promptSuggestionOpen} onOpenChange={onPromptSuggestionOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t("reviewOptimizedPrompt")}</DialogTitle>
                        <DialogDescription>
                            {t("reviewOptimizedDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t("originalPrompt")}</Label>
                            <Textarea value={promptSuggestionOriginal} readOnly className="min-h-28 resize-none bg-muted/40" />
                        </div>

                        <div className="space-y-2">
                            <Label>{t("optimizedPrompt")}</Label>
                            <Textarea
                                value={promptSuggestionDraft}
                                onChange={(event) => setPromptSuggestionDraft(event.target.value)}
                                className="min-h-40 resize-y"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onPromptSuggestionOpenChange(false)}>
                            {t("keepOriginal")}
                        </Button>
                        <Button type="button" onClick={onApplyPromptSuggestion} disabled={!promptSuggestionDraft.trim()}>
                            {t("replacePrompt")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function Automation() {
    const { t } = useTranslation("automation");
    const { toast } = useToast();
    const mainScrollRef = useMainLayoutScrollContainer();

    const [projects, setProjects] = useState<AutomationProject[]>([]);
    const [reports, setReports] = useState<AutomationReport[]>([]);
    const [sources, setSources] = useState<AutomationSourceOption[]>([]);
    const [totalReportCount, setTotalReportCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [reportFilterMode, setReportFilterMode] = useState<ReportFilterMode>("all");
    const [cardViewMode, setCardViewMode] = useState<CardViewMode>(() => {
        if (typeof window === "undefined") return "card";
        const stored = localStorage.getItem(CARD_VIEW_MODE_STORAGE_KEY);
        return stored === "list" ? "list" : "card";
    });

    const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
    const [activeReportId, setActiveReportId] = useState<number | null>(null);
    const [activeReportSnapshot, setActiveReportSnapshot] = useState<AutomationReport | null>(null);
    const [activeReportSourceArticles, setActiveReportSourceArticles] = useState<AutomationReportContextArticle[]>([]);

    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
    const [projectForm, setProjectForm] = useState<ProjectFormState>(createEmptyProjectFormState);
    const [isSavingProject, setIsSavingProject] = useState(false);
    const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
    const [promptSuggestionDialogOpen, setPromptSuggestionDialogOpen] = useState(false);
    const [promptSuggestionOriginal, setPromptSuggestionOriginal] = useState("");
    const [promptSuggestionDraft, setPromptSuggestionDraft] = useState("");
    const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
    const [pendingDeleteProject, setPendingDeleteProject] = useState<AutomationProject | null>(null);

    const [manualDialogOpen, setManualDialogOpen] = useState(false);
    const [articleCandidates, setArticleCandidates] = useState<AutomationArticleCandidate[]>([]);
    const [candidateSearch, setCandidateSearch] = useState("");
    const [candidateSourceId, setCandidateSourceId] = useState("all");
    const [includeConsumed, setIncludeConsumed] = useState(false);
    const [selectedArticleIds, setSelectedArticleIds] = useState<number[]>([]);
    const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isMarkingAllReportsRead, setIsMarkingAllReportsRead] = useState(false);
    const [favoriteMutationReportIds, setFavoriteMutationReportIds] = useState<number[]>([]);
    const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false);
    const [isProjectActionsOpen, setIsProjectActionsOpen] = useState(false);
    const [isReportDiscussionOpen, setIsReportDiscussionOpen] = useState(false);
    const [isDesktopReportDiscussionLayout, setIsDesktopReportDiscussionLayout] = useState<boolean>(() => {
        if (typeof window === "undefined") {
            return false;
        }

        return window.matchMedia(DESKTOP_REPORT_DISCUSSION_MEDIA_QUERY).matches;
    });

    const [chatInput, setChatInput] = useState("");
    const {
        messages: chatMessages,
        isStreaming: isChatStreaming,
        streamPhase: chatStreamPhase,
        send: sendChatMessage,
        replaceMessages: replaceChatMessages,
    } = useStreamingConversation();
    const markingReportReadIdsRef = useRef(new Set<number>());
    const promptOptimizationRequestIdRef = useRef(0);
    const projectDialogOpenRef = useRef(projectDialogOpen);
    const projectActionsPanelRef = useRef<HTMLDivElement | null>(null);
    const reportBodyScrollRef = useRef<HTMLDivElement | null>(null);
    const reportDiscussionScrollRef = useRef<HTMLDivElement | null>(null);
    const reportDiscussionToggleButtonRef = useRef<HTMLButtonElement | null>(null);

    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
    const activeReportFromList = activeReportId === null
        ? null
        : reports.find((card) => card.id === activeReportId) ?? null;
    const activeReport = activeReportFromList ?? activeReportSnapshot;
    const activeProjectWebSearchStatus = !activeProject?.web_search_enabled
        ? "disabled"
        : hasConfiguredWebSearch()
            ? "ready"
            : "unavailable";
    const activeReportBodyMarkdown = activeReport ? getAutomationReportBodyMarkdown(activeReport) : "";
    const activeReportSupportingContextLines = useMemo(
        () => activeReportSourceArticles.map((article) => formatAutomationReportSupportingContextLine(article)),
        [activeReportSourceArticles],
    );
    const activeProjectUnreadCount = activeProject
        ? activeProject.unread_report_count
        : 0;
    const scopedSources = activeProject
        ? sources.filter((source) => activeProject.source_ids.length === 0 || activeProject.source_ids.includes(source.id))
        : [];
    const autoEnabledProjectCount = projects.filter((project) => project.auto_enabled).length;
    const totalUnreadReportCount = projects.reduce((total, project) => total + project.unread_report_count, 0);
    const totalPages = Math.max(1, Math.ceil(totalReportCount / DEFAULT_PAGE_SIZE));
    const paginationItems = totalPages > 1 ? buildAutomationPaginationItems(currentPage, totalPages) : [];
    const canGoToPreviousPage = currentPage > 0;
    const canGoToNextPage = currentPage < totalPages - 1;
    const compactPaginationLabel = totalReportCount > 0
        ? t("pageXOfY", { page: currentPage + 1, total: totalPages })
        : "";
    const backToTopLabel = t("backToTop", { ns: "common" });
    const automationScrollScopeKey = activeReportId !== null
        ? null
        : activeProject !== null
            ? buildAutomationProjectScrollScopeKey(activeProject.id)
            : AUTOMATION_BOARD_SCROLL_SCOPE_KEY;
    const projectDetailBackToTopTargetRefs = useMemo(
        () => [mainScrollRef],
        [mainScrollRef],
    );
    const reportDetailBackToTopTargetRefs = useMemo(
        () => [mainScrollRef, reportBodyScrollRef],
        [mainScrollRef],
    );
    const { saveCurrentScopeScroll: saveAutomationScrollPosition } = useScopedScrollMemory({
        containerRef: mainScrollRef,
        storageKey: AUTOMATION_SPACE_SCROLL_STORAGE_KEY,
        scopeKey: automationScrollScopeKey,
    });

    useEffect(() => {
        void loadProjects();
        void loadSources();
    }, []);

    useEffect(() => {
        projectDialogOpenRef.current = projectDialogOpen;
    }, [projectDialogOpen]);

    useEffect(() => {
        const mediaQueryList = window.matchMedia(DESKTOP_REPORT_DISCUSSION_MEDIA_QUERY);
        const handleChange = (event: MediaQueryListEvent) => {
            setIsDesktopReportDiscussionLayout(event.matches);
        };

        setIsDesktopReportDiscussionLayout(mediaQueryList.matches);
        mediaQueryList.addEventListener("change", handleChange);

        return () => {
            mediaQueryList.removeEventListener("change", handleChange);
        };
    }, []);

    useEffect(() => {
        if (activeProjectId === null) {
            setReports([]);
            setTotalReportCount(0);
            setCurrentPage(0);
            setReportFilterMode("all");
            setActiveReportId(null);
            setActiveReportSnapshot(null);
            return;
        }

        setCurrentPage(0);
        setReportFilterMode("all");
        void loadReports(activeProjectId, 0, "all");
    }, [activeProjectId]);

    useEffect(() => {
        if (activeReportId === null) {
            setActiveReportSnapshot(null);
            setActiveReportSourceArticles([]);
            return;
        }

        if (activeReportFromList) {
            setActiveReportSnapshot(activeReportFromList);
        }
    }, [activeReportFromList, activeReportId]);

    useEffect(() => {
        const reportId = activeReport?.id ?? null;

        if (reportId === null) {
            setActiveReportSourceArticles([]);
            return;
        }

        const resolvedReportId = reportId;
        let isDisposed = false;

        async function loadReportSourceArticles() {
            try {
                const articles = await listAutomationReportSourceArticles(resolvedReportId);
                if (!isDisposed) {
                    setActiveReportSourceArticles(articles);
                }
            } catch (error) {
                console.error(`Failed to load source articles for report ${resolvedReportId}`, error);
                if (!isDisposed) {
                    setActiveReportSourceArticles([]);
                }
            }
        }

        void loadReportSourceArticles();

        return () => {
            isDisposed = true;
        };
    }, [activeReport?.id]);

    useEffect(() => {
        if (!isReportDiscussionOpen) {
            return;
        }

        const container = reportDiscussionScrollRef.current;
        if (!container) {
            return;
        }

        container.scrollTop = container.scrollHeight;
    }, [chatMessages, chatStreamPhase, isReportDiscussionOpen]);

    useEffect(() => {
        if (!manualDialogOpen || !activeProject) {
            return;
        }

        const projectId = activeProject.id;
        let isSubscribed = true;

        async function loadCandidates() {
            setIsLoadingCandidates(true);
            try {
                const result = await listProjectCandidateArticles(projectId, {
                    includeConsumed,
                    search: candidateSearch,
                    sourceId: candidateSourceId === "all" ? null : Number.parseInt(candidateSourceId, 10),
                });
                if (isSubscribed) {
                    setArticleCandidates(result);
                }
            } catch (error) {
                if (isSubscribed) {
                    toast({ title: t("failedToLoadCandidates"), description: String(error), variant: "destructive" });
                }
            } finally {
                if (isSubscribed) {
                    setIsLoadingCandidates(false);
                }
            }
        }

        void loadCandidates();

        return () => {
            isSubscribed = false;
        };
    }, [activeProject, manualDialogOpen, includeConsumed, candidateSearch, candidateSourceId, toast]);

    useEffect(() => {
        return addAutomationSyncListener(() => {
            void loadProjects();
            void loadSources();

            if (activeProjectId !== null) {
                void loadReports(activeProjectId, currentPage, reportFilterMode);
            }

            if (manualDialogOpen && activeProjectId !== null) {
                void refreshCandidateArticles(activeProjectId);
            }
        });
    }, [activeProjectId, currentPage, manualDialogOpen, includeConsumed, candidateSearch, candidateSourceId, reportFilterMode]);

    useEffect(() => {
        replaceChatMessages([]);
        setChatInput("");
    }, [activeReportId, replaceChatMessages]);

    useEffect(() => {
        setIsProjectInfoOpen(false);
        setIsProjectActionsOpen(false);
    }, [activeProjectId]);

    useEffect(() => {
        setIsReportDiscussionOpen(false);
    }, [activeReportId]);

    useEffect(() => {
        if (!isProjectActionsOpen) {
            return;
        }

        function handlePointerDown(event: MouseEvent) {
            if (!projectActionsPanelRef.current?.contains(event.target as Node)) {
                setIsProjectActionsOpen(false);
            }
        }

        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsProjectActionsOpen(false);
            }
        }

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isProjectActionsOpen]);

    async function loadProjects() {
        try {
            const result = await listAutomationProjects();
            setProjects(result);

            if (activeProjectId !== null && !result.some((project) => project.id === activeProjectId)) {
                setActiveProjectId(null);
                setActiveReportId(null);
            }

            if (editingProjectId !== null && !result.some((project) => project.id === editingProjectId)) {
                setEditingProjectId(null);
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function loadReports(projectId: number, page?: number, filterMode: ReportFilterMode = reportFilterMode) {
        try {
            const targetPage = Math.max(0, page ?? currentPage);
            const offset = targetPage * DEFAULT_PAGE_SIZE;
            const result = await listAutomationReports(projectId, {
                offset,
                limit: DEFAULT_PAGE_SIZE,
                favoritesOnly: filterMode === "favorites",
            });
            const maxPage = Math.max(0, Math.ceil(Math.max(result.totalCount, 1) / DEFAULT_PAGE_SIZE) - 1);

            if (targetPage > maxPage) {
                setCurrentPage(maxPage);
                await loadReports(projectId, maxPage, filterMode);
                return;
            }

            setReports(result.reports);
            setTotalReportCount(result.totalCount);
        } catch (error) {
            console.error(error);
        }
    }

    async function loadSources() {
        try {
            const result = await listAutomationSources();
            setSources(result);
        } catch (error) {
            console.error(error);
        }
    }

    async function refreshCandidateArticles(projectId: number) {
        try {
            const result = await listProjectCandidateArticles(projectId, {
                includeConsumed,
                search: candidateSearch,
                sourceId: candidateSourceId === "all" ? null : Number.parseInt(candidateSourceId, 10),
            });
            setArticleCandidates(result);
        } catch (error) {
            console.error(error);
        }
    }

    function updateProjectUnreadCount(projectId: number, nextUnreadCount: number | ((currentCount: number) => number)) {
        setProjects((currentProjects) => currentProjects.map((project) => (
            project.id === projectId
                ? {
                    ...project,
                    unread_report_count: Math.max(
                        0,
                        typeof nextUnreadCount === "function"
                            ? nextUnreadCount(project.unread_report_count)
                            : nextUnreadCount,
                    ),
                }
                : project
        )));
    }

    function updateLoadedReport(reportId: number, updater: (card: AutomationReport) => AutomationReport) {
        setReports((currentReports) => currentReports.map((card) => (
            card.id === reportId ? updater(card) : card
        )));
        setActiveReportSnapshot((currentCard) => (
            currentCard?.id === reportId ? updater(currentCard) : currentCard
        ));
    }

    function setFavoriteMutationPending(reportId: number, isPending: boolean) {
        setFavoriteMutationReportIds((currentIds) => {
            if (isPending) {
                return currentIds.includes(reportId) ? currentIds : [...currentIds, reportId];
            }

            return currentIds.filter((currentId) => currentId !== reportId);
        });
    }

    function isFavoriteMutationPending(reportId: number): boolean {
        return favoriteMutationReportIds.includes(reportId);
    }

    function getFavoriteActionLabel(card: AutomationReport): string {
        return card.is_favorite ? t("removeFromFavorites") : t("addToFavorites");
    }

    function applyOptimisticFavoriteState(reportId: number, isFavorite: boolean) {
        setReports((currentReports) => {
            const nextCards = currentReports.map((card) => (
                card.id === reportId ? { ...card, is_favorite: isFavorite } : card
            ));

            return reportFilterMode === "favorites"
                ? nextCards.filter((card) => card.is_favorite)
                : nextCards;
        });
        setActiveReportSnapshot((currentCard) => (
            currentCard?.id === reportId
                ? { ...currentCard, is_favorite: isFavorite }
                : currentCard
        ));

        if (reportFilterMode === "favorites" && !isFavorite) {
            setTotalReportCount((currentCount) => Math.max(0, currentCount - 1));
        }
    }

    function openAutomationReport(reportId: number, reportSnapshot?: AutomationReport) {
        const targetReport = reportSnapshot ?? reports.find((card) => card.id === reportId);
        saveAutomationScrollPosition();
        setActiveReportId(reportId);
        setActiveReportSnapshot(targetReport ?? null);

        if (!targetReport || targetReport.is_read || markingReportReadIdsRef.current.has(reportId)) {
            return;
        }

        markingReportReadIdsRef.current.add(reportId);
        updateLoadedReport(reportId, (card) => ({ ...card, is_read: true }));
        updateProjectUnreadCount(targetReport.project_id, (currentCount) => currentCount - 1);

        void markAutomationReportAsRead(reportId)
            .catch(async (error) => {
                toast({ title: t("failedToMarkReportAsRead"), description: String(error), variant: "destructive" });
                await loadProjects();
                await loadReports(targetReport.project_id, currentPage, reportFilterMode);
            })
            .finally(() => {
                markingReportReadIdsRef.current.delete(reportId);
            });
    }

    function resetPromptSuggestionState() {
        promptOptimizationRequestIdRef.current += 1;
        setIsOptimizingPrompt(false);
        setPromptSuggestionDialogOpen(false);
        setPromptSuggestionOriginal("");
        setPromptSuggestionDraft("");
    }

    function closeProjectDialog() {
        resetPromptSuggestionState();
        setProjectDialogOpen(false);
        setEditingProjectId(null);
        setProjectForm(createEmptyProjectFormState());
    }

    function openCreateProjectDialog() {
        resetPromptSuggestionState();
        setEditingProjectId(null);
        setProjectForm(createEmptyProjectFormState());
        setProjectDialogOpen(true);
    }

    function openEditProjectDialog(project: AutomationProject) {
        resetPromptSuggestionState();
        setIsProjectActionsOpen(false);
        setEditingProjectId(project.id);
        setProjectForm(createProjectFormState(project));
        setProjectDialogOpen(true);
    }

    function openProjectDetail(projectId: number) {
        saveAutomationScrollPosition();
        setActiveProjectId(projectId);
    }

    function openDeleteProjectDialog(project: AutomationProject) {
        setIsProjectActionsOpen(false);
        setPendingDeleteProject(project);
    }

    function handleDeleteProjectDialogOpenChange(open: boolean) {
        if (deletingProjectId !== null) {
            return;
        }

        if (!open) {
            setPendingDeleteProject(null);
        }
    }

    function handleProjectCardKeyDown(event: React.KeyboardEvent<HTMLDivElement>, projectId: number) {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        event.preventDefault();
        openProjectDetail(projectId);
    }

    function handleGeneratedReportKeyDown(event: React.KeyboardEvent<HTMLDivElement>, reportId: number) {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        event.preventDefault();
        openAutomationReport(reportId);
    }

    function stopReportEventPropagation(event: React.SyntheticEvent<HTMLElement>) {
        event.stopPropagation();
    }

    async function handleSetReportFavorite(card: AutomationReport, isFavorite: boolean) {
        if (isFavoriteMutationPending(card.id)) {
            return;
        }

        setFavoriteMutationPending(card.id, true);
        applyOptimisticFavoriteState(card.id, isFavorite);

        try {
            await setAutomationReportFavorite(card.id, isFavorite);

            if (activeProjectId !== null && reportFilterMode === "favorites") {
                await loadReports(activeProjectId, currentPage, reportFilterMode);
            }
        } catch (error) {
            updateLoadedReport(card.id, (currentCard) => ({ ...currentCard, is_favorite: card.is_favorite }));

            if (activeProjectId !== null) {
                await loadReports(activeProjectId, currentPage, reportFilterMode);
            }

            toast({ title: t("failedToUpdateFavorite"), description: String(error), variant: "destructive" });
        } finally {
            setFavoriteMutationPending(card.id, false);
        }
    }

    async function handleMarkAllReportsRead() {
        if (!activeProject || isMarkingAllReportsRead || activeProjectUnreadCount === 0) {
            return;
        }

        setIsMarkingAllReportsRead(true);
        setReports((currentReports) => currentReports.map((card) => (
            card.project_id === activeProject.id ? { ...card, is_read: true } : card
        )));
        updateProjectUnreadCount(activeProject.id, 0);

        try {
            await markAllAutomationReportsAsRead(activeProject.id);
        } catch (error) {
            toast({ title: t("failedToMarkAllReportsAsRead"), description: String(error), variant: "destructive" });
            await loadProjects();
            await loadReports(activeProject.id, currentPage, reportFilterMode);
        } finally {
            setIsMarkingAllReportsRead(false);
        }
    }

    async function handleProjectSubmit(event: React.FormEvent) {
        event.preventDefault();
        setIsSavingProject(true);

        try {
            const savedProject = await saveAutomationProject(
                {
                    name: projectForm.name,
                    prompt: projectForm.prompt,
                    web_search_enabled: projectForm.webSearchEnabled,
                    auto_enabled: projectForm.autoEnabled,
                    auto_interval_minutes: Number.parseInt(projectForm.autoIntervalMinutes, 10),
                    max_articles_per_report: Number.parseInt(projectForm.maxArticlesPerReport, 10),
                    min_articles_per_report: Number.parseInt(projectForm.minArticlesPerReport, 10),
                    use_all_sources: projectForm.useAllSources,
                    source_ids: projectForm.sourceIds,
                },
                editingProjectId ?? undefined,
            );

            closeProjectDialog();

            if (!editingProjectId) {
                openProjectDetail(savedProject.id);
            }

            toast({ title: editingProjectId ? t("projectUpdated") : t("projectCreated") });
            await loadProjects();
            if (activeProjectId === savedProject.id) {
                await loadReports(savedProject.id, currentPage, reportFilterMode);
            }
        } catch (error) {
            toast({ title: t("failedToSaveProject"), description: String(error), variant: "destructive" });
        } finally {
            setIsSavingProject(false);
        }
    }

    async function handleDeleteProject(projectId: number) {
        setDeletingProjectId(projectId);
        setIsProjectActionsOpen(false);
        try {
            await deleteAutomationProject(projectId);
            toast({ title: t("projectDeleted") });
            setPendingDeleteProject(null);

            if (activeProjectId === projectId) {
                leaveProjectDetail();
            }

            await loadProjects();
        } catch (error) {
            toast({ title: t("failedToDeleteProject"), description: String(error), variant: "destructive" });
        } finally {
            setDeletingProjectId(null);
        }
    }

    function openManualGenerateDialog() {
        if (!activeProject) {
            return;
        }

        setSelectedArticleIds([]);
        setCandidateSearch("");
        setCandidateSourceId("all");
        setIncludeConsumed(false);
        setManualDialogOpen(true);
    }

    function leaveProjectDetail() {
        saveAutomationScrollPosition();
        setManualDialogOpen(false);
        closeProjectDialog();
        setSelectedArticleIds([]);
        setIsReportDiscussionOpen(false);
        setIsProjectInfoOpen(false);
        setIsProjectActionsOpen(false);
        setActiveReportId(null);
        setActiveReportSnapshot(null);
        setActiveProjectId(null);
    }

    function handleCardViewModeChange(mode: CardViewMode) {
        setCardViewMode(mode);
        localStorage.setItem(CARD_VIEW_MODE_STORAGE_KEY, mode);
    }

    function handleReportFilterModeChange(mode: ReportFilterMode) {
        if (mode === reportFilterMode || activeProjectId === null) {
            return;
        }

        setReportFilterMode(mode);
        setCurrentPage(0);
        void loadReports(activeProjectId, 0, mode);
        mainScrollRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
    }

    function goToReportPage(page: number) {
        const nextPage = Math.max(0, page);
        if (nextPage === currentPage || !activeProjectId) return;
        setCurrentPage(nextPage);
        void loadReports(activeProjectId, nextPage, reportFilterMode);
        mainScrollRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
    }

    function handleProjectDialogOpenChange(open: boolean) {
        if (open) {
            setProjectDialogOpen(true);
            return;
        }

        closeProjectDialog();
    }

    function handlePromptSuggestionOpenChange(open: boolean) {
        if (open) {
            setPromptSuggestionDialogOpen(true);
            return;
        }

        setPromptSuggestionDialogOpen(false);
        setPromptSuggestionDraft("");
        setPromptSuggestionOriginal("");
    }

    function renderDeleteProjectDialog() {
        return (
            <Dialog open={pendingDeleteProject !== null} onOpenChange={handleDeleteProjectDialogOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("deleteProjectDialog")}</DialogTitle>
                        <DialogDescription>
                            {pendingDeleteProject
                                ? t("deleteProjectDesc", { name: pendingDeleteProject.name })
                                : t("deleteProjectDescGeneric")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={deletingProjectId !== null}
                            onClick={() => handleDeleteProjectDialogOpenChange(false)}
                        >
                            {t("cancel", { ns: "common" })}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={pendingDeleteProject === null || deletingProjectId !== null}
                            onClick={() => {
                                if (!pendingDeleteProject) {
                                    return;
                                }

                                void handleDeleteProject(pendingDeleteProject.id);
                            }}
                        >
                            {t("delete", { ns: "common" })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    function toggleProjectSourceSelection(sourceId: number) {
        setProjectForm((current) => {
            const isSelected = current.sourceIds.includes(sourceId);

            return {
                ...current,
                sourceIds: isSelected
                    ? current.sourceIds.filter((currentId) => currentId !== sourceId)
                    : [...current.sourceIds, sourceId],
            };
        });
    }

    function toggleArticleSelection(articleId: number) {
        if (!activeProject) {
            return;
        }

        setSelectedArticleIds((currentSelectedIds) => {
            if (currentSelectedIds.includes(articleId)) {
                return currentSelectedIds.filter((currentId) => currentId !== articleId);
            }

            if (currentSelectedIds.length >= activeProject.max_articles_per_report) {
                toast({
                    title: t("selectUpToN", { count: activeProject.max_articles_per_report }),
                    variant: "destructive",
                });
                return currentSelectedIds;
            }

            return [...currentSelectedIds, articleId];
        });
    }

    async function handlePromptOptimization() {
        const rawPrompt = projectForm.prompt.trim();
        if (!rawPrompt || isOptimizingPrompt) {
            return;
        }

        const requestId = promptOptimizationRequestIdRef.current + 1;
        promptOptimizationRequestIdRef.current = requestId;
        setIsOptimizingPrompt(true);

        try {
            const optimizedPrompt = await optimizeAutomationProjectPrompt(rawPrompt);
            if (!projectDialogOpenRef.current || promptOptimizationRequestIdRef.current !== requestId) {
                return;
            }

            setPromptSuggestionOriginal(rawPrompt);
            setPromptSuggestionDraft(optimizedPrompt);
            setPromptSuggestionDialogOpen(true);
        } catch (error) {
            if (promptOptimizationRequestIdRef.current === requestId) {
                toast({ title: t("failedToOptimizePrompt"), description: String(error), variant: "destructive" });
            }
        } finally {
            if (promptOptimizationRequestIdRef.current === requestId) {
                setIsOptimizingPrompt(false);
            }
        }
    }

    function applyPromptSuggestion() {
        const optimizedPrompt = promptSuggestionDraft.trim();
        if (!optimizedPrompt) {
            return;
        }

        setProjectForm((current) => ({ ...current, prompt: optimizedPrompt }));
        setPromptSuggestionDialogOpen(false);
        setPromptSuggestionOriginal("");
        setPromptSuggestionDraft("");
    }

    async function handleManualGenerate() {
        if (!activeProject || selectedArticleIds.length === 0 || isGenerating) {
            return;
        }

        setIsGenerating(true);
        try {
            const generatedReport = await generateAutomationReportForProject({
                projectId: activeProject.id,
                articleIds: selectedArticleIds,
                mode: "manual",
            });

            setCurrentPage(0);
            await loadProjects();
            await loadReports(activeProject.id, 0, reportFilterMode);
            if (reportFilterMode === "all") {
                setReports((currentReports) => [generatedReport, ...currentReports.filter((card) => card.id !== generatedReport.id)]);
            }
            openAutomationReport(generatedReport.id, generatedReport);
            setManualDialogOpen(false);
            setSelectedArticleIds([]);
            toast({ title: t("reportGenerated") });
        } catch (error) {
            toast({ title: t("generationFailed"), description: String(error), variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    }

    async function handleChat(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!chatInput.trim() || isChatStreaming || !activeReport) {
            return;
        }

        const inputValue = chatInput.trim();
        setChatInput("");

        await sendChatMessage({
            content: inputValue,
            buildConversation: async (history, userMessage) => {
                const systemPrompt = buildAutomationReportDiscussionSystemPrompt({
                    title: activeReport.title,
                    bodyMarkdown: activeReportBodyMarkdown,
                    supportingContextLines: activeReportSupportingContextLines,
                    enableWebSearch: activeProject?.web_search_enabled,
                });

                return [
                    { role: "system", content: systemPrompt } as Message,
                    ...history,
                    userMessage,
                ];
            },
            streamOptions: {
                enableWebSearch: activeProject?.web_search_enabled,
            },
        });
    }

    function renderProjectDialog(trigger?: React.ReactNode) {
        return (
            <ProjectDialog
                open={projectDialogOpen}
                onOpenChange={handleProjectDialogOpenChange}
                editingProjectId={editingProjectId}
                projectForm={projectForm}
                setProjectForm={setProjectForm}
                isSavingProject={isSavingProject}
                sources={sources}
                onSubmit={handleProjectSubmit}
                onCancel={closeProjectDialog}
                onToggleProjectSourceSelection={toggleProjectSourceSelection}
                onOptimizePrompt={handlePromptOptimization}
                isOptimizingPrompt={isOptimizingPrompt}
                promptSuggestionOpen={promptSuggestionDialogOpen}
                onPromptSuggestionOpenChange={handlePromptSuggestionOpenChange}
                promptSuggestionOriginal={promptSuggestionOriginal}
                promptSuggestionDraft={promptSuggestionDraft}
                setPromptSuggestionDraft={setPromptSuggestionDraft}
                onApplyPromptSuggestion={applyPromptSuggestion}
                trigger={trigger}
            />
        );
    }

    function closeReportDiscussion() {
        setIsReportDiscussionOpen(false);
        reportDiscussionToggleButtonRef.current?.focus();
    }

    if (activeReport) {
        return (
            <>
                <div className={cn("flex h-full min-h-0 flex-col gap-2 bg-background py-2 md:py-3 lg:flex-row lg:gap-0", CONTENT_GUTTER_X_CLASS)}>
                    <div className="surface-panel min-h-0 min-w-0 flex-1 overflow-hidden">
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="shrink-0 border-b border-border bg-background">
                                <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-3 py-2 md:px-4">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0">
                                            <Button variant="ghost" size="sm" onClick={() => setActiveReportId(null)} className="-ml-2 w-fit">
                                                <ArrowLeft className="h-3.5 w-3.5" /> {t("back", { ns: "common" })}
                                            </Button>
                                            <div className="mt-1.5 space-y-2">
                                                <div className="text-balance text-base font-semibold leading-tight md:text-lg">{activeReport.title}</div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                    <span>{activeReport.generation_mode === "auto" ? t("auto") : t("manual")} {t("run")}</span>
                                                    <span>{formatArticleCount(activeReport.used_article_count)}</span>
                                                    <span className="tabular-nums">{formatTimestamp(activeReport.created_at)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-start">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className={cn(
                                                    "h-8 w-8 shrink-0 rounded-full",
                                                    activeReport.is_favorite && "text-amber-500 hover:text-amber-600",
                                                )}
                                                onClick={() => {
                                                    void handleSetReportFavorite(activeReport, !activeReport.is_favorite);
                                                }}
                                                aria-label={getFavoriteActionLabel(activeReport)}
                                                title={getFavoriteActionLabel(activeReport)}
                                                disabled={isFavoriteMutationPending(activeReport.id)}
                                            >
                                                <Star className={cn("h-3.5 w-3.5", activeReport.is_favorite && "fill-current")} />
                                            </Button>
                                            <Button
                                                ref={reportDiscussionToggleButtonRef}
                                                variant={isReportDiscussionOpen ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setIsReportDiscussionOpen((open) => !open)}
                                                className="shrink-0 self-start"
                                            >
                                                <MessageSquare className="h-3.5 w-3.5" />
                                                {isReportDiscussionOpen ? t("hideDiscussion") : t("discussReport")}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div ref={reportBodyScrollRef} className="min-h-0 flex-1 overflow-y-auto">
                                <div className="mx-auto w-full max-w-4xl px-3 py-3 md:px-4 md:py-4">
                                    <ChatMarkdown content={activeReportBodyMarkdown} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <AutomationReportDiscussionRail open={isDesktopReportDiscussionLayout && isReportDiscussionOpen}>
                        <AutomationReportDiscussionPanel
                            variant="inline"
                            chatMessages={chatMessages}
                            isChatStreaming={isChatStreaming}
                            chatStreamPhase={chatStreamPhase}
                            webSearchStatus={activeProjectWebSearchStatus}
                            chatInput={chatInput}
                            onChatInputChange={setChatInput}
                            onChatSubmit={handleChat}
                            onClose={closeReportDiscussion}
                            showCloseButton
                            scrollRef={reportDiscussionScrollRef}
                        />
                    </AutomationReportDiscussionRail>

                    {!isDesktopReportDiscussionLayout ? (
                        <Sheet modal={false} open={isReportDiscussionOpen} onOpenChange={setIsReportDiscussionOpen}>
                            <SheetContent
                                side="right"
                                className="w-full max-w-xl p-0 sm:max-w-xl"
                                showOverlay={false}
                            >
                                <AutomationReportDiscussionPanel
                                    variant="sheet"
                                    chatMessages={chatMessages}
                                    isChatStreaming={isChatStreaming}
                                    chatStreamPhase={chatStreamPhase}
                                    webSearchStatus={activeProjectWebSearchStatus}
                                    chatInput={chatInput}
                                    onChatInputChange={setChatInput}
                                    onChatSubmit={handleChat}
                                    scrollRef={reportDiscussionScrollRef}
                                />
                            </SheetContent>
                        </Sheet>
                    ) : null}
                </div>
                <BackToTopButton targetRefs={reportDetailBackToTopTargetRefs} label={backToTopLabel} />
            </>
        );
    }

    if (activeProject) {
        return (
            <>
                <PageShell
                    variant="workspace"
                    size="wide"
                    contentClassName="space-y-4"
                    header={{
                        density: "compact",
                        leading: (
                            <Button variant="ghost" size="sm" onClick={leaveProjectDetail}>
                                <ArrowLeft className="h-3.5 w-3.5" /> {t("back", { ns: "common" })}
                            </Button>
                        ),
                        eyebrow: t("eyebrow"),
                        title: activeProject.name,
                        description: t("projectDescription"),
                        showDescription: false,
                        stats: [
                            { label: t("scopeLabel"), value: formatProjectScopeSummary(activeProject, sources), tone: "accent" },
                            { label: t("unreadLabel"), value: formatUnreadReportCount(activeProjectUnreadCount), tone: activeProjectUnreadCount > 0 ? "warning" : "default" },
                        ],
                        actions: (
                            <div className="flex flex-wrap items-center gap-2">
                                <Button size="sm" onClick={openManualGenerateDialog} disabled={isGenerating}>
                                    <WandSparkles className="h-3.5 w-3.5" /> {isGenerating ? t("generating") : t("generateReport")}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleMarkAllReportsRead}
                                    disabled={isMarkingAllReportsRead || activeProjectUnreadCount === 0}
                                >
                                    {isMarkingAllReportsRead ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("marking", { ns: "news" })}
                                        </>
                                    ) : (
                                        t("markAllAsRead")
                                    )}
                                </Button>
                                <div className="relative" ref={projectActionsPanelRef}>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setIsProjectActionsOpen((current) => !current)}
                                        aria-label={t("openProjectActions")}
                                        aria-expanded={isProjectActionsOpen}
                                    >
                                        <Ellipsis className="h-3.5 w-3.5" />
                                    </Button>

                                    {isProjectActionsOpen && (
                                        <div className="surface-panel-quiet absolute right-0 top-[calc(100%+0.5rem)] z-20 w-48 p-1.5">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start"
                                                onClick={() => openEditProjectDialog(activeProject)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" /> {t("editProject")}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start text-destructive hover:text-destructive"
                                                onClick={() => openDeleteProjectDialog(activeProject)}
                                                disabled={deletingProjectId === activeProject.id}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" /> {t("deleteProject")}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ),
                    }}
                >
                <div className="surface-panel-quiet px-3 py-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("auto")}</span>
                                    <span className="font-medium text-foreground">{formatCompactAutoSummary(activeProject)}</span>
                                </span>
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("scopeLabel")}</span>
                                    <span className="truncate font-medium text-foreground">{formatProjectScopeSummary(activeProject, sources)}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("minLabel")}</span>
                                    <span className="font-medium text-foreground">{formatArticleCount(activeProject.min_articles_per_report)}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("maxLabel")}</span>
                                    <span className="font-medium text-foreground">{formatArticleCount(activeProject.max_articles_per_report)}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("reportsLabel")}</span>
                                    <span className="font-medium text-foreground">{totalReportCount}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("unreadLabel")}</span>
                                    <span className="font-medium text-foreground tabular-nums">{formatUnreadReportCount(activeProjectUnreadCount)}</span>
                                </span>
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("updatedLabel")}</span>
                                    <span className="truncate font-medium text-foreground">{formatProjectRecentActivitySummary(activeProject)}</span>
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsProjectInfoOpen((current) => !current)}
                                className="h-7 w-7 shrink-0 self-start lg:self-center"
                                aria-label={isProjectInfoOpen ? t("collapseProjectInfo") : t("expandProjectInfo")}
                                aria-expanded={isProjectInfoOpen}
                                title={isProjectInfoOpen ? t("collapseProjectInfo") : t("expandProjectInfo")}
                            >
                                {isProjectInfoOpen ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </div>

                        {isProjectInfoOpen && (
                            <div className="mt-3 grid gap-4 pt-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                                <div className="space-y-2">
                                    <div className="text-sm font-medium">{t("focusPrompt")}</div>
                                    <p className="break-words text-sm leading-6 text-muted-foreground">{activeProject.prompt}</p>
                                </div>

                                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                                    <ProjectOverviewItem
                                        label={t("automation")}
                                        value={activeProject.auto_enabled ? t("enabled") : t("manualOnly")}
                                    />
                                    <ProjectOverviewItem
                                        label={t("checkInterval")}
                                        value={activeProject.auto_enabled ? formatAutoSummary(activeProject) : t("notScheduled")}
                                    />
                                    <ProjectOverviewItem
                                        label={t("webSearch")}
                                        value={activeProject.web_search_enabled ? t("active", { ns: "common" }) : t("inactive", { ns: "common" })}
                                    />
                                    <ProjectOverviewItem
                                        label={t("scopeLabel")}
                                        value={formatProjectScope(activeProject, sources)}
                                    />
                                    <ProjectOverviewItem
                                        label={t("lastChecked")}
                                        value={formatTimestamp(activeProject.last_auto_checked_at)}
                                    />
                                    <ProjectOverviewItem
                                        label={t("lastGenerated")}
                                        value={formatTimestamp(activeProject.last_auto_generated_at)}
                                    />
                                    <ProjectOverviewItem
                                        label={t("unreadReports")}
                                        value={formatUnreadReportCount(activeProjectUnreadCount)}
                                    />
                                    <ProjectOverviewItem
                                        label={t("reports")}
                                        value={t("nReports", { count: totalReportCount })}
                                    />
                                </div>
                            </div>
                        )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="inline-flex items-center overflow-hidden rounded-md border border-border">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn("rounded-none px-3", reportFilterMode === "all" && "bg-accent")}
                            onClick={() => handleReportFilterModeChange("all")}
                            aria-pressed={reportFilterMode === "all"}
                        >
                            {t("allReports")}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn("rounded-none border-l border-border px-3", reportFilterMode === "favorites" && "bg-accent")}
                            onClick={() => handleReportFilterModeChange("favorites")}
                            aria-pressed={reportFilterMode === "favorites"}
                        >
                            {t("favoriteReports")}
                        </Button>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                        {compactPaginationLabel ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                                {compactPaginationLabel}
                            </span>
                        ) : <span />}
                        <div className="inline-flex items-center overflow-hidden rounded-md border border-border">
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-7 w-7 rounded-none", cardViewMode === "card" && "bg-accent")}
                                onClick={() => handleCardViewModeChange("card")}
                                aria-label={t("viewReport")}
                                title={t("viewReport")}
                                aria-pressed={cardViewMode === "card"}
                                disabled={totalReportCount === 0}
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-7 w-7 rounded-none border-l border-border", cardViewMode === "list" && "bg-accent")}
                                onClick={() => handleCardViewModeChange("list")}
                                aria-label={t("viewList")}
                                title={t("viewList")}
                                aria-pressed={cardViewMode === "list"}
                                disabled={totalReportCount === 0}
                            >
                                <List className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>

                {cardViewMode === "card" ? (
                    <div className={AUTOMATION_TILE_GRID_CLASS}>
                        {reports.map((card) => (
                            <Card
                                key={card.id}
                                className={cn(
                                    GENERATED_TILE_CARD_CLASS,
                                    "rounded-lg border-border bg-card",
                                    card.is_read
                                        ? "shadow-[0_18px_44px_-36px_rgba(15,15,15,0.28)]"
                                        : "border-sky-200/80 bg-sky-50/40 shadow-[0_22px_48px_-40px_rgba(14,165,233,0.35)] dark:border-sky-400/20 dark:bg-sky-500/[0.06]",
                                )}
                                role="button"
                                tabIndex={0}
                                onClick={() => openAutomationReport(card.id, card)}
                                onKeyDown={(event) => handleGeneratedReportKeyDown(event, card.id)}
                            >
                                <CardHeader className={AUTOMATION_TILE_HEADER_CLASS}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <CardTitle
                                                className={cn(
                                                    "line-clamp-2 min-h-[3rem] text-base leading-6 tracking-tight",
                                                    card.is_read ? "text-foreground/90" : "text-foreground",
                                                )}
                                            >
                                                {card.title}
                                            </CardTitle>
                                        </div>
                                        <div className="flex items-start gap-1.5">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-8 w-8 shrink-0 rounded-full",
                                                    card.is_favorite && "text-amber-500 hover:text-amber-600",
                                                )}
                                                onClick={(event) => {
                                                    stopReportEventPropagation(event);
                                                    void handleSetReportFavorite(card, !card.is_favorite);
                                                }}
                                                onKeyDown={stopReportEventPropagation}
                                                aria-label={getFavoriteActionLabel(card)}
                                                title={getFavoriteActionLabel(card)}
                                                disabled={isFavoriteMutationPending(card.id)}
                                            >
                                                <Star className={cn("h-3.5 w-3.5", card.is_favorite && "fill-current")} />
                                            </Button>
                                            {!card.is_read && <span className="mt-3 inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500"></span>}
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                        <span className="tabular-nums">{formatUtcDateTime(card.created_at)}</span>
                                        <span>
                                            {card.generation_mode === "auto" ? t("auto") : t("manual")} · {formatArticleCount(card.used_article_count)}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className={AUTOMATION_TILE_BODY_CLASS}>
                                    <p
                                        className={cn(
                                            "line-clamp-5 min-h-[7.5rem] text-sm leading-6",
                                            card.is_read ? "text-muted-foreground" : "text-foreground/78",
                                        )}
                                    >
                                        {getAutomationReportPreviewExcerpt(card, GENERATED_TILE_PREVIEW_MAX_LENGTH)}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {reports.map((card) => (
                            <div
                                key={card.id}
                                className={cn(
                                    "group flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                    card.is_read
                                        ? "border-border bg-card"
                                        : "border-sky-200/80 bg-sky-50/40 dark:border-sky-400/20 dark:bg-sky-500/[0.06]",
                                )}
                                role="button"
                                tabIndex={0}
                                onClick={() => openAutomationReport(card.id, card)}
                                onKeyDown={(event) => handleGeneratedReportKeyDown(event, card.id)}
                            >
                                {!card.is_read && <span className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500"></span>}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className={cn(
                                            "line-clamp-1 text-sm font-semibold leading-6",
                                            card.is_read ? "text-foreground/90" : "text-foreground",
                                        )}>
                                            {card.title}
                                        </span>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-7 w-7 rounded-full",
                                                    card.is_favorite && "text-amber-500 hover:text-amber-600",
                                                )}
                                                onClick={(event) => {
                                                    stopReportEventPropagation(event);
                                                    void handleSetReportFavorite(card, !card.is_favorite);
                                                }}
                                                onKeyDown={stopReportEventPropagation}
                                                aria-label={getFavoriteActionLabel(card)}
                                                title={getFavoriteActionLabel(card)}
                                                disabled={isFavoriteMutationPending(card.id)}
                                            >
                                                <Star className={cn("h-3.5 w-3.5", card.is_favorite && "fill-current")} />
                                            </Button>
                                            <span className="text-xs tabular-nums text-muted-foreground">{formatUtcDateTime(card.created_at)}</span>
                                        </div>
                                    </div>
                                    <p className={cn(
                                        "mt-0.5 line-clamp-1 text-sm leading-5",
                                        card.is_read ? "text-muted-foreground" : "text-foreground/78",
                                    )}>
                                        {getAutomationReportPreviewExcerpt(card, 160)}
                                    </p>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                        <span>{card.generation_mode === "auto" ? t("auto") : t("manual")}</span>
                                        <span>·</span>
                                        <span>{formatArticleCount(card.used_article_count)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {reports.length === 0 && (
                    <div className="editor-empty">
                        <Lightbulb className="mb-4 h-10 w-10 text-muted-foreground/30" />
                        <p>{reportFilterMode === "favorites" ? t("noFavoriteReportsYet") : t("noAutomationReportsYet")}</p>
                        <p className="text-sm">{reportFilterMode === "favorites" ? t("favoriteFirstReport") : t("generateFirstReport")}</p>
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="border-t border-border px-3 py-1.5">
                        <div className="flex items-center justify-between gap-2 sm:hidden">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => goToReportPage(Math.max(0, currentPage - 1))}
                                disabled={!canGoToPreviousPage}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                <span className="sr-only">{t("previousPage", { ns: "common" })}</span>
                            </Button>
                            <span className="min-w-0 flex-1 text-center text-xs text-muted-foreground">
                                {compactPaginationLabel}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => goToReportPage(currentPage + 1)}
                                disabled={!canGoToNextPage}
                            >
                                <span className="sr-only">{t("nextPage", { ns: "common" })}</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        <div className="hidden items-center justify-center gap-2 sm:flex">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => goToReportPage(Math.max(0, currentPage - 1))}
                                disabled={!canGoToPreviousPage}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                {t("previous", { ns: "common" })}
                            </Button>

                            <nav aria-label={t("pagination", { ns: "common" })} className="flex items-center gap-1">
                                {paginationItems.map((item) => {
                                    if (item.type === "ellipsis") {
                                        return (
                                            <span
                                                key={item.key}
                                                className="flex h-7 w-7 items-center justify-center text-muted-foreground"
                                                aria-hidden="true"
                                            >
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                            </span>
                                        );
                                    }

                                    const isCurrentPage = item.page === currentPage;

                                    return (
                                        <Button
                                            key={item.page}
                                            type="button"
                                            variant={isCurrentPage ? "default" : "ghost"}
                                            size="sm"
                                            aria-current={isCurrentPage ? "page" : undefined}
                                            onClick={isCurrentPage ? undefined : () => goToReportPage(item.page)}
                                            className={cn(
                                                "h-7 min-w-7 px-2 text-xs",
                                                isCurrentPage && "pointer-events-none",
                                            )}
                                        >
                                            {item.page + 1}
                                        </Button>
                                    );
                                })}
                            </nav>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => goToReportPage(currentPage + 1)}
                                disabled={!canGoToNextPage}
                            >
                                {t("next", { ns: "common" })}
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}

                <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
                    <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
                        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-4">
                            <DialogTitle>{t("generateReportDialog")}</DialogTitle>
                            <DialogDescription>
                                {t("selectUpTo", { count: activeProject.max_articles_per_report })}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                            <div className="shrink-0 space-y-4">
                                <div className="grid gap-4 border-b pb-4 md:grid-cols-[minmax(0,1fr)_220px]">
                                    <div className="space-y-2">
                                        <Label>{t("searchArticles")}</Label>
                                        <Input
                                            value={candidateSearch}
                                            onChange={(event) => setCandidateSearch(event.target.value)}
                                            placeholder={t("searchByTitle")}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t("filterBySource")}</Label>
                                        <Select value={candidateSourceId} onValueChange={setCandidateSourceId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t("allSources")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">{t("allScopedSources")}</SelectItem>
                                                {scopedSources.map((source) => (
                                                    <SelectItem key={source.id} value={String(source.id)}>
                                                        {source.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <label className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <Checkbox
                                        checked={includeConsumed}
                                        onChange={(event) => setIncludeConsumed(event.target.checked)}
                                    />
                                    {t("includePreviouslyUsed")}
                                </label>

                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        {t("nSelected", { count: selectedArticleIds.length })} / {t("nMax", { count: activeProject.max_articles_per_report })}
                                    </span>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedArticleIds([])} disabled={selectedArticleIds.length === 0}>
                                        {t("clearSelection")}
                                    </Button>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                                <div className="space-y-3">
                                    {isLoadingCandidates && (
                                        <div className="editor-empty p-6">
                                            {t("loadingCandidates")}
                                        </div>
                                    )}

                                    {!isLoadingCandidates && articleCandidates.length === 0 && (
                                        <div className="editor-empty p-6">
                                            {t("noArticlesMatch")}
                                        </div>
                                    )}

                                    {!isLoadingCandidates && articleCandidates.map((article) => {
                                        const isSelected = selectedArticleIds.includes(article.id);
                                        const isSelectionLocked = !isSelected && selectedArticleIds.length >= activeProject.max_articles_per_report;

                                        return (
                                            <button
                                                key={article.id}
                                                type="button"
                                                onClick={() => toggleArticleSelection(article.id)}
                                                disabled={isSelectionLocked}
                                                className={`w-full rounded-md border p-3 text-left transition-colors ${isSelected ? "border-primary/30 bg-accent" : "border-border hover:border-primary/20 hover:bg-muted/50"} ${isSelectionLocked ? "cursor-not-allowed opacity-60" : ""}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onChange={() => undefined}
                                                        className="mt-0.5 pointer-events-none"
                                                    />
                                                    <div className="min-w-0 flex-1 space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{article.source_name}</span>
                                                            <span>{t("inserted", { date: formatTimestamp(article.inserted_at) })}</span>
                                                            {article.is_consumed && (
                                                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                                                                    {t("previouslyUsed")}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-sm font-semibold">{article.title}</div>
                                                        <p className="line-clamp-3 text-sm text-muted-foreground">
                                                            {article.summary || t("noSummaryAvailable")}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:justify-end">
                            <Button type="button" variant="outline" onClick={() => setManualDialogOpen(false)}>
                                {t("cancel", { ns: "common" })}
                            </Button>
                            <Button type="button" onClick={handleManualGenerate} disabled={selectedArticleIds.length === 0 || isGenerating}>
                                {isGenerating ? t("generating") : t("generateReport")}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                    {renderProjectDialog()}
                    {renderDeleteProjectDialog()}
                </PageShell>
                <BackToTopButton targetRefs={projectDetailBackToTopTargetRefs} label={backToTopLabel} />
            </>
        );
    }

    return (
        <PageShell
            variant="workspace"
            size="wide"
            contentClassName="space-y-8"
            header={{
                density: "compact",
                eyebrow: t("eyebrow"),
                title: t("projectBoard"),
                showTitle: false,
                titlelessLayout: "compact",
                description: t("boardDescription"),
                showDescription: false,
                stats: [
                    { label: t("projects"), value: t("nTotal", { count: projects.length }) },
                    { label: t("unreadReports"), value: formatUnreadReportCount(totalUnreadReportCount), tone: totalUnreadReportCount > 0 ? "warning" : "default" },
                    { label: t("autoEnabled"), value: t("nActive", { count: autoEnabledProjectCount }), tone: "accent" },
                ],
                actions: renderProjectDialog(
                    <Button size="sm" onClick={openCreateProjectDialog}>
                        <Plus className="h-3.5 w-3.5" /> {t("newProject")}
                    </Button>,
                ),
            }}
        >

            <div className={AUTOMATION_TILE_GRID_CLASS}>
                {projects.map((project) => (
                    <Card
                        key={project.id}
                        className={cn(
                            PROJECT_TILE_CARD_CLASS,
                            "rounded-lg border-border bg-card",
                            project.unread_report_count > 0
                                ? "border-sky-200/80 shadow-[0_24px_52px_-40px_rgba(14,165,233,0.32)] dark:border-sky-400/20"
                                : "shadow-[0_18px_42px_-38px_rgba(15,15,15,0.28)]",
                        )}
                        role="button"
                        tabIndex={0}
                        onClick={() => openProjectDetail(project.id)}
                        onKeyDown={(event) => handleProjectCardKeyDown(event, project.id)}
                    >
                        <CardHeader className={AUTOMATION_TILE_HEADER_CLASS}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <CardTitle className="truncate text-xl tracking-tight">{project.name}</CardTitle>
                                </div>
                                {project.unread_report_count > 0 && (
                                    <div className="inline-flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-100/85 px-2 text-sm font-semibold leading-none tabular-nums text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/15 dark:text-sky-300">
                                        <span>
                                            {formatUnreadReportCount(project.unread_report_count)}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <CardDescription className="mt-3 line-clamp-2 min-h-[3rem] text-sm leading-6 text-muted-foreground/90">
                                {project.prompt}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className={`${AUTOMATION_TILE_BODY_CLASS} text-sm text-muted-foreground`}>
                            <div className="mt-auto border-t border-border pt-3">
                                <div className="grid grid-cols-3 gap-3 text-left">
                                    <div>
                                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("auto")}</div>
                                        <div className="mt-1 text-sm font-medium text-foreground">{formatCompactAutoSummary(project)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("scopeLabel")}</div>
                                        <div className="mt-1 truncate text-sm font-medium text-foreground">
                                            {formatProjectScopeSummary(project, sources)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("minLabel")}–{t("maxLabel")}</div>
                                        <div className="mt-1 text-sm font-medium text-foreground">{project.min_articles_per_report}–{project.max_articles_per_report} {t("articlesUnit")}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(event) => {
                                        stopReportEventPropagation(event);
                                        openEditProjectDialog(project);
                                    }}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    {t("edit", { ns: "common" })}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto text-destructive"
                                    onClick={(event) => {
                                        stopReportEventPropagation(event);
                                        openDeleteProjectDialog(project);
                                    }}
                                    disabled={deletingProjectId === project.id}
                                    aria-label={deletingProjectId === project.id ? t("deletingName", { name: project.name }) : t("deleteName", { name: project.name })}
                                    title={deletingProjectId === project.id ? t("deleting") : t("delete", { ns: "common" })}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {projects.length === 0 && (
                    <div className="editor-empty col-span-full">
                        {t("noAutomationProjectsYet")}
                    </div>
                )}
            </div>
            {renderDeleteProjectDialog()}
        </PageShell>
    );
}
