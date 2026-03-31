// @vitest-environment jsdom

import { act, type MouseEventHandler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewsDetail from "@/views/NewsDetail";

const {
    mockGetDb,
    mockMarkNewsArticleAsRead,
    mockUseMainLayoutScrollContainer,
} = vi.hoisted(() => ({
    mockGetDb: vi.fn(),
    mockMarkNewsArticleAsRead: vi.fn(),
    mockUseMainLayoutScrollContainer: vi.fn(),
}));

const newsTranslations: Record<string, string> = {
    loadingArticle: "Loading article",
    articleNotFound: "Article not found",
    failedToLoadArticle: "Failed to load article",
    backToNews: "Back to news",
    originalSource: "Original source",
};

const commonTranslations: Record<string, string> = {
    backToTop: "Back to top",
};

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const namespace = String(options?.ns ?? ns ?? "common");
            const dictionary = namespace === "common" ? commonTranslations : newsTranslations;
            return dictionary[key] ?? `${namespace}:${key}`;
        },
    }),
}));

vi.mock("@/lib/db", () => ({
    getDb: mockGetDb,
}));

vi.mock("@/lib/news-service", () => ({
    markNewsArticleAsRead: mockMarkNewsArticleAsRead,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
    openUrl: vi.fn(),
}));

vi.mock("@/components/article/ArticleContent", () => ({
    ArticleContent: ({ content, className, onClick }: { content: string; className?: string; onClick?: MouseEventHandler<HTMLDivElement> }) => (
        <div data-testid="article-content" className={className} onClick={onClick}>
            {content}
        </div>
    ),
}));

vi.mock("@/components/layout/MainLayout", () => ({
    useMainLayoutScrollContainer: mockUseMainLayoutScrollContainer,
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

describe("NewsDetail", () => {
    let container: HTMLDivElement;
    let root: Root;
    let mainScrollContainer: HTMLElement;
    let originalMatchMedia: typeof window.matchMedia | undefined;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        mockGetDb.mockReset();
        mockMarkNewsArticleAsRead.mockReset();
        mockUseMainLayoutScrollContainer.mockReset();

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

        originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaResult(false));

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
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    function renderNewsDetail(initialEntry = "/news/1") {
        act(() => {
            root.render(
                <MemoryRouter initialEntries={[initialEntry]}>
                    <Routes>
                        <Route path="/news/:id" element={<NewsDetail />} />
                    </Routes>
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

    async function settleNewsDetail() {
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

    function getDetailScrollContainer(): HTMLDivElement {
        const articleContent = container.querySelector('[data-testid="article-content"]');
        if (!(articleContent instanceof HTMLDivElement)) {
            throw new Error("Article content not found.");
        }

        const wrapper = articleContent.parentElement;
        if (!(wrapper instanceof HTMLDivElement) || !(wrapper.parentElement instanceof HTMLDivElement)) {
            throw new Error("Detail scroll container not found.");
        }

        return wrapper.parentElement;
    }

    it("does not render the back-to-top button while loading or when the article is missing", async () => {
        let resolveSelect!: (value: Array<Record<string, unknown>>) => void;
        const selectPromise = new Promise<Array<Record<string, unknown>>>((resolve) => {
            resolveSelect = resolve;
        });

        mockGetDb.mockResolvedValue({
            select: vi.fn(() => selectPromise),
        });
        mockMarkNewsArticleAsRead.mockResolvedValue(undefined);

        renderNewsDetail();

        expect(queryBackToTopButton()).toBeNull();

        resolveSelect([]);
        await settleNewsDetail();

        expect(container.textContent).toContain("Article not found");
        expect(queryBackToTopButton()).toBeNull();
    });

    it("shows the back-to-top button after detail scrolling and resets the tracked containers", async () => {
        mockGetDb.mockResolvedValue({
            select: vi.fn().mockResolvedValue([
                {
                    id: 1,
                    source_id: 2,
                    source_name: "Example Source",
                    source_url: "https://example.com",
                    guid: "https://example.com/article",
                    title: "Example article",
                    summary: "",
                    content: "Rendered body",
                    published_at: "2026-03-30T00:00:00Z",
                },
            ]),
        });
        mockMarkNewsArticleAsRead.mockResolvedValue(undefined);

        renderNewsDetail();
        await settleNewsDetail();

        expect(queryBackToTopButton()).toBeNull();

        const detailContainer = getDetailScrollContainer();
        mainScrollContainer.scrollTop = 410;
        act(() => {
            mainScrollContainer.dispatchEvent(new Event("scroll"));
        });

        detailContainer.scrollTop = 325;
        act(() => {
            detailContainer.dispatchEvent(new Event("scroll"));
        });

        expect(getBackToTopButton()).toBeInstanceOf(HTMLButtonElement);

        act(() => {
            getBackToTopButton().click();
        });

        expect(mainScrollContainer.scrollTop).toBe(0);
        expect(detailContainer.scrollTop).toBe(0);
        expect(queryBackToTopButton()).toBeNull();
    });
});
