import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { addCreativeSyncListener } from "@/lib/creative-events";
import {
    type CreativeArticleCandidate,
    type CreativeCard,
    type CreativeProject,
    type CreativeSourceOption,
    generateCreativeCardForProject,
    listCreativeCards,
    listCreativeProjects,
    listCreativeSources,
    listProjectCandidateArticles,
    saveCreativeProject,
    deleteCreativeProject,
} from "@/lib/creative-service";
import { optimizeCreativeProjectPrompt, type Message } from "@/lib/ai";
import { PageShell } from "@/components/layout/PageShell";
import { useStreamingConversation } from "@/hooks/use-streaming-conversation";
import { getCreativeCardBodyMarkdown, getCreativeCardPreviewExcerpt } from "@/lib/creative-card";
import { formatUtcDate, formatUtcDateTime } from "@/lib/time";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Lightbulb, Loader2, Pencil, Plus, Send, Trash2, WandSparkles } from "lucide-react";

type ProjectFormState = {
    name: string;
    prompt: string;
    autoEnabled: boolean;
    autoIntervalMinutes: string;
    maxArticlesPerCard: string;
    useAllSources: boolean;
    sourceIds: number[];
};

const DEFAULT_AUTO_INTERVAL_MINUTES = "60";
const DEFAULT_MAX_ARTICLES_PER_CARD = "12";

function createEmptyProjectFormState(): ProjectFormState {
    return {
        name: "",
        prompt: "",
        autoEnabled: false,
        autoIntervalMinutes: DEFAULT_AUTO_INTERVAL_MINUTES,
        maxArticlesPerCard: DEFAULT_MAX_ARTICLES_PER_CARD,
        useAllSources: true,
        sourceIds: [],
    };
}

function createProjectFormState(project?: CreativeProject): ProjectFormState {
    if (!project) {
        return createEmptyProjectFormState();
    }

    return {
        name: project.name,
        prompt: project.prompt,
        autoEnabled: project.auto_enabled,
        autoIntervalMinutes: String(project.auto_interval_minutes),
        maxArticlesPerCard: String(project.max_articles_per_card),
        useAllSources: project.source_ids.length === 0,
        sourceIds: project.source_ids,
    };
}

function formatTimestamp(value: string | null): string {
    return formatUtcDateTime(value, "Never");
}

function formatProjectScope(project: CreativeProject, sources: CreativeSourceOption[]): string {
    if (project.source_ids.length === 0) {
        return "All sources";
    }

    const sourceNames = sources
        .filter((source) => project.source_ids.includes(source.id))
        .map((source) => source.name);

    if (sourceNames.length === 0) {
        return `${project.source_ids.length} selected source${project.source_ids.length === 1 ? "" : "s"}`;
    }

    return sourceNames.join(", ");
}

function formatAutoSummary(project: CreativeProject): string {
    if (!project.auto_enabled) {
        return "Manual only";
    }

    return `Every ${project.auto_interval_minutes} minute${project.auto_interval_minutes === 1 ? "" : "s"}`;
}

type ProjectDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingProjectId: number | null;
    projectForm: ProjectFormState;
    setProjectForm: React.Dispatch<React.SetStateAction<ProjectFormState>>;
    isSavingProject: boolean;
    sources: CreativeSourceOption[];
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
    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingProjectId ? "Edit Creative Project" : "Create Creative Project"}</DialogTitle>
                        <DialogDescription>
                            Configure the focus prompt, automation interval, and source scope for this project.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={onSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label>Project Name</Label>
                            <Input
                                value={projectForm.name}
                                onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder="e.g. AI startup opportunities"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <Label>Focus Prompt</Label>
                                <span className="text-xs text-muted-foreground">Use AI to refine the current prompt.</span>
                            </div>
                            <div className="relative">
                                <Textarea
                                    value={projectForm.prompt}
                                    onChange={(event) => setProjectForm((current) => ({ ...current, prompt: event.target.value }))}
                                    placeholder="Act as a product strategist. Look for product gaps and emerging needs..."
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
                                    aria-label="Optimize prompt with AI"
                                    title="Optimize prompt with AI"
                                >
                                    {isOptimizingPrompt ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <WandSparkles className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-3 rounded-xl border p-4">
                                <label className="flex items-center gap-3 text-sm font-medium">
                                    <Checkbox
                                        checked={projectForm.autoEnabled}
                                        onChange={(event) => setProjectForm((current) => ({ ...current, autoEnabled: event.target.checked }))}
                                    />
                                    Enable automatic card generation
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    The app checks this project every configured interval and only generates a card when new scoped articles exist.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Auto interval (minutes)</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={projectForm.autoIntervalMinutes}
                                    onChange={(event) => setProjectForm((current) => ({ ...current, autoIntervalMinutes: event.target.value }))}
                                    disabled={!projectForm.autoEnabled}
                                />
                                <p className="text-xs text-muted-foreground">Example: set to 60 to check once per hour.</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Max articles per card</Label>
                            <Input
                                type="number"
                                min="1"
                                value={projectForm.maxArticlesPerCard}
                                onChange={(event) => setProjectForm((current) => ({ ...current, maxArticlesPerCard: event.target.value }))}
                            />
                            <p className="text-xs text-muted-foreground">Applies to both automatic runs and manual article selection.</p>
                        </div>

                        <div className="space-y-4 rounded-xl border p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <Label>Source scope</Label>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Choose which news sources can feed this project.
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
                                    Use all sources
                                </label>
                            </div>

                            {projectForm.useAllSources && (
                                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                    New and existing articles from every source will be eligible for this project.
                                </div>
                            )}

                            {!projectForm.useAllSources && (
                                <div className="max-h-64 space-y-2 overflow-y-auto">
                                    {sources.length === 0 && (
                                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                            No sources available yet.
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
                                                    {source.article_count} article{source.article_count === 1 ? "" : "s"} · {source.active ? "Active" : "Inactive"}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onCancel}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSavingProject}>
                                {isSavingProject ? "Saving..." : editingProjectId ? "Save Changes" : "Create Project"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={promptSuggestionOpen} onOpenChange={onPromptSuggestionOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Review Optimized Prompt</DialogTitle>
                        <DialogDescription>
                            Compare the original prompt with the AI rewrite, then choose whether to replace it.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Original Prompt</Label>
                            <Textarea value={promptSuggestionOriginal} readOnly className="min-h-28 resize-none bg-muted/40" />
                        </div>

                        <div className="space-y-2">
                            <Label>Optimized Prompt</Label>
                            <Textarea
                                value={promptSuggestionDraft}
                                onChange={(event) => setPromptSuggestionDraft(event.target.value)}
                                className="min-h-40 resize-y"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onPromptSuggestionOpenChange(false)}>
                            Keep Original
                        </Button>
                        <Button type="button" onClick={onApplyPromptSuggestion} disabled={!promptSuggestionDraft.trim()}>
                            Replace Prompt
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function CreativeSpace() {
    const { toast } = useToast();

    const [projects, setProjects] = useState<CreativeProject[]>([]);
    const [cards, setCards] = useState<CreativeCard[]>([]);
    const [sources, setSources] = useState<CreativeSourceOption[]>([]);

    const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
    const [activeCardId, setActiveCardId] = useState<number | null>(null);

    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
    const [projectForm, setProjectForm] = useState<ProjectFormState>(createEmptyProjectFormState);
    const [isSavingProject, setIsSavingProject] = useState(false);
    const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
    const [promptSuggestionDialogOpen, setPromptSuggestionDialogOpen] = useState(false);
    const [promptSuggestionOriginal, setPromptSuggestionOriginal] = useState("");
    const [promptSuggestionDraft, setPromptSuggestionDraft] = useState("");
    const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);

    const [manualDialogOpen, setManualDialogOpen] = useState(false);
    const [articleCandidates, setArticleCandidates] = useState<CreativeArticleCandidate[]>([]);
    const [candidateSearch, setCandidateSearch] = useState("");
    const [candidateSourceId, setCandidateSourceId] = useState("all");
    const [includeConsumed, setIncludeConsumed] = useState(false);
    const [selectedArticleIds, setSelectedArticleIds] = useState<number[]>([]);
    const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const [chatInput, setChatInput] = useState("");
    const {
        messages: chatMessages,
        isStreaming: isChatStreaming,
        send: sendChatMessage,
        replaceMessages: replaceChatMessages,
    } = useStreamingConversation();
    const promptOptimizationRequestIdRef = useRef(0);
    const projectDialogOpenRef = useRef(projectDialogOpen);

    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
    const activeCard = cards.find((card) => card.id === activeCardId) ?? null;
    const activeCardBodyMarkdown = activeCard ? getCreativeCardBodyMarkdown(activeCard) : "";
    const scopedSources = activeProject
        ? sources.filter((source) => activeProject.source_ids.length === 0 || activeProject.source_ids.includes(source.id))
        : [];

    useEffect(() => {
        void loadProjects();
        void loadSources();
    }, []);

    useEffect(() => {
        projectDialogOpenRef.current = projectDialogOpen;
    }, [projectDialogOpen]);

    useEffect(() => {
        if (activeProjectId === null) {
            setCards([]);
            setActiveCardId(null);
            return;
        }

        void loadCards(activeProjectId);
    }, [activeProjectId]);

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
                    toast({ title: "Failed to load candidate articles", description: String(error), variant: "destructive" });
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
        return addCreativeSyncListener(() => {
            void loadProjects();
            void loadSources();

            if (activeProjectId !== null) {
                void loadCards(activeProjectId);
            }

            if (manualDialogOpen && activeProjectId !== null) {
                void refreshCandidateArticles(activeProjectId);
            }
        });
    }, [activeProjectId, manualDialogOpen, includeConsumed, candidateSearch, candidateSourceId]);

    useEffect(() => {
        replaceChatMessages([]);
        setChatInput("");
    }, [activeCardId, replaceChatMessages]);

    async function loadProjects() {
        try {
            const result = await listCreativeProjects();
            setProjects(result);

            if (activeProjectId !== null && !result.some((project) => project.id === activeProjectId)) {
                setActiveProjectId(null);
                setActiveCardId(null);
            }

            if (editingProjectId !== null && !result.some((project) => project.id === editingProjectId)) {
                setEditingProjectId(null);
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function loadCards(projectId: number) {
        try {
            const result = await listCreativeCards(projectId);
            setCards(result);

            if (activeCardId !== null && !result.some((card) => card.id === activeCardId)) {
                setActiveCardId(null);
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function loadSources() {
        try {
            const result = await listCreativeSources();
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

    function openEditProjectDialog(project: CreativeProject) {
        resetPromptSuggestionState();
        setEditingProjectId(project.id);
        setProjectForm(createProjectFormState(project));
        setProjectDialogOpen(true);
    }

    function openProjectDetail(projectId: number) {
        setActiveProjectId(projectId);
    }

    function handleProjectCardKeyDown(event: React.KeyboardEvent<HTMLDivElement>, projectId: number) {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        event.preventDefault();
        openProjectDetail(projectId);
    }

    function stopCardClickPropagation(event: React.MouseEvent<HTMLButtonElement>) {
        event.stopPropagation();
    }

    async function handleProjectSubmit(event: React.FormEvent) {
        event.preventDefault();
        setIsSavingProject(true);

        try {
            const savedProject = await saveCreativeProject(
                {
                    name: projectForm.name,
                    prompt: projectForm.prompt,
                    auto_enabled: projectForm.autoEnabled,
                    auto_interval_minutes: Number.parseInt(projectForm.autoIntervalMinutes, 10),
                    max_articles_per_card: Number.parseInt(projectForm.maxArticlesPerCard, 10),
                    use_all_sources: projectForm.useAllSources,
                    source_ids: projectForm.sourceIds,
                },
                editingProjectId ?? undefined,
            );

            closeProjectDialog();

            if (!editingProjectId) {
                setActiveProjectId(savedProject.id);
            }

            toast({ title: editingProjectId ? "Project updated" : "Project created" });
            await loadProjects();
            if (activeProjectId === savedProject.id) {
                await loadCards(savedProject.id);
            }
        } catch (error) {
            toast({ title: "Failed to save project", description: String(error), variant: "destructive" });
        } finally {
            setIsSavingProject(false);
        }
    }

    async function handleDeleteProject(projectId: number) {
        setDeletingProjectId(projectId);
        try {
            await deleteCreativeProject(projectId);
            toast({ title: "Project deleted" });

            if (activeProjectId === projectId) {
                leaveProjectDetail();
            }

            await loadProjects();
        } catch (error) {
            toast({ title: "Failed to delete project", description: String(error), variant: "destructive" });
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
        setManualDialogOpen(false);
        closeProjectDialog();
        setSelectedArticleIds([]);
        setActiveCardId(null);
        setActiveProjectId(null);
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

            if (currentSelectedIds.length >= activeProject.max_articles_per_card) {
                toast({
                    title: `Select up to ${activeProject.max_articles_per_card} article${activeProject.max_articles_per_card === 1 ? "" : "s"}`,
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
            const optimizedPrompt = await optimizeCreativeProjectPrompt(rawPrompt);
            if (!projectDialogOpenRef.current || promptOptimizationRequestIdRef.current !== requestId) {
                return;
            }

            setPromptSuggestionOriginal(rawPrompt);
            setPromptSuggestionDraft(optimizedPrompt);
            setPromptSuggestionDialogOpen(true);
        } catch (error) {
            if (promptOptimizationRequestIdRef.current === requestId) {
                toast({ title: "Failed to optimize prompt", description: String(error), variant: "destructive" });
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
            const generatedCard = await generateCreativeCardForProject({
                projectId: activeProject.id,
                articleIds: selectedArticleIds,
                mode: "manual",
            });

            await loadCards(activeProject.id);
            setActiveCardId(generatedCard.id);
            setManualDialogOpen(false);
            setSelectedArticleIds([]);
            toast({ title: "Card generated" });
        } catch (error) {
            toast({ title: "Generation failed", description: String(error), variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    }

    async function handleChat(event: React.FormEvent) {
        event.preventDefault();
        if (!chatInput.trim() || isChatStreaming || !activeCard) {
            return;
        }

        const inputValue = chatInput.trim();
        setChatInput("");

        await sendChatMessage({
            content: inputValue,
            buildConversation: async (history, userMessage) => {
                const systemPrompt = `You are discussing a creative report you generated.
Report Data:
Title: ${activeCard.title}
Body:
${activeCardBodyMarkdown}

Be concise and explore the user's questions further.`;

                return [
                    { role: "system", content: systemPrompt } as Message,
                    ...history,
                    userMessage,
                ];
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

    if (activeCard) {
        return (
            <div className="relative flex h-full flex-col bg-background">
                <div className="flex items-center border-b p-4">
                    <Button variant="ghost" size="sm" onClick={() => setActiveCardId(null)}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <div className="ml-4 min-w-0">
                        <div className="truncate text-lg font-semibold">{activeCard.title}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>{activeCard.generation_mode === "auto" ? "Auto" : "Manual"} run</span>
                            <span>{activeCard.used_article_count} article{activeCard.used_article_count === 1 ? "" : "s"}</span>
                            <span>{formatTimestamp(activeCard.created_at)}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 space-y-8 overflow-y-auto px-4 py-4 md:px-6 md:py-6 lg:px-4 lg:py-4">
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown>{activeCardBodyMarkdown}</ReactMarkdown>
                        </div>
                    </div>
                    <div className="flex w-96 flex-col border-l bg-muted/10">
                        <div className="border-b p-4 font-medium">Discuss Card</div>
                        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                            {chatMessages.length === 0 && (
                                <p className="mt-10 text-center text-muted-foreground">Expand on this report with AI.</p>
                            )}
                            {chatMessages.map((message, index) => (
                                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[85%] rounded-xl px-3 py-2 ${message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card shadow-sm"}`}>
                                        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
                                            <ReactMarkdown>{message.content}</ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="border-t bg-card p-3">
                            <form onSubmit={handleChat} className="flex items-center gap-2">
                                <Input
                                    value={chatInput}
                                    onChange={(event) => setChatInput(event.target.value)}
                                    placeholder="Explore further..."
                                    disabled={isChatStreaming}
                                    className="h-8 text-sm"
                                />
                                <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={isChatStreaming || !chatInput.trim()}>
                                    <Send className="h-3.5 w-3.5" />
                                </Button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (activeProject) {
        return (
            <PageShell variant="workspace" size="wide" className="space-y-8">
                <Button variant="ghost" size="sm" onClick={leaveProjectDetail} className="-ml-2">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
                </Button>

                <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold">{activeProject.name}</h1>
                        <p className="max-w-3xl text-sm text-muted-foreground">{activeProject.prompt}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => openEditProjectDialog(activeProject)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit Project
                        </Button>
                        <Button onClick={openManualGenerateDialog} disabled={isGenerating}>
                            <WandSparkles className="mr-2 h-4 w-4" /> {isGenerating ? "Generating..." : "Generate Card"}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Auto Generation</CardTitle>
                            <CardDescription>{formatAutoSummary(activeProject)}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                            <p>Interval: {activeProject.auto_interval_minutes} minute{activeProject.auto_interval_minutes === 1 ? "" : "s"}</p>
                            <p>Max articles per card: {activeProject.max_articles_per_card}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">News Scope</CardTitle>
                            <CardDescription>{activeProject.source_ids.length === 0 ? "All sources" : `${activeProject.source_ids.length} selected source${activeProject.source_ids.length === 1 ? "" : "s"}`}</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            {formatProjectScope(activeProject, sources)}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Automation History</CardTitle>
                            <CardDescription>Last scheduler activity for this project</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                            <p>Last checked: {formatTimestamp(activeProject.last_auto_checked_at)}</p>
                            <p>Last generated: {formatTimestamp(activeProject.last_auto_generated_at)}</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {cards.map((card) => (
                        <Card key={card.id} className="flex h-72 cursor-pointer flex-col transition-all hover:border-primary/50 hover:shadow-md" onClick={() => setActiveCardId(card.id)}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>{formatUtcDate(card.created_at)}</span>
                                    <span>{card.generation_mode === "auto" ? "Auto" : "Manual"} · {card.used_article_count}</span>
                                </div>
                                <CardTitle className="line-clamp-2 text-lg leading-tight">{card.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="relative flex-1 overflow-hidden pt-2">
                                <p className="line-clamp-4 text-sm text-muted-foreground">
                                    {getCreativeCardPreviewExcerpt(card)}
                                </p>
                                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent" />
                            </CardContent>
                        </Card>
                    ))}

                    {cards.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center text-muted-foreground">
                            <Lightbulb className="mb-4 h-12 w-12 text-muted-foreground/30" />
                            <p>No creative cards generated yet.</p>
                            <p className="text-sm">Choose news articles and generate the first card for this project.</p>
                        </div>
                    )}
                </div>

                <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
                    <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
                        <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
                            <DialogTitle>Generate Card</DialogTitle>
                            <DialogDescription>
                                Select up to {activeProject.max_articles_per_card} article{activeProject.max_articles_per_card === 1 ? "" : "s"} for this manual run.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
                            <div className="shrink-0 space-y-4">
                                <div className="grid gap-4 border-b pb-4 md:grid-cols-[minmax(0,1fr)_220px]">
                                    <div className="space-y-2">
                                        <Label>Search articles</Label>
                                        <Input
                                            value={candidateSearch}
                                            onChange={(event) => setCandidateSearch(event.target.value)}
                                            placeholder="Search by title or summary..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Filter by source</Label>
                                        <Select value={candidateSourceId} onValueChange={setCandidateSourceId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="All sources" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All scoped sources</SelectItem>
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
                                    Include previously used articles for this project
                                </label>

                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        {selectedArticleIds.length} selected / {activeProject.max_articles_per_card} max
                                    </span>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedArticleIds([])} disabled={selectedArticleIds.length === 0}>
                                        Clear selection
                                    </Button>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
                                <div className="space-y-3">
                                    {isLoadingCandidates && (
                                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                                            Loading candidate articles...
                                        </div>
                                    )}

                                    {!isLoadingCandidates && articleCandidates.length === 0 && (
                                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                                            No articles match the current filters.
                                        </div>
                                    )}

                                    {!isLoadingCandidates && articleCandidates.map((article) => {
                                        const isSelected = selectedArticleIds.includes(article.id);
                                        const isSelectionLocked = !isSelected && selectedArticleIds.length >= activeProject.max_articles_per_card;

                                        return (
                                            <button
                                                key={article.id}
                                                type="button"
                                                onClick={() => toggleArticleSelection(article.id)}
                                                disabled={isSelectionLocked}
                                                className={`w-full rounded-xl border p-4 text-left transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"} ${isSelectionLocked ? "cursor-not-allowed opacity-60" : ""}`}
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
                                                            <span>Inserted {formatTimestamp(article.inserted_at)}</span>
                                                            {article.is_consumed && (
                                                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                                                                    Previously used
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-sm font-semibold">{article.title}</div>
                                                        <p className="line-clamp-3 text-sm text-muted-foreground">
                                                            {article.summary || "No summary available."}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 sm:justify-end">
                            <Button type="button" variant="outline" onClick={() => setManualDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleManualGenerate} disabled={selectedArticleIds.length === 0 || isGenerating}>
                                {isGenerating ? "Generating..." : "Generate Card"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {renderProjectDialog()}
            </PageShell>
        );
    }

    return (
        <PageShell variant="workspace" size="wide" className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Creative Space</h1>
                    <p className="mt-2 text-muted-foreground">
                        Turn scoped news into repeatable strategy cards with manual and automatic generation.
                    </p>
                </div>

                {renderProjectDialog(
                    <Button onClick={openCreateProjectDialog}>
                        <Plus className="mr-2 h-4 w-4" /> New Project
                    </Button>,
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {projects.map((project) => (
                    <Card
                        key={project.id}
                        className="flex cursor-pointer flex-col transition-all hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        role="button"
                        tabIndex={0}
                        onClick={() => openProjectDetail(project.id)}
                        onKeyDown={(event) => handleProjectCardKeyDown(event, project.id)}
                    >
                        <CardHeader className="px-4 py-4 pb-2">
                            <div className="min-w-0 flex-1">
                                <CardTitle className="truncate text-lg">{project.name}</CardTitle>
                                <CardDescription className="mt-1.5 line-clamp-2 text-sm">{project.prompt}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 px-4 pb-4 pt-0 text-sm text-muted-foreground">
                            <div className="space-y-1.5">
                                <p>{formatAutoSummary(project)}</p>
                                <p>Scope: {project.source_ids.length === 0 ? "All sources" : `${project.source_ids.length} selected`}</p>
                                <p>Max articles: {project.max_articles_per_card}</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(event) => {
                                        stopCardClickPropagation(event);
                                        openEditProjectDialog(project);
                                    }}
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto text-destructive"
                                    onClick={(event) => {
                                        stopCardClickPropagation(event);
                                        void handleDeleteProject(project.id);
                                    }}
                                    disabled={deletingProjectId === project.id}
                                    aria-label={deletingProjectId === project.id ? `Deleting ${project.name}` : `Delete ${project.name}`}
                                    title={deletingProjectId === project.id ? "Deleting..." : "Delete"}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {projects.length === 0 && (
                    <div className="col-span-full rounded-xl border-2 border-dashed p-12 text-center text-muted-foreground">
                        No creative projects yet.
                    </div>
                )}
            </div>
        </PageShell>
    );
}
