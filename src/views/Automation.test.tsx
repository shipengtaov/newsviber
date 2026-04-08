// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Automation from "@/views/Automation";

const {
    listAutomationProjectsMock,
    listAutomationReportsMock,
    listAutomationReportSourceArticlesMock,
    listAutomationSourcesMock,
    listProjectCandidateArticlePageMock,
    markAutomationReportAsReadMock,
    setAutomationReportFavoriteMock,
    mockUseMainLayoutScrollContainer,
    toastMock,
    useScopedScrollMemoryMock,
    replaceMessagesMock,
} = vi.hoisted(() => ({
    listAutomationProjectsMock: vi.fn(),
    listAutomationReportsMock: vi.fn(),
    listAutomationReportSourceArticlesMock: vi.fn(),
    listAutomationSourcesMock: vi.fn(),
    listProjectCandidateArticlePageMock: vi.fn(),
    markAutomationReportAsReadMock: vi.fn(),
    setAutomationReportFavoriteMock: vi.fn(),
    mockUseMainLayoutScrollContainer: vi.fn(),
    toastMock: vi.fn(),
    useScopedScrollMemoryMock: vi.fn(),
    replaceMessagesMock: vi.fn(),
}));

const commonTranslations: Record<string, string> = {
    back: "Back",
    backToTop: "Back to top",
    cancel: "Cancel",
    previous: "Previous",
    next: "Next",
    previousPage: "Previous page",
    nextPage: "Next page",
    pagination: "Pagination",
    active: "Active",
    inactive: "Inactive",
    edit: "Edit",
    delete: "Delete",
};

const automationTranslations: Record<string, string> = {
    eyebrow: "Automation",
    projectBoard: "Project board",
    boardDescription: "Board description",
    projects: "Projects",
    unreadReports: "Unread reports",
    autoEnabled: "Auto enabled",
    nTotal: "{{count}} total",
    nActive: "{{count}} active",
    newProject: "New project",
    pageXOfY: "Page {{page}} / {{total}}",
    scopeLabel: "Scope",
    unreadLabel: "Unread",
    projectDescription: "Project description",
    generateReport: "Generate report",
    generating: "Generating",
    allReports: "All",
    favoriteReports: "Favorites",
    addToFavorites: "Add to favorites",
    removeFromFavorites: "Remove from favorites",
    markAllAsRead: "Mark all as read",
    openProjectActions: "Open project actions",
    editProject: "Edit project",
    deleteProject: "Delete project",
    auto: "Auto",
    manual: "Manual",
    run: "run",
    viewReport: "Report view",
    viewList: "List view",
    noAutomationReportsYet: "No reports yet",
    noFavoriteReportsYet: "No favorited reports yet",
    favoriteFirstReport: "Favorite a report to keep it pinned here",
    generateFirstReport: "Generate the first report",
    focusPrompt: "Focus prompt",
    automation: "Automation",
    enabled: "Enabled",
    manualOnly: "Manual only",
    checkInterval: "Check interval",
    lastAttempted: "Last attempted",
    lastConsumed: "Last consumed",
    notScheduled: "Not scheduled",
    webSearch: "Web search",
    lastChecked: "Last checked",
    lastGenerated: "Last generated",
    reports: "Reports",
    nReports: "{{count}} reports",
    updatedLabel: "Updated",
    reportsLabel: "Reports",
    minLabel: "Min",
    maxLabel: "Max",
    collapseProjectInfo: "Collapse project info",
    expandProjectInfo: "Expand project info",
    allSources: "All sources",
    noRecentActivity: "No recent activity",
    checked: "Checked {{date}}",
    generated: "Generated {{date}}",
    everyNMinutes: "Every {{count}} minutes",
    hideDiscussion: "Hide discussion",
    discussReport: "Discuss report",
    noAutomationProjectsYet: "No projects yet",
    failedToUpdateFavorite: "Failed to update favorite",
    articlesUnit: "articles",
    generateReportDialog: "Generate Report",
    selectUpTo: "Select up to {{count}} for this manual run.",
    searchArticles: "Search articles",
    searchByTitle: "Search by title or summary...",
    filterBySource: "Filter by source",
    allScopedSources: "All scoped sources",
    includePreviouslyUsed: "Include previously used articles for this project",
    nSelected: "{{count}} selected",
    nMax: "{{count}} max",
    selectCurrentPage: "Select page",
    deselectCurrentPage: "Deselect page",
    clearSelection: "Clear selection",
    loadingCandidates: "Loading candidate articles...",
    noArticlesMatch: "No articles match the current filters.",
    inserted: "Inserted {{date}}",
    previouslyUsed: "Previously used",
    noSummaryAvailable: "No summary available.",
    failedToLoadCandidates: "Failed to load candidate articles",
    selectUpToN: "Select up to {{count}}",
};

