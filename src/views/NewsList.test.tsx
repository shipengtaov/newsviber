// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewsList from "@/views/NewsList";

const NEWS_LIST_SCROLL_STORAGE_KEY = "newsListScrollPositions_v1";
const {
    mockGetDb,
    mockListNewsSources,
    mockMarkScopedNewsArticlesAsRead,
    mockToast,
    mockUseMainLayoutScrollContainer,
} = vi.hoisted(() => ({
    mockGetDb: vi.fn(),
    mockListNewsSources: vi.fn(),
    mockMarkScopedNewsArticlesAsRead: vi.fn(),
    mockToast: vi.fn(),
    mockUseMainLayoutScrollContainer: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const namespace = options?.ns ?? ns;

            if (key === "pageXOfY") {
                return `Page ${options?.current} / ${options?.total}`;
            }

            if (key === "nResults") {
                return `${options?.count} results`;
            }

            if (key === "nActiveSources") {
                return `${options?.count} active sources`;
            }

            if (key === "unreadCount") {
                return `${options?.count} unread`;
            }

            if (key === "published") {
                return `Published ${options?.date}`;
            }

            if (key === "saved") {
                return `Saved ${options?.date}`;
            }

            return namespace ? `${namespace}:${key}` : key;
        },
    }),
}));

