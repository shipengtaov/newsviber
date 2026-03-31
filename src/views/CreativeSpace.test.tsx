// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreativeSpace from "@/views/CreativeSpace";

const {
    listCreativeProjectsMock,
    listCreativeCardsMock,
    listCreativeSourcesMock,
    markCreativeCardAsReadMock,
    setCreativeCardFavoriteMock,
    mockUseMainLayoutScrollContainer,
    useScopedScrollMemoryMock,
    replaceMessagesMock,
} = vi.hoisted(() => ({
    listCreativeProjectsMock: vi.fn(),
    listCreativeCardsMock: vi.fn(),
    listCreativeSourcesMock: vi.fn(),
    markCreativeCardAsReadMock: vi.fn(),
    setCreativeCardFavoriteMock: vi.fn(),
    mockUseMainLayoutScrollContainer: vi.fn(),
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

const creativeTranslations: Record<string, string> = {
    eyebrow: "Creative",
    projectBoard: "Project board",
    boardDescription: "Board description",
    projects: "Projects",
    unreadCards: "Unread cards",
    autoEnabled: "Auto enabled",
    nTotal: "{{count}} total",
    nActive: "{{count}} active",
    newProject: "New project",
    pageXOfY: "Page {{page}} / {{total}}",
    scopeLabel: "Scope",
    unreadLabel: "Unread",
    projectDescription: "Project description",
    generateCard: "Generate card",
    generating: "Generating",
    allCards: "All",
    favoriteCards: "Favorites",
    addToFavorites: "Add to favorites",
    removeFromFavorites: "Remove from favorites",
    markAllAsRead: "Mark all as read",
    openProjectActions: "Open project actions",
    editProject: "Edit project",
    deleteProject: "Delete project",
    auto: "Auto",
    manual: "Manual",
    run: "run",
    viewCard: "Card view",
    viewList: "List view",
    noCreativeCardsYet: "No cards yet",
    noFavoriteCardsYet: "No favorited cards yet",
    favoriteFirstCard: "Favorite a card to keep it pinned here",
    generateFirstCard: "Generate the first card",
    focusPrompt: "Focus prompt",
    automation: "Automation",
    enabled: "Enabled",
    manualOnly: "Manual only",
    checkInterval: "Check interval",
    notScheduled: "Not scheduled",
    webSearch: "Web search",
    lastChecked: "Last checked",
    lastGenerated: "Last generated",
    cards: "Cards",
    nCards: "{{count}} cards",
    updatedLabel: "Updated",
    cardsLabel: "Cards",
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
    discussCard: "Discuss card",
    noCreativeProjectsYet: "No creative projects yet",
    failedToUpdateFavorite: "Failed to update favorite",
    articlesUnit: "articles",
};

function translate(template: string, options?: Record<string, unknown>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(options?.[key] ?? ""));
}

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const namespace = String(options?.ns ?? ns ?? "common");
            const dictionary = namespace === "common" ? commonTranslations : creativeTranslations;
            return translate(dictionary[key] ?? `${namespace}:${key}`, options);
        },
    }),
}));

vi.mock("@/lib/i18n", () => ({
    default: {
        t: (key: string, options?: Record<string, unknown>) => {
            if (key === "creative:allSources") {
                return "All sources";
            }

            if (key === "creative:nSelectedSources") {
                return `${options?.count} selected sources`;
            }

            if (key === "creative:manual") {
                return "Manual";
            }

            if (key === "creative:manualOnly") {
                return "Manual only";
            }

            if (key === "creative:everyNMinutes") {
                return `Every ${options?.count} minutes`;
            }

            if (key === "creative:noRecentActivity") {
                return "No recent activity";
            }

            if (key === "creative:generated") {
                return `Generated ${options?.date}`;
            }

            if (key === "creative:checked") {
                return `Checked ${options?.date}`;
            }

            if (key === "creative:nArticles") {
                return `${options?.count} articles`;
            }

            return key;
        },
    },
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({
        toast: vi.fn(),
    }),
}));

