import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";

const translations: Record<string, string> = {
    appName: "News Viber",
    "nav.news": "News",
    "nav.creativeSpace": "Creative Space",
    "nav.chat": "Chat",
    "nav.sources": "Sources",
    "nav.settings": "Settings",
};

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => translations[key] ?? key,
    }),
}));

vi.mock("@/components/update/AppUpdateProvider", () => ({
    useAppUpdate: () => ({
        currentVersion: "26.3.1",
    }),
}));

function renderSidebar(pathname: string, collapsed = false): string {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={[pathname]}>
            <Sidebar collapsed={collapsed} />
        </MemoryRouter>,
    );
}

describe("Sidebar", () => {
    it("renders navigation items in the expected order", () => {
        const markup = renderSidebar("/");
        const labels = [
            translations["nav.news"],
            translations["nav.creativeSpace"],
            translations["nav.chat"],
            translations["nav.sources"],
            translations["nav.settings"],
        ];
        const positions = labels.map((label) => markup.indexOf(`>${label}<`));

        positions.forEach((position) => {
            expect(position).toBeGreaterThan(-1);
        });
        expect(positions).toEqual([...positions].sort((left, right) => left - right));
    });

    it("does not render the removed sidebar helper copy", () => {
        const markup = renderSidebar("/");

        expect(markup).not.toContain("Signal Hub");
        expect(markup).not.toContain("Information workspace");
        expect(markup).not.toContain("Navigate");
        expect(markup).toContain(`>${translations.appName}<`);
        expect(markup).toContain(">v26.3.1<");
    });

    it("uses the updated expanded width while preserving the collapsed width", () => {
        const expandedMarkup = renderSidebar("/");
        const collapsedMarkup = renderSidebar("/", true);

        expect(expandedMarkup).toContain("w-64");
        expect(expandedMarkup).not.toContain("w-[18.75rem]");
        expect(collapsedMarkup).toContain("w-20");
    });

    it("keeps the icon rail anchored in collapsed mode", () => {
        const markup = renderSidebar("/", true);

        expect(markup).toContain("px-2 py-3");
        expect(markup).toContain("grid-cols-[3rem_0fr] gap-0");
        expect(markup).not.toContain("grid-cols-[3rem_0fr] justify-center");
        expect(markup).toContain("mt-4 flex-1 space-y-1.5 px-2");
        expect(markup).toContain("grid-cols-[1.25rem_0fr] gap-0 px-3.5");
        expect(markup).not.toContain("grid-cols-[1.25rem_0fr] justify-center");
    });

    it("keeps the active state logic for non-root routes", () => {
        const markup = renderSidebar("/creative");

        expect(markup).toContain(`title="${translations["nav.creativeSpace"]}" aria-current="page"`);
        expect(markup).toContain(`title="${translations["nav.creativeSpace"]}" aria-current="page" data-active="true"`);
        expect(markup).toContain(`title="${translations["nav.sources"]}" data-active="false"`);
    });
});