vi.mock("@/lib/i18n", () => ({
    default: {
        t: (key: string, options?: Record<string, unknown>) => {
            if (key === "sources:lastFetch") {
                return `Last fetch ${options?.date}`;
            }

            if (key === "sources:everyNMin") {
                return `Every ${options?.count} min`;
            }

            if (key === "sources:everyNHr") {
                return `Every ${options?.count} hr`;
            }

            if (key === "sources:manualRefresh") {
                return "Manual refresh";
            }

            if (key === "sources:neverFetched") {
                return "Never fetched";
            }

            return key;
        },
    },
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({
        toast: mockToast,
    }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
    openUrl: vi.fn(),
}));

vi.mock("@/lib/source-fetch", () => ({
    fetchSource: vi.fn(),
    fetchSources: vi.fn(),
}));

vi.mock("@/lib/source-events", () => ({
    addSourceFetchSyncListener: vi.fn(() => () => {}),
    dispatchSourceFetchSyncEvent: vi.fn(),
}));

vi.mock("@/lib/news-events", () => ({
    dispatchNewsSyncEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    getDb: mockGetDb,
}));

vi.mock("@/lib/news-service", () => ({
    listNewsSources: mockListNewsSources,
    markScopedNewsArticlesAsRead: mockMarkScopedNewsArticlesAsRead,
}));

vi.mock("@/components/layout/WorkspaceHeader", () => ({
    WorkspaceHeader: ({ actions }: { actions?: ReactNode }) => (
        <div data-testid="workspace-header">{actions}</div>
    ),
    EmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock("@/components/layout/MainLayout", () => ({
    useMainLayoutScrollContainer: mockUseMainLayoutScrollContainer,
}));

type ArticleRow = {
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

function buildArticles(offset: number): ArticleRow[] {
    return Array.from({ length: 20 }, (_, index) => {
        const id = offset + index + 1;

        return {
            id,
            source_id: 1,
            source_name: "Example Source",
            guid: "",
            title: `Article ${id}`,
            summary: null,
            content: `Preview ${id}`,
            published_at: "2026-03-18T00:00:00Z",
            inserted_at: "2026-03-18T00:00:00Z",
            is_read: true,
        };
    });
}

function readStoredScrollMap(): Record<string, number> {
    const raw = sessionStorage.getItem(NEWS_LIST_SCROLL_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, number> : {};
}

describe("NewsList pagination scroll reset", () => {
    let container: HTMLDivElement;
    let mainScrollContainer: HTMLElement;
    let root: Root;
    let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
    let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
    let originalMatchMedia: typeof window.matchMedia | undefined;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        sessionStorage.clear();
        mockToast.mockReset();
        mockListNewsSources.mockReset();
        mockMarkScopedNewsArticlesAsRead.mockReset();
        mockGetDb.mockReset();
        mockUseMainLayoutScrollContainer.mockReset();

        mockListNewsSources.mockResolvedValue([{
            id: 1,
            name: "Example Source",
            source_type: "rss",
            url: "https://example.com/rss",
            active: true,
            fetch_interval: 60,
            last_fetch: null,
            article_count: 60,
            unread_count: 0,
        }]);

        mockGetDb.mockResolvedValue({
            select: vi.fn((query: string, params?: unknown[]) => {
                if (query.includes("COUNT(DISTINCT a.id)")) {
                    return Promise.resolve([{ total_count: 60 }]);
                }

                const offset = Number(params?.[params.length - 1] ?? 0);
                return Promise.resolve(buildArticles(offset));
            }),
        });

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        originalRequestAnimationFrame = window.requestAnimationFrame;
        originalCancelAnimationFrame = window.cancelAnimationFrame;
        originalMatchMedia = window.matchMedia;
        window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0);
        window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === "(min-width: 1024px)",
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

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
        document.body.innerHTML = "";
        sessionStorage.clear();
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        window.matchMedia = originalMatchMedia as typeof window.matchMedia;
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    function renderNewsList(initialEntry: string) {
        act(() => {
            root.render(
                <MemoryRouter initialEntries={[initialEntry]}>
                    <NewsList />
                </MemoryRouter>,
            );
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

    async function settleNewsList() {
        await flushAsyncWork();
        await flushAsyncWork();
    }

    function getArticlesScrollContainer(): HTMLDivElement {
        const articleLink = container.querySelector('a[href^="/news/"]');
        if (!(articleLink instanceof HTMLAnchorElement)) {
            throw new Error("Articles scroll container not found.");
        }

        const content = articleLink.parentElement;
        if (!(content instanceof HTMLDivElement) || !(content.parentElement instanceof HTMLDivElement)) {
            throw new Error("Articles scroll container not found.");
        }

        return content.parentElement;
    }

    function getButtonByText(text: string): HTMLButtonElement {
        const button = Array.from(container.querySelectorAll("button")).find((candidate) => (
            candidate.textContent?.trim() === text
        ));

        if (!(button instanceof HTMLButtonElement)) {
            throw new Error(`Button "${text}" not found.`);
        }

        return button;
    }

    function getSearchInput(): HTMLInputElement {
        const input = container.querySelector("input");
        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Search input not found.");
        }

        return input;
    }

    function getSearchForm(): HTMLFormElement {
        const form = container.querySelector("form");
        if (!(form instanceof HTMLFormElement)) {
            throw new Error("Search form not found.");
        }

        return form;
    }

    function getSourcesPanelElements() {
        const sourcesLabel = Array.from(container.querySelectorAll("p")).find((candidate) => (
            candidate.textContent?.trim() === "news:sources"
        ));

        if (!(sourcesLabel instanceof HTMLParagraphElement)) {
            throw new Error("Sources panel label not found.");
        }

        const headerRow = sourcesLabel.parentElement?.parentElement;
        if (!(headerRow instanceof HTMLDivElement)) {
            throw new Error("Sources panel header row not found.");
        }

        const panelCard = headerRow.parentElement;
        if (!(panelCard instanceof HTMLDivElement)) {
            throw new Error("Sources panel card not found.");
        }

        const stickyWrapper = panelCard.parentElement;
        if (!(stickyWrapper instanceof HTMLDivElement)) {
            throw new Error("Sources panel wrapper not found.");
        }

        const listContainer = headerRow.nextElementSibling;
        if (!(listContainer instanceof HTMLDivElement)) {
            throw new Error("Sources list container not found.");
        }

        return { stickyWrapper, panelCard, listContainer };
    }

    function setInputValue(input: HTMLInputElement, value: string) {
        const valueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set;

        if (!valueSetter) {
            throw new Error("Input value setter not found.");
        }

        valueSetter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    it("resets the target page scroll memory when clicking a page number", async () => {
        sessionStorage.setItem(NEWS_LIST_SCROLL_STORAGE_KEY, JSON.stringify({
            "/?page=1": 180,
            "/?page=2": 420,
        }));

        renderNewsList("/?page=1");
        await settleNewsList();

        const currentScrollContainer = getArticlesScrollContainer();
        expect(currentScrollContainer.scrollTop).toBe(180);
        mainScrollContainer.scrollTop = 260;

        currentScrollContainer.scrollTop = 240;
        act(() => {
            currentScrollContainer.dispatchEvent(new Event("scroll"));
        });

        expect(readStoredScrollMap()["/?page=1"]).toBe(240);

        act(() => {
            getButtonByText("3").click();
        });
        await settleNewsList();

        const storedScrollMap = readStoredScrollMap();
        expect(storedScrollMap["/?page=1"]).toBe(240);
        expect(storedScrollMap["/?page=2"]).toBe(0);
        expect(mainScrollContainer.scrollTop).toBe(0);
        expect(getArticlesScrollContainer().scrollTop).toBe(0);
    });

    it("uses a sticky desktop sources panel with an internal scroll region", async () => {
        renderNewsList("/");
        await settleNewsList();

        const { stickyWrapper, panelCard, listContainer } = getSourcesPanelElements();

        expect(stickyWrapper.className).toContain("lg:sticky");
        expect(stickyWrapper.className).toContain("lg:top-6");
        expect(stickyWrapper.className).toContain("lg:self-start");
        expect(stickyWrapper.className).not.toContain("lg:h-full");

        expect(panelCard.className).toContain("lg:max-h-[calc(100vh-8rem)]");
        expect(panelCard.className).not.toContain("h-full");

        expect(listContainer.className).toContain("lg:flex-1");
        expect(listContainer.className).toContain("lg:min-h-0");
        expect(listContainer.className).toContain("lg:overflow-y-auto");
    });

    it("reuses the same reset behavior for the next-page control", async () => {
        sessionStorage.setItem(NEWS_LIST_SCROLL_STORAGE_KEY, JSON.stringify({
            "/": 75,
            "/?page=1": 300,
        }));

        renderNewsList("/");
        await settleNewsList();

        const currentScrollContainer = getArticlesScrollContainer();
        expect(currentScrollContainer.scrollTop).toBe(75);
        mainScrollContainer.scrollTop = 195;

        currentScrollContainer.scrollTop = 150;
        act(() => {
            currentScrollContainer.dispatchEvent(new Event("scroll"));
        });

        expect(readStoredScrollMap()["/"]).toBe(150);

        act(() => {
            getButtonByText("common:next").click();
        });
        await settleNewsList();

        const storedScrollMap = readStoredScrollMap();
        expect(storedScrollMap["/"]).toBe(150);
        expect(storedScrollMap["/?page=1"]).toBe(0);
        expect(mainScrollContainer.scrollTop).toBe(0);
        expect(getArticlesScrollContainer().scrollTop).toBe(0);
    });

    it("does not force the outer and inner scroll positions to zero on search submit", async () => {
        sessionStorage.setItem(NEWS_LIST_SCROLL_STORAGE_KEY, JSON.stringify({
            "/": 70,
            "/?q=ai": 95,
        }));

        renderNewsList("/");
        await settleNewsList();

        const currentScrollContainer = getArticlesScrollContainer();
        expect(currentScrollContainer.scrollTop).toBe(70);
        mainScrollContainer.scrollTop = 210;

        act(() => {
            setInputValue(getSearchInput(), "ai");
        });
        await settleNewsList();

        act(() => {
            getSearchForm().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        await settleNewsList();

        expect(mainScrollContainer.scrollTop).toBe(210);
        expect(getArticlesScrollContainer().scrollTop).toBe(95);
        expect(readStoredScrollMap()["/?q=ai"]).toBe(95);
    });
});
