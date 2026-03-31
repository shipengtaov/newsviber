import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MainLayout } from "@/components/layout/MainLayout";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            collapseSidebar: "Collapse sidebar",
            expandSidebar: "Expand sidebar",
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
        currentVersion: "26.3.3",
    }),
}));

vi.mock("@/lib/news-service", () => ({
    listNewsSources: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/automation-service", () => ({
    listAutomationProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/news-events", () => ({
    addNewsSyncListener: vi.fn(() => () => {}),
}));

vi.mock("@/lib/automation-events", () => ({
    addAutomationSyncListener: vi.fn(() => () => {}),
}));

vi.mock("@/hooks/use-main-menu-scroll-memory", () => ({
    useMainMenuScrollMemory: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
    isTauri: vi.fn(() => false),
}));

vi.mock("@tauri-apps/api/window", () => ({
    getCurrentWindow: vi.fn(() => ({
        startDragging: vi.fn(),
    })),
}));

vi.mock("@/components/ui/toaster", () => ({
    Toaster: () => <div data-toaster="true" />,
}));

function renderLayout(): string {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route element={<MainLayout />}>
                    <Route index element={<div>Body</div>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );
}

describe("MainLayout", () => {
    it("keeps the titlebar flush with the left edge and connected to the sidebar shell", () => {
        const markup = renderLayout();

        expect(markup).toContain('data-layout-shell="true"');
        expect(markup).toContain('data-layout-titlebar="true"');
        expect(markup).toContain("absolute inset-x-0 top-0");
        expect(markup).toContain('data-sidebar-shell="true"');
        expect(markup).not.toContain("absolute inset-x-0 top-0 z-20 px-3");
    });

    it("preserves the main content gutter and titlebar-safe padding", () => {
        const markup = renderLayout();

        expect(markup).toContain('data-layout-main-column="true"');
        expect(markup).toContain("pl-2");
        expect(markup).toContain("md:pl-3");
        expect(markup).toContain("pr-2");
        expect(markup).toContain("md:pr-3");
        expect(markup).toContain("pt-[var(--layout-titlebar-safe-height)]");
        expect(markup).toContain(">Body<");
    });
});
