import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";

function renderSidebar(pathname: string): string {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={[pathname]}>
            <Sidebar collapsed={false} />
        </MemoryRouter>,
    );
}

describe("Sidebar", () => {
    it("renders navigation items in the expected order", () => {
        const markup = renderSidebar("/");
        const labels = ["News", "Creative Space", "Chat", "Sources", "Settings"];
        const positions = labels.map((label) => markup.indexOf(`>${label}<`));

        positions.forEach((position) => {
            expect(position).toBeGreaterThan(-1);
        });
        expect(positions).toEqual([...positions].sort((left, right) => left - right));
    });

    it("keeps the active state logic for non-root routes", () => {
        const markup = renderSidebar("/creative");

        expect(markup).toContain('title="Creative Space" aria-current="page"');
        expect(markup).toContain('title="Creative Space" aria-current="page" data-active="true"');
        expect(markup).toContain('title="Sources" data-active="false"');
    });
});