const manualCandidateArticles = [
    {
        id: 101,
        source_id: 1,
        source_name: "Example Source",
        title: "Candidate Article 1",
        summary: "Summary for candidate article 1.",
        published_at: null,
        inserted_at: "2026-03-30T00:00:00Z",
        is_consumed: false,
    },
    {
        id: 102,
        source_id: 1,
        source_name: "Example Source",
        title: "Candidate Article 2",
        summary: "Summary for candidate article 2.",
        published_at: null,
        inserted_at: "2026-03-29T00:00:00Z",
        is_consumed: true,
    },
];

function createManualCandidateArticle(id: number, overrides: Partial<{
    source_id: number;
    source_name: string;
    title: string;
    summary: string;
    published_at: string | null;
    inserted_at: string;
    is_consumed: boolean;
}> = {}) {
    return {
        id,
        source_id: overrides.source_id ?? 1,
        source_name: overrides.source_name ?? "Example Source",
        title: overrides.title ?? `Candidate Article ${id}`,
        summary: overrides.summary ?? `Summary for candidate article ${id}.`,
        published_at: overrides.published_at ?? null,
        inserted_at: overrides.inserted_at ?? `2026-03-${String(Math.max(1, 31 - id)).padStart(2, "0")}T00:00:00Z`,
        is_consumed: overrides.is_consumed ?? false,
    };
}

function translate(template: string, options?: Record<string, unknown>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(options?.[key] ?? ""));
}

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const namespace = String(options?.ns ?? ns ?? "common");
            const dictionary = namespace === "common" ? commonTranslations : automationTranslations;
            return translate(dictionary[key] ?? `${namespace}:${key}`, options);
        },
    }),
}));

vi.mock("@/components/ui/select", async () => {
    const React = await vi.importActual<typeof import("react")>("react");

    function extractText(node: React.ReactNode): string {
        return React.Children.toArray(node).map((child) => {
            if (typeof child === "string" || typeof child === "number") {
                return String(child);
            }

            if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
                return extractText(child.props.children);
            }

            return "";
        }).join("");
    }

    const SelectItem = ({ children }: { children: React.ReactNode; value: string }) => <>{children}</>;
    const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    const SelectTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    const SelectValue = ({ placeholder }: { placeholder?: string }) => <>{placeholder ?? null}</>;

    function collectOptions(children: React.ReactNode): Array<{ label: string; value: string }> {
        return React.Children.toArray(children).flatMap((child) => {
            if (!React.isValidElement<{ children?: React.ReactNode; value?: string }>(child)) {
                return [];
            }

            if (child.type === SelectItem) {
                return [{
                    label: extractText(child.props.children),
                    value: String(child.props.value ?? ""),
                }];
            }

            return collectOptions(child.props.children);
        });
    }

    const Select = ({ value, onValueChange, children }: { value?: string; onValueChange?: (value: string) => void; children: React.ReactNode }) => {
        const options = collectOptions(children);

        return (
            <select
                data-testid="manual-report-source-select"
                value={value}
                onChange={(event) => onValueChange?.(event.target.value)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        );
    };

    return {
        Select,
        SelectTrigger,
        SelectValue,
        SelectContent,
        SelectItem,
    };
});

vi.mock("@/components/ui/dialog", async () => {
    const React = await vi.importActual<typeof import("react")>("react");
    const DialogContext = React.createContext<{ open?: boolean }>({ open: true });

    const Dialog = ({ open = true, children }: { open?: boolean; children: React.ReactNode }) => (
        <DialogContext.Provider value={{ open }}>
            {children}
        </DialogContext.Provider>
    );

    const DialogTrigger = ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>;
    const DialogContent = ({ children, className }: { children: React.ReactNode; className?: string }) => {
        const { open } = React.useContext(DialogContext);
        return open === false ? null : <div className={className}>{children}</div>;
    };
    const DialogDescription = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    const DialogFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>;
    const DialogHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>;
    const DialogTitle = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

    return {
        Dialog,
        DialogTrigger,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle,
    };
});

