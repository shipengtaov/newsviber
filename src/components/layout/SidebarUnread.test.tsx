// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";

const {
    automationListeners,
    listAutomationProjectsMock,
    listNewsSourcesMock,
    newsListeners,
} = vi.hoisted(() => ({
    automationListeners: new Set<() => void>(),
    listAutomationProjectsMock: vi.fn(),
    listNewsSourcesMock: vi.fn(),
    newsListeners: new Set<() => void>(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            appName: "News Viber",
            "nav.news": "News",
            "nav.automation": "Automation",
            "nav.chat": "Chat",
            "nav.sources": "Sources",
            "nav.settings": "Settings",
        }[key] ?? key),
    }),
}));

vi.mock("@/components/update/AppUpdateProvider", () => ({
    useAppUpdate: () => ({
        currentVersion: "26.4.1",
    }),
}));

vi.mock("@/lib/news-service", () => ({
    listNewsSources: listNewsSourcesMock,
}));

vi.mock("@/lib/automation-service", () => ({
    listAutomationProjects: listAutomationProjectsMock,
}));

vi.mock("@/lib/news-events", () => ({
    addNewsSyncListener: vi.fn((listener: () => void) => {
        newsListeners.add(listener);
        return () => {
            newsListeners.delete(listener);
        };
    }),
}));

vi.mock("@/lib/automation-events", () => ({
    addAutomationSyncListener: vi.fn((listener: () => void) => {
        automationListeners.add(listener);
        return () => {
            automationListeners.delete(listener);
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
        automationListeners.clear();
        newsListeners.clear();
        listAutomationProjectsMock.mockReset();
        listNewsSourcesMock.mockReset();

        listNewsSourcesMock.mockResolvedValue([]);
        listAutomationProjectsMock.mockResolvedValue([]);

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
        expect(container.querySelector('[data-sidebar-unread="automation"]')).toBeNull();
    });

    it("shows a dot for Automation when there are unread reports", async () => {
        listAutomationProjectsMock.mockResolvedValueOnce([{
            id: 2,
            name: "Signals",
            prompt: "Summarize",
            cycle_mode: "manual",
            auto_enabled: false,
            auto_interval_minutes: 60,
            max_articles_per_report: 12,
            min_articles_per_report: 1,
            web_search_enabled: false,
            last_auto_attempted_at: null,
            last_auto_consumed_at: null,
            last_auto_generated_at: null,
            source_ids: [],
            unread_report_count: 2,
        }]);

        await renderSidebar("/automation");

        expect(container.querySelector('[data-sidebar-unread="automation"]')).not.toBeNull();
        expect(container.querySelector('[data-sidebar-unread="news"]')).toBeNull();
    });

    it("renders no dots when both sections are fully read", async () => {
        await renderSidebar("/");

        expect(container.querySelector('[data-sidebar-unread="news"]')).toBeNull();
        expect(container.querySelector('[data-sidebar-unread="automation"]')).toBeNull();
    });

    it("refreshes the two dots independently when sync events fire", async () => {
        await renderSidebar("/");

        expect(container.querySelector('[data-sidebar-unread="news"]')).toBeNull();
        expect(container.querySelector('[data-sidebar-unread="automation"]')).toBeNull();

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
        expect(container.querySelector('[data-sidebar-unread="automation"]')).toBeNull();

        listAutomationProjectsMock.mockResolvedValueOnce([{
            id: 2,
            name: "Signals",
            prompt: "Summarize",
            cycle_mode: "manual",
            auto_enabled: false,
            auto_interval_minutes: 60,
            max_articles_per_report: 12,
            min_articles_per_report: 1,
            web_search_enabled: false,
            last_auto_attempted_at: null,
            last_auto_consumed_at: null,
            last_auto_generated_at: null,
            source_ids: [],
            unread_report_count: 2,
        }]);

        await act(async () => {
            automationListeners.forEach((listener) => listener());
        });
        await settle();

        expect(container.querySelector('[data-sidebar-unread="news"]')).not.toBeNull();
        expect(container.querySelector('[data-sidebar-unread="automation"]')).not.toBeNull();
    });
});
