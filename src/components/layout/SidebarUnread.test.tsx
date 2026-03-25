// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";

const {
    creativeListeners,
    listCreativeProjectsMock,
    listNewsSourcesMock,
    newsListeners,
} = vi.hoisted(() => ({
    creativeListeners: new Set<() => void>(),
    listCreativeProjectsMock: vi.fn(),
    listNewsSourcesMock: vi.fn(),
    newsListeners: new Set<() => void>(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            appName: "News Viber",
            "nav.news": "News",
            "nav.creativeSpace": "Creative Space",
            "nav.chat": "Chat",
            "nav.sources": "Sources",
            "nav.settings": "Settings",
        }[key] ?? key),
    }),
}));

vi.mock("@/components/update/AppUpdateProvider", () => ({
    useAppUpdate: () => ({
        currentVersion: "26.3.2",
    }),
}));

vi.mock("@/lib/news-service", () => ({
    listNewsSources: listNewsSourcesMock,
}));

vi.mock("@/lib/creative-service", () => ({
    listCreativeProjects: listCreativeProjectsMock,
}));

vi.mock("@/lib/news-events", () => ({
    addNewsSyncListener: vi.fn((listener: () => void) => {
        newsListeners.add(listener);
        return () => {
            newsListeners.delete(listener);
        };
    }),
}));

vi.mock("@/lib/creative-events", () => ({
    addCreativeSyncListener: vi.fn((listener: () => void) => {
        creativeListeners.add(listener);
        return () => {
            creativeListeners.delete(listener);
        };
    }),
}));

async function settle() {
    await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
}

describe("Sidebar unread indicators", () => {
    let container: HTMLDivElement;
    let root: Root;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        creativeListeners.clear();
        newsListeners.clear();
        listCreativeProjectsMock.mockReset();
        listNewsSourcesMock.mockReset();

        listNewsSourcesMock.mockResolvedValue([]);
        listCreativeProjectsMock.mockResolvedValue([]);

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    async function renderSidebar(pathname = "/") {
        await act(async () => {
            root.render(
                <MemoryRouter initialEntries={[pathname]}>
                    <Sidebar collapsed={false} />
                </MemoryRouter>,
            );
        });
        await settle();
    }

    it("shows a dot for News when there are unread articles", async () => {
        listNewsSourcesMock.mockResolvedValueOnce([{
            id: 1,
            name: "Example",
            source_type: "rss",
            url: "https://example.com/feed.xml",
            active: true,
            fetch_interval: 60,
            last_fetch: null,
            article_count: 3,
            unread_count: 1,
        }]);

        await renderSidebar("/");

        const unreadDot = container.querySelector('[data-sidebar-unread="news"]');

        expect(unreadDot).not.toBeNull();
        expect(unreadDot?.className).toContain("unread-badge");
        expect(unreadDot?.className).toContain("ring-primary");
        expect(unreadDot?.parentElement?.className).toContain("unread-badge-container");
        expect(container.querySelector('[data-sidebar-unread="creative"]')).toBeNull();
    });

    it("shows a dot for Creative Space when there are unread cards", async () => {
        listCreativeProjectsMock.mockResolvedValueOnce([{
            id: 2,
            name: "Signals",
            prompt: "Summarize",
            cycle_mode: "manual",
            auto_enabled: false,
            auto_interval_minutes: 60,
            max_articles_per_card: 12,
            last_auto_checked_at: null,
            last_auto_generated_at: null,
            source_ids: [],
            unread_card_count: 2,
        }]);

        await renderSidebar("/creative");

        expect(container.querySelector('[data-sidebar-unread="creative"]')).not.toBeNull();
        expect(container.querySelector('[data-sidebar-unread="news"]')).toBeNull();
    });

    it("renders no dots when both sections are fully read", async () => {
        await renderSidebar("/");

        expect(container.querySelector('[data-sidebar-unread="news"]')).toBeNull();
        expect(container.querySelector('[data-sidebar-unread="creative"]')).toBeNull();
    });

    it("refreshes the two dots independently when sync events fire", async () => {
        await renderSidebar("/");

        expect(container.querySelector('[data-sidebar-unread="news"]')).toBeNull();
        expect(container.querySelector('[data-sidebar-unread="creative"]')).toBeNull();

        listNewsSourcesMock.mockResolvedValueOnce([{
            id: 1,
            name: "Example",
            source_type: "rss",
            url: "https://example.com/feed.xml",
            active: true,
            fetch_interval: 60,
            last_fetch: null,
            article_count: 3,
            unread_count: 1,
        }]);

        await act(async () => {
            newsListeners.forEach((listener) => listener());
        });
        await settle();

        expect(container.querySelector('[data-sidebar-unread="news"]')).not.toBeNull();
        expect(container.querySelector('[data-sidebar-unread="creative"]')).toBeNull();

        listCreativeProjectsMock.mockResolvedValueOnce([{
            id: 2,
            name: "Signals",
            prompt: "Summarize",
            cycle_mode: "manual",
            auto_enabled: false,
            auto_interval_minutes: 60,
            max_articles_per_card: 12,
            last_auto_checked_at: null,
            last_auto_generated_at: null,
            source_ids: [],
            unread_card_count: 2,
        }]);

        await act(async () => {
            creativeListeners.forEach((listener) => listener());
        });
        await settle();

        expect(container.querySelector('[data-sidebar-unread="news"]')).not.toBeNull();
        expect(container.querySelector('[data-sidebar-unread="creative"]')).not.toBeNull();
    });
});