vi.mock("@/lib/creative-events", () => ({
    addCreativeSyncListener: vi.fn(() => () => {}),
}));

vi.mock("@/lib/creative-service", () => ({
    listCreativeProjects: listCreativeProjectsMock,
    listCreativeCards: listCreativeCardsMock,
    listCreativeSources: listCreativeSourcesMock,
    markCreativeCardAsRead: markCreativeCardAsReadMock,
    setCreativeCardFavorite: setCreativeCardFavoriteMock,
    deleteCreativeProject: vi.fn(),
    generateCreativeCardForProject: vi.fn(),
    listProjectCandidateArticles: vi.fn().mockResolvedValue([]),
    markAllCreativeCardsAsRead: vi.fn(),
    saveCreativeProject: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
    optimizeCreativeProjectPrompt: vi.fn(),
}));

vi.mock("@/lib/chat-prompts", () => ({
    buildCreativeCardDiscussionSystemPrompt: vi.fn(() => "prompt"),
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

vi.mock("react-markdown", () => ({
    default: ({ children }: { children: string }) => <div data-testid="card-markdown">{children}</div>,
}));

vi.mock("@/components/creative/CreativeCardDiscussionPanel", () => ({
    CreativeCardDiscussionRail: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    CreativeCardDiscussionPanel: () => <div data-testid="discussion-panel">Discussion</div>,
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

describe("CreativeSpace", () => {
    let container: HTMLDivElement;
    let root: Root;
    let mainScrollContainer: HTMLElement;
    let originalMatchMedia: typeof window.matchMedia | undefined;
    let originalPointerEvent: typeof PointerEvent | undefined;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        listCreativeProjectsMock.mockReset();
        listCreativeCardsMock.mockReset();
        listCreativeSourcesMock.mockReset();
        markCreativeCardAsReadMock.mockReset();
        setCreativeCardFavoriteMock.mockReset();
        mockUseMainLayoutScrollContainer.mockReset();
        useScopedScrollMemoryMock.mockReset();
        replaceMessagesMock.mockReset();
        localStorage.clear();

        listCreativeProjectsMock.mockResolvedValue([
            {
                id: 1,
                name: "Project Alpha",
                prompt: "Project prompt",
                cycle_mode: "manual",
                auto_enabled: false,
                auto_interval_minutes: 60,
                max_articles_per_card: 12,
                min_articles_per_card: 1,
                web_search_enabled: true,
                last_auto_checked_at: null,
                last_auto_generated_at: "2026-03-30T00:00:00Z",
                source_ids: [],
                unread_card_count: 1,
            },
        ]);
        listCreativeSourcesMock.mockResolvedValue([
            { id: 1, name: "Example Source", active: true, article_count: 12 },
        ]);
        listCreativeCardsMock.mockResolvedValue({
            cards: [
                {
                    id: 10,
                    project_id: 1,
                    title: "Card Alpha",
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
        markCreativeCardAsReadMock.mockResolvedValue(undefined);
        setCreativeCardFavoriteMock.mockResolvedValue(undefined);
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

    function renderCreativeSpace() {
        act(() => {
            root.render(<CreativeSpace />);
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

    async function settleCreativeSpace() {
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

        const prose = markdown.parentElement;
        if (!(prose instanceof HTMLDivElement) || !(prose.parentElement instanceof HTMLDivElement) || !(prose.parentElement.parentElement instanceof HTMLDivElement)) {
            throw new Error("Card body scroll container not found.");
        }

        return prose.parentElement.parentElement;
    }

    it("does not render the back-to-top button on the project board", async () => {
        renderCreativeSpace();
        await settleCreativeSpace();

        mainScrollContainer.scrollTop = 360;
        act(() => {
            mainScrollContainer.dispatchEvent(new Event("scroll"));
        });

        expect(queryBackToTopButton()).toBeNull();
    });

    it("shows the back-to-top button on the project detail page and scrolls the main container to top", async () => {
        renderCreativeSpace();
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleCreativeSpace();

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
        renderCreativeSpace();
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Card Alpha").click();
        });
        await settleCreativeSpace();

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

    it("switches to favorites with a first-page reload and favorites-only empty state", async () => {
        listCreativeCardsMock.mockImplementation((_projectId: number, options?: { offset?: number; favoritesOnly?: boolean }) => {
            if (options?.favoritesOnly) {
                return Promise.resolve({ cards: [], totalCount: 0 });
            }

            return Promise.resolve({
                cards: [{
                    id: 10,
                    project_id: 1,
                    title: "Card Alpha",
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

        renderCreativeSpace();
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleCreativeSpace();

        act(() => {
            const pageTwoButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "2");
            if (!(pageTwoButton instanceof HTMLButtonElement)) {
                throw new Error("Page 2 button not found.");
            }

            pageTwoButton.click();
        });
        await settleCreativeSpace();

        act(() => {
            const favoritesButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "Favorites");
            if (!(favoritesButton instanceof HTMLButtonElement)) {
                throw new Error("Favorites button not found.");
            }

            favoritesButton.click();
        });
        await settleCreativeSpace();

        expect(listCreativeCardsMock).toHaveBeenLastCalledWith(1, expect.objectContaining({
            offset: 0,
            favoritesOnly: true,
        }));
        expect(container.textContent).toContain("No favorited cards yet");
    });

    it("favorites a card from the grid without opening card detail", async () => {
        renderCreativeSpace();
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleCreativeSpace();

        act(() => {
            getButtonByAriaLabel("Add to favorites").click();
        });
        await settleCreativeSpace();

        expect(setCreativeCardFavoriteMock).toHaveBeenCalledWith(10, true);
        expect(container.querySelector('[data-testid="card-markdown"]')).toBeNull();
        expect(getButtonByAriaLabel("Remove from favorites")).toBeInstanceOf(HTMLButtonElement);
    });

    it("favorites a card from the list view without opening card detail", async () => {
        renderCreativeSpace();
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleCreativeSpace();

        act(() => {
            getButtonByAriaLabel("List view").click();
        });
        await settleCreativeSpace();

        act(() => {
            getButtonByAriaLabel("Add to favorites").click();
        });
        await settleCreativeSpace();

        expect(setCreativeCardFavoriteMock).toHaveBeenCalledWith(10, true);
        expect(container.querySelector('[data-testid="card-markdown"]')).toBeNull();
    });

    it("keeps card detail open when removing a favorite under the favorites filter", async () => {
        let favoritesOnlyHasCard = true;

        listCreativeCardsMock.mockImplementation((_projectId: number, options?: { favoritesOnly?: boolean }) => {
            const favoritedCard = {
                id: 10,
                project_id: 1,
                title: "Card Alpha",
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
                        ? { cards: [favoritedCard], totalCount: 1 }
                        : { cards: [], totalCount: 0 },
                );
            }

            return Promise.resolve({ cards: [favoritedCard], totalCount: 1 });
        });

        setCreativeCardFavoriteMock.mockImplementation(async () => {
            favoritesOnlyHasCard = false;
        });

        renderCreativeSpace();
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Project Alpha").click();
        });
        await settleCreativeSpace();

        act(() => {
            const favoritesButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "Favorites");
            if (!(favoritesButton instanceof HTMLButtonElement)) {
                throw new Error("Favorites button not found.");
            }

            favoritesButton.click();
        });
        await settleCreativeSpace();

        act(() => {
            getButtonByRoleText("Card Alpha").click();
        });
        await settleCreativeSpace();

        act(() => {
            getButtonByAriaLabel("Remove from favorites").click();
        });
        await settleCreativeSpace();

        expect(container.querySelector('[data-testid="card-markdown"]')).not.toBeNull();

        act(() => {
            const backButton = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Back"));
            if (!(backButton instanceof HTMLButtonElement)) {
                throw new Error("Back button not found.");
            }

            backButton.click();
        });
        await settleCreativeSpace();

        expect(container.textContent).toContain("No favorited cards yet");
    });
});