vi.mock("@/lib/i18n", () => ({
    default: {
        t: (key: string, options?: Record<string, unknown>) => {
            if (key === "automation:allSources") {
                return "All sources";
            }

            if (key === "automation:nSelectedSources") {
                return `${options?.count} selected sources`;
            }

            if (key === "automation:manual") {
                return "Manual";
            }

            if (key === "automation:manualOnly") {
                return "Manual only";
            }

            if (key === "automation:everyNMinutes") {
                return `Every ${options?.count} minutes`;
            }

            if (key === "automation:noRecentActivity") {
                return "No recent activity";
            }

            if (key === "automation:generated") {
                return `Generated ${options?.date}`;
            }

            if (key === "automation:checked") {
                return `Checked ${options?.date}`;
            }

            if (key === "automation:nArticles") {
                return `${options?.count} articles`;
            }

            return key;
        },
    },
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({
        toast: toastMock,
    }),
}));

vi.mock("@/lib/automation-events", () => ({
    addAutomationSyncListener: vi.fn(() => () => {}),
}));

vi.mock("@/lib/automation-service", () => ({
    listAutomationProjects: listAutomationProjectsMock,
    listAutomationReports: listAutomationReportsMock,
    listAutomationReportSourceArticles: listAutomationReportSourceArticlesMock,
    listAutomationSources: listAutomationSourcesMock,
    listProjectCandidateArticlePage: listProjectCandidateArticlePageMock,
    markAutomationReportAsRead: markAutomationReportAsReadMock,
    setAutomationReportFavorite: setAutomationReportFavoriteMock,
    deleteAutomationProject: vi.fn(),
    generateAutomationReportForProject: vi.fn(),
    markAllAutomationReportsAsRead: vi.fn(),
    saveAutomationProject: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
    optimizeAutomationProjectPrompt: vi.fn(),
}));

vi.mock("@/lib/chat-prompts", () => ({
    buildAutomationReportDiscussionSystemPrompt: vi.fn(() => "prompt"),
}));

vi.mock("@/components/layout/MainLayout", () => ({
    useMainLayoutScrollContainer: mockUseMainLayoutScrollContainer,
}));

vi.mock("@/hooks/use-scoped-scroll-memory", () => ({
    useScopedScrollMemory: useScopedScrollMemoryMock,
}));

vi.mock("@/hooks/use-streaming-conversation", () => ({
    useStreamingConversation: () => ({
        messages: [],
        isStreaming: false,
        streamPhase: "idle",
        send: vi.fn(),
        replaceMessages: replaceMessagesMock,
    }),
}));

vi.mock("@/lib/web-search-service", () => ({
    hasConfiguredWebSearch: vi.fn(() => true),
}));

vi.mock("@/components/chat/ChatMarkdown", () => ({
    ChatMarkdown: ({ content }: { content: string }) => <div data-testid="card-markdown">{content}</div>,
}));

vi.mock("@/components/automation/AutomationReportDiscussionPanel", () => ({
    AutomationReportDiscussionRail: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AutomationReportDiscussionPanel: () => <div data-testid="discussion-panel">Discussion</div>,
}));

function createMatchMediaResult(matches: boolean) {
    return {
        matches,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    };
}

