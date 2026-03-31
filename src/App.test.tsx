// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const {
    dispatchNewsSyncEventMock,
    dispatchSourceFetchSyncEventMock,
    getDbMock,
    isSourceDueForFetchMock,
    newsListeners,
    registerExportSourcesOpmlMenuHandlerMock,
    runDueAutomationsMock,
    sourceListeners,
    fetchSourcesMock,
} = vi.hoisted(() => ({
    dispatchNewsSyncEventMock: vi.fn(),
    dispatchSourceFetchSyncEventMock: vi.fn(),
    getDbMock: vi.fn(),
    isSourceDueForFetchMock: vi.fn(),
    newsListeners: new Set<() => void>(),
    registerExportSourcesOpmlMenuHandlerMock: vi.fn(),
    runDueAutomationsMock: vi.fn(),
    sourceListeners: new Set<() => void>(),
    fetchSourcesMock: vi.fn(),
}));

vi.mock("@/components/update/AppUpdateProvider", () => ({
    AppUpdateProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/layout/MainLayout", () => ({
    MainLayout: () => null,
}));

vi.mock("@/views/NewsList", () => ({
    default: () => null,
}));

vi.mock("@/views/NewsDetail", () => ({
    default: () => null,
}));

vi.mock("@/views/SourceManager", () => ({
    default: () => null,
}));

vi.mock("@/views/SourceForm", () => ({
    default: () => null,
}));

vi.mock("@/views/GlobalChat", () => ({
    default: () => null,
}));

vi.mock("@/views/Automation", () => ({
    default: () => null,
}));

vi.mock("@/views/Settings", () => ({
    default: () => null,
}));

vi.mock("@/lib/automation-service", () => ({
    runDueAutomations: runDueAutomationsMock,
}));

vi.mock("@/lib/db", () => ({
    getDb: getDbMock,
}));

vi.mock("@/lib/source-opml-export", () => ({
    registerExportSourcesOpmlMenuHandler: registerExportSourcesOpmlMenuHandlerMock,
}));

vi.mock("@/lib/source-fetch", () => ({
    fetchSources: fetchSourcesMock,
    isSourceDueForFetch: isSourceDueForFetchMock,
}));

vi.mock("@/lib/source-events", () => ({
    addSourceFetchSyncListener: vi.fn((listener: () => void) => {
        sourceListeners.add(listener);
        return () => {
            sourceListeners.delete(listener);
        };
    }),
    dispatchSourceFetchSyncEvent: dispatchSourceFetchSyncEventMock.mockImplementation(() => {
        sourceListeners.forEach((listener) => listener());
    }),
}));

vi.mock("@/lib/news-events", () => ({
    addNewsSyncListener: vi.fn((listener: () => void) => {
        newsListeners.add(listener);
        return () => {
            newsListeners.delete(listener);
        };
    }),
    dispatchNewsSyncEvent: dispatchNewsSyncEventMock.mockImplementation(() => {
        newsListeners.forEach((listener) => listener());
    }),
}));

async function settle() {
    await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
}

describe("App background sync routing", () => {
    let container: HTMLDivElement;
    let root: Root;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        dispatchNewsSyncEventMock.mockReset();
        dispatchNewsSyncEventMock.mockImplementation(() => {
            newsListeners.forEach((listener) => listener());
        });
        dispatchSourceFetchSyncEventMock.mockReset();
        dispatchSourceFetchSyncEventMock.mockImplementation(() => {
            sourceListeners.forEach((listener) => listener());
        });
        getDbMock.mockReset();
        isSourceDueForFetchMock.mockReset();
        newsListeners.clear();
        registerExportSourcesOpmlMenuHandlerMock.mockReset();
        runDueAutomationsMock.mockReset();
        sourceListeners.clear();
        fetchSourcesMock.mockReset();

        registerExportSourcesOpmlMenuHandlerMock.mockResolvedValue(() => {});
        runDueAutomationsMock.mockResolvedValue(undefined);
        fetchSourcesMock.mockResolvedValue({
            insertedCount: 0,
            fetchedCount: 0,
            successCount: 0,
            failCount: 0,
        });

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

    async function renderApp() {
        await act(async () => {
            root.render(<App />);
        });
        await settle();
    }

    it("dispatches both source-fetch and news sync when background fetch inserts articles", async () => {
        getDbMock.mockResolvedValue({
            select: vi.fn().mockResolvedValue([{
                id: 3,
                name: "Example Feed",
                source_type: "rss",
                url: "https://example.com/feed.xml",
                active: 1,
                fetch_interval: 60,
                last_fetch: null,
            }]),
        });
        isSourceDueForFetchMock.mockReturnValue(true);
        fetchSourcesMock.mockResolvedValueOnce({
            insertedCount: 2,
            fetchedCount: 2,
            successCount: 1,
            failCount: 0,
        });

        await renderApp();

        expect(fetchSourcesMock).toHaveBeenCalledTimes(1);
        expect(dispatchSourceFetchSyncEventMock).toHaveBeenCalledTimes(1);
        expect(dispatchNewsSyncEventMock).toHaveBeenCalledTimes(1);
        expect(runDueAutomationsMock).toHaveBeenCalledTimes(1);
    });

    it("keeps automation auto checks bound to source-fetch sync rather than news sync", async () => {
        getDbMock.mockResolvedValue({
            select: vi.fn().mockResolvedValue([]),
        });

        await renderApp();

        expect(runDueAutomationsMock).toHaveBeenCalledTimes(1);

        dispatchNewsSyncEventMock();
        await settle();

        expect(runDueAutomationsMock).toHaveBeenCalledTimes(1);

        dispatchSourceFetchSyncEventMock();
        await settle();

        expect(runDueAutomationsMock).toHaveBeenCalledTimes(2);
    });
});