describe("Automation", () => {
    let container: HTMLDivElement;
    let root: Root;
    let mainScrollContainer: HTMLElement;
    let originalMatchMedia: typeof window.matchMedia | undefined;
    let originalPointerEvent: typeof PointerEvent | undefined;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        listAutomationProjectsMock.mockReset();
        listAutomationReportsMock.mockReset();
        listAutomationReportSourceArticlesMock.mockReset();
        listAutomationSourcesMock.mockReset();
        listProjectCandidateArticlePageMock.mockReset();
        markAutomationReportAsReadMock.mockReset();
        setAutomationReportFavoriteMock.mockReset();
        mockUseMainLayoutScrollContainer.mockReset();
        toastMock.mockReset();
        useScopedScrollMemoryMock.mockReset();
        replaceMessagesMock.mockReset();
        localStorage.clear();

        listAutomationProjectsMock.mockResolvedValue([
            {
                id: 1,
                name: "Project Alpha",
                prompt: "Project prompt",
                cycle_mode: "manual",
                auto_enabled: false,
                auto_interval_minutes: 60,
                max_articles_per_report: 12,
                min_articles_per_report: 1,
                web_search_enabled: true,
                last_auto_attempted_at: null,
                last_auto_consumed_at: null,
                last_auto_generated_at: "2026-03-30T00:00:00Z",
                source_ids: [],
                unread_report_count: 1,
            },
        ]);
        listAutomationSourcesMock.mockResolvedValue([
            { id: 1, name: "Example Source", active: true, article_count: 12 },
        ]);
        listProjectCandidateArticlePageMock.mockResolvedValue({
            items: manualCandidateArticles,
            totalCount: manualCandidateArticles.length,
        });
        listAutomationReportSourceArticlesMock.mockResolvedValue([]);
        listAutomationReportsMock.mockResolvedValue({
            reports: [
                {
                    id: 10,
                    project_id: 1,
                    title: "Report Alpha",
                    full_report: "Full report body",
                    generation_mode: "manual",
                    used_article_count: 3,
                    is_read: false,
                    is_favorite: false,
                    created_at: "2026-03-30T00:00:00Z",
                },
            ],
            totalCount: 1,
        });
        markAutomationReportAsReadMock.mockResolvedValue(undefined);
        setAutomationReportFavoriteMock.mockResolvedValue(undefined);
        useScopedScrollMemoryMock.mockReturnValue({
            saveCurrentScopeScroll: vi.fn(),
        });

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

        originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockImplementation((query: string) => createMatchMediaResult(query === "(min-width: 1024px)"));
        originalPointerEvent = globalThis.PointerEvent;
        globalThis.PointerEvent = MouseEvent as typeof PointerEvent;

        mainScrollContainer = document.createElement("main");
        document.body.appendChild(mainScrollContainer);
        mockUseMainLayoutScrollContainer.mockReturnValue({ current: mainScrollContainer });

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });

        container.remove();
        mainScrollContainer.remove();
        window.matchMedia = originalMatchMedia as typeof window.matchMedia;
        globalThis.PointerEvent = originalPointerEvent as typeof PointerEvent;
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    function renderAutomation() {
        act(() => {
            root.render(<Automation />);
        });
    }

    async function flushAsyncWork() {
        await act(async () => {
            await Promise.resolve();
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 0);
            });
        });
    }

    async function settleAutomation() {
        await flushAsyncWork();
        await flushAsyncWork();
    }

    function queryBackToTopButton(): HTMLButtonElement | null {
        const button = container.querySelector('button[aria-label="Back to top"]');
        return button instanceof HTMLButtonElement ? button : null;
    }

    function getBackToTopButton(): HTMLButtonElement {
        const button = queryBackToTopButton();
        if (!button) {
            throw new Error("Back-to-top button not found.");
        }

        return button;
    }

    function getButtonByRoleText(text: string): HTMLElement {
        const element = Array.from(container.querySelectorAll('[role="button"]')).find((candidate) => (
            candidate.textContent?.includes(text)
        ));

        if (!(element instanceof HTMLElement)) {
            throw new Error(`Role button "${text}" not found.`);
        }

        return element;
    }

    function getButtonByAriaLabel(label: string): HTMLButtonElement {
        const button = container.querySelector(`button[aria-label="${label}"]`);
        if (!(button instanceof HTMLButtonElement)) {
            throw new Error(`Button "${label}" not found.`);
        }

        return button;
    }

    function getCardBodyScrollContainer(): HTMLDivElement {
        const markdown = container.querySelector('[data-testid="card-markdown"]');
        if (!(markdown instanceof HTMLDivElement)) {
            throw new Error("Card markdown not found.");
        }

        const contentWrapper = markdown.parentElement;
        if (!(contentWrapper instanceof HTMLDivElement) || !(contentWrapper.parentElement instanceof HTMLDivElement)) {
            throw new Error("Card body scroll container not found.");
        }

        return contentWrapper.parentElement;
    }

    function getBodyButtonByText(text: string): HTMLButtonElement {
        const button = Array.from(document.body.querySelectorAll("button")).find((candidate) => (
            candidate.textContent?.includes(text)
        ));

        if (!(button instanceof HTMLButtonElement)) {
            throw new Error(`Button "${text}" not found in document body.`);
        }

        return button;
    }

    function getLastBodyButtonByText(text: string): HTMLButtonElement {
        const button = Array.from(document.body.querySelectorAll("button"))
            .reverse()
            .find((candidate) => candidate.textContent?.includes(text));

        if (!(button instanceof HTMLButtonElement)) {
            throw new Error(`Button "${text}" not found in document body.`);
        }

        return button;
    }

    function getManualCandidateList(): HTMLDivElement {
        const list = document.body.querySelector('[data-testid="manual-report-candidate-list"]');
        if (!(list instanceof HTMLDivElement)) {
            throw new Error("Manual candidate list not found.");
        }

        return list;
    }

    function getManualSearchInput(): HTMLInputElement {
        const input = Array.from(document.body.querySelectorAll("input")).find((candidate) => (
            candidate instanceof HTMLInputElement && candidate.placeholder === "Search by title or summary..."
        ));

        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Manual search input not found.");
        }

        return input;
    }

    function getManualSourceSelect(): HTMLSelectElement {
        const select = document.body.querySelector('[data-testid="manual-report-source-select"]');
        if (!(select instanceof HTMLSelectElement)) {
            throw new Error("Manual source select not found.");
        }

        return select;
    }

    function getLabeledCheckbox(labelText: string): HTMLInputElement {
        const label = Array.from(document.body.querySelectorAll("label")).find((candidate) => (
            candidate.textContent?.includes(labelText)
        ));

        if (!(label instanceof HTMLLabelElement)) {
            throw new Error(`Checkbox label "${labelText}" not found.`);
        }

        const checkbox = label.querySelector('input[type="checkbox"]');
        if (!(checkbox instanceof HTMLInputElement)) {
            throw new Error(`Checkbox "${labelText}" not found.`);
        }

        return checkbox;
    }

    async function openManualGenerateDialog() {
        renderAutomation();
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleAutomation();

        act(() => {
            getBodyButtonByText("Generate report").click();
        });
        await settleAutomation();
    }

    function updateInputValue(input: HTMLInputElement, value: string) {
        act(() => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            valueSetter?.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    function updateSelectValue(select: HTMLSelectElement, value: string) {
        act(() => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
            valueSetter?.call(select, value);
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }

    function setupPaginatedManualCandidates(totalCount: number) {
        const items = Array.from({ length: totalCount }, (_, index) => createManualCandidateArticle(index + 1));

        listProjectCandidateArticlePageMock.mockImplementation((_projectId: number, options?: { offset?: number; limit?: number; search?: string; sourceId?: number | null; includeConsumed?: boolean }) => {
            const offset = options?.offset ?? 0;
            const limit = options?.limit ?? 12;
            const pagedItems = items.slice(offset, offset + limit);

            return Promise.resolve({
                items: pagedItems,
                totalCount: items.length,
            });
        });

        return items;
    }

    it("does not render the back-to-top button on the project board", async () => {
        renderAutomation();
        await settleAutomation();

        mainScrollContainer.scrollTop = 360;
        act(() => {
            mainScrollContainer.dispatchEvent(new Event("scroll"));
        });

        expect(queryBackToTopButton()).toBeNull();
    });

    it("shows the back-to-top button on the project detail page and scrolls the main container to top", async () => {
        renderAutomation();
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleAutomation();

        expect(queryBackToTopButton()).toBeNull();

        mainScrollContainer.scrollTop = 340;
        act(() => {
            mainScrollContainer.dispatchEvent(new Event("scroll"));
        });

        expect(getBackToTopButton()).toBeInstanceOf(HTMLButtonElement);

        act(() => {
            getBackToTopButton().click();
        });

        expect(mainScrollContainer.scrollTop).toBe(0);
        expect(queryBackToTopButton()).toBeNull();
    });

    it("shows the back-to-top button on the card detail page and resets the tracked containers", async () => {
        renderAutomation();
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Report Alpha").click();
        });
        await settleAutomation();

        expect(queryBackToTopButton()).toBeNull();

        const cardBodyScrollContainer = getCardBodyScrollContainer();
        mainScrollContainer.scrollTop = 380;
        act(() => {
            mainScrollContainer.dispatchEvent(new Event("scroll"));
        });

        cardBodyScrollContainer.scrollTop = 330;
        act(() => {
            cardBodyScrollContainer.dispatchEvent(new Event("scroll"));
        });

        expect(getBackToTopButton()).toBeInstanceOf(HTMLButtonElement);

        act(() => {
            getBackToTopButton().click();
        });

        expect(mainScrollContainer.scrollTop).toBe(0);
        expect(cardBodyScrollContainer.scrollTop).toBe(0);
        expect(queryBackToTopButton()).toBeNull();
    });

    it("prefills new project article counts with 10 and 200", async () => {
        renderAutomation();
        await settleAutomation();

        act(() => {
            const newProjectButton = Array.from(document.body.querySelectorAll("button")).find((candidate) => (
                candidate.textContent?.includes("New project")
            ));
            if (!(newProjectButton instanceof HTMLButtonElement)) {
                throw new Error("New project button not found.");
            }

            newProjectButton.click();
        });
        await settleAutomation();

        const numericValues = Array.from(document.body.querySelectorAll('input[type="number"]'))
            .map((input) => input instanceof HTMLInputElement ? input.value : null);

        expect(numericValues).toEqual(["60", "10", "200"]);
    });

    it("switches to favorites with a first-page reload and favorites-only empty state", async () => {
        listAutomationReportsMock.mockImplementation((_projectId: number, options?: { offset?: number; favoritesOnly?: boolean }) => {
            if (options?.favoritesOnly) {
                return Promise.resolve({ reports: [], totalCount: 0 });
            }

            return Promise.resolve({
                reports: [{
                    id: 10,
                    project_id: 1,
                    title: "Report Alpha",
                    full_report: "Full report body",
                    generation_mode: "manual",
                    used_article_count: 3,
                    is_read: false,
                    is_favorite: false,
                    created_at: "2026-03-30T00:00:00Z",
                }],
                totalCount: options?.offset === 20 ? 25 : 25,
            });
        });

        renderAutomation();
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleAutomation();

        act(() => {
            const pageTwoButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "2");
            if (!(pageTwoButton instanceof HTMLButtonElement)) {
                throw new Error("Page 2 button not found.");
            }

            pageTwoButton.click();
        });
        await settleAutomation();

        act(() => {
            const favoritesButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "Favorites");
            if (!(favoritesButton instanceof HTMLButtonElement)) {
                throw new Error("Favorites button not found.");
            }

            favoritesButton.click();
        });
        await settleAutomation();

        expect(listAutomationReportsMock).toHaveBeenLastCalledWith(1, expect.objectContaining({
            offset: 0,
            favoritesOnly: true,
        }));
        expect(container.textContent).toContain("No favorited reports yet");
    });

    it("favorites a card from the grid without opening card detail", async () => {
        renderAutomation();
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleAutomation();

        act(() => {
            getButtonByAriaLabel("Add to favorites").click();
        });
        await settleAutomation();

        expect(setAutomationReportFavoriteMock).toHaveBeenCalledWith(10, true);
        expect(container.querySelector('[data-testid="card-markdown"]')).toBeNull();
        expect(getButtonByAriaLabel("Remove from favorites")).toBeInstanceOf(HTMLButtonElement);
    });

    it("favorites a card from the list view without opening card detail", async () => {
        renderAutomation();
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleAutomation();

        act(() => {
            getButtonByAriaLabel("List view").click();
        });
        await settleAutomation();

        act(() => {
            getButtonByAriaLabel("Add to favorites").click();
        });
        await settleAutomation();

        expect(setAutomationReportFavoriteMock).toHaveBeenCalledWith(10, true);
        expect(container.querySelector('[data-testid="card-markdown"]')).toBeNull();
    });

    it("keeps the manual candidate list at the top when the dialog opens", async () => {
        await openManualGenerateDialog();

        expect(getManualCandidateList().scrollTop).toBe(0);
    });

    it("renders paginated manual candidates and loads the next page on demand", async () => {
        setupPaginatedManualCandidates(15);
        await openManualGenerateDialog();

        expect(document.body.textContent).toContain("Page 1 / 2");
        expect(document.body.textContent).toContain("Candidate Article 1");
        expect(document.body.textContent).not.toContain("Candidate Article 13");
        expect(listProjectCandidateArticlePageMock).toHaveBeenLastCalledWith(1, expect.objectContaining({
            offset: 0,
            limit: 12,
        }));

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await settleAutomation();

        expect(document.body.textContent).toContain("Page 2 / 2");
        expect(document.body.textContent).toContain("Candidate Article 13");
        expect(document.body.textContent).not.toContain("Candidate Article 12");
        expect(listProjectCandidateArticlePageMock).toHaveBeenLastCalledWith(1, expect.objectContaining({
            offset: 12,
            limit: 12,
        }));
    });

    it("resets the manual candidate list scroll when the candidate page changes", async () => {
        setupPaginatedManualCandidates(15);
        await openManualGenerateDialog();

        const candidateList = getManualCandidateList();
        candidateList.scrollTop = 240;

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await settleAutomation();

        expect(getManualCandidateList().scrollTop).toBe(0);
    });

    it("resets the manual candidate page and scroll when the search filter changes", async () => {
        setupPaginatedManualCandidates(15);
        await openManualGenerateDialog();

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await settleAutomation();

        const candidateList = getManualCandidateList();
        candidateList.scrollTop = 240;

        updateInputValue(getManualSearchInput(), "Candidate");
        await settleAutomation();

        expect(document.body.textContent).toContain("Page 1 / 2");
        expect(getManualCandidateList().scrollTop).toBe(0);
        expect(listProjectCandidateArticlePageMock).toHaveBeenLastCalledWith(1, expect.objectContaining({
            offset: 0,
            limit: 12,
            search: "Candidate",
        }));
    });

    it("resets the manual candidate page and scroll when the source filter changes", async () => {
        setupPaginatedManualCandidates(15);
        await openManualGenerateDialog();

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await settleAutomation();

        const candidateList = getManualCandidateList();
        candidateList.scrollTop = 240;

        updateSelectValue(getManualSourceSelect(), "1");
        await settleAutomation();

        expect(document.body.textContent).toContain("Page 1 / 2");
        expect(getManualCandidateList().scrollTop).toBe(0);
        expect(listProjectCandidateArticlePageMock).toHaveBeenLastCalledWith(1, expect.objectContaining({
            offset: 0,
            limit: 12,
            sourceId: 1,
        }));
    });

    it("resets the manual candidate page and scroll when including previously used articles", async () => {
        setupPaginatedManualCandidates(15);
        await openManualGenerateDialog();

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await settleAutomation();

        const candidateList = getManualCandidateList();
        candidateList.scrollTop = 240;

        act(() => {
            getLabeledCheckbox("Include previously used articles for this project").click();
        });
        await settleAutomation();

        expect(document.body.textContent).toContain("Page 1 / 2");
        expect(getManualCandidateList().scrollTop).toBe(0);
        expect(listProjectCandidateArticlePageMock).toHaveBeenLastCalledWith(1, expect.objectContaining({
            offset: 0,
            limit: 12,
            includeConsumed: true,
        }));
    });

    it("does not reset the manual candidate list scroll when selecting an article", async () => {
        await openManualGenerateDialog();

        const candidateList = getManualCandidateList();
        candidateList.scrollTop = 240;

        act(() => {
            getBodyButtonByText("Candidate Article 1").click();
        });
        await settleAutomation();

        expect(getManualCandidateList().scrollTop).toBe(240);
    });

    it("selects and deselects the current page without affecting selections on other pages", async () => {
        setupPaginatedManualCandidates(15);
        await openManualGenerateDialog();

        act(() => {
            getBodyButtonByText("Candidate Article 1").click();
        });
        await settleAutomation();

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await settleAutomation();

        act(() => {
            getLabeledCheckbox("Select page").click();
        });
        await settleAutomation();

        expect(document.body.textContent).toContain("4 selected / 12 max");
        expect(getLabeledCheckbox("Select page").checked).toBe(true);

        act(() => {
            getLabeledCheckbox("Select page").click();
        });
        await settleAutomation();

        expect(document.body.textContent).toContain("1 selected / 12 max");
        expect(getLabeledCheckbox("Select page").checked).toBe(false);
    });

    it("shows the selection cap toast instead of partially selecting a page", async () => {
        setupPaginatedManualCandidates(15);
        await openManualGenerateDialog();

        act(() => {
            getLabeledCheckbox("Select page").click();
        });
        await settleAutomation();

        expect(document.body.textContent).toContain("12 selected / 12 max");

        toastMock.mockClear();

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await settleAutomation();

        act(() => {
            getLabeledCheckbox("Select page").click();
        });
        await settleAutomation();

        expect(document.body.textContent).toContain("12 selected / 12 max");
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
            title: "Select up to 12",
            variant: "destructive",
        }));
    });

    it("keeps the current candidate list visible while the next page is loading", async () => {
        const pageTwoPromise = new Promise<{ items: ReturnType<typeof createManualCandidateArticle>[]; totalCount: number }>(() => {});

        listProjectCandidateArticlePageMock.mockImplementation((_projectId: number, options?: { offset?: number; limit?: number }) => {
            if ((options?.offset ?? 0) === 0) {
                return Promise.resolve({
                    items: Array.from({ length: 12 }, (_, index) => createManualCandidateArticle(index + 1)),
                    totalCount: 15,
                });
            }

            return pageTwoPromise;
        });

        await openManualGenerateDialog();

        act(() => {
            getLastBodyButtonByText("Next").click();
        });
        await flushAsyncWork();
        expect(listProjectCandidateArticlePageMock).toHaveBeenCalledTimes(2);

        expect(document.body.textContent).toContain("Candidate Article 1");
        expect(document.body.textContent).not.toContain("Loading candidate articles...");
    });

    it("renders sanitized plain-text candidate previews instead of raw html markup", async () => {
        listProjectCandidateArticlePageMock.mockResolvedValueOnce({
            items: [{
                ...manualCandidateArticles[0],
                summary: '<p>Article URL: <a href="https://example.com/story">https://example.com/story</a></p><p>Points: 42</p>',
            }],
            totalCount: 1,
        });

        await openManualGenerateDialog();

        expect(document.body.textContent).toContain("Article URL:");
        expect(document.body.textContent).not.toContain("<p>");
        expect(document.body.textContent).not.toContain("<a href=");
    });

    it("keeps card detail open when removing a favorite under the favorites filter", async () => {
        let favoritesOnlyHasCard = true;

        listAutomationReportsMock.mockImplementation((_projectId: number, options?: { favoritesOnly?: boolean }) => {
            const favoritedCard = {
                id: 10,
                project_id: 1,
                title: "Report Alpha",
                full_report: "Full report body",
                generation_mode: "manual",
                used_article_count: 3,
                is_read: false,
                is_favorite: true,
                created_at: "2026-03-30T00:00:00Z",
            };

            if (options?.favoritesOnly) {
                return Promise.resolve(
                    favoritesOnlyHasCard
                        ? { reports: [favoritedCard], totalCount: 1 }
                        : { reports: [], totalCount: 0 },
                );
            }

            return Promise.resolve({ reports: [favoritedCard], totalCount: 1 });
        });

        setAutomationReportFavoriteMock.mockImplementation(async () => {
            favoritesOnlyHasCard = false;
        });

        renderAutomation();
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleAutomation();

        act(() => {
            const favoritesButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "Favorites");
            if (!(favoritesButton instanceof HTMLButtonElement)) {
                throw new Error("Favorites button not found.");
            }

            favoritesButton.click();
        });
        await settleAutomation();

        act(() => {
            getButtonByRoleText("Report Alpha").click();
        });
        await settleAutomation();

        act(() => {
            getButtonByAriaLabel("Remove from favorites").click();
        });
        await settleAutomation();

        expect(container.querySelector('[data-testid="card-markdown"]')).not.toBeNull();

        act(() => {
            const backButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Back"));
            if (!(backButton instanceof HTMLButtonElement)) {
                throw new Error("Back button not found.");
            }

            backButton.click();
        });
        await settleAutomation();

        expect(container.textContent).toContain("No favorited reports yet");
    });
});
