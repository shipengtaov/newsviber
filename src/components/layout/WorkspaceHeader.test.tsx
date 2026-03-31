import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";

function countOccurrences(markup: string, value: string): number {
    return markup.split(value).length - 1;
}

describe("WorkspaceHeader", () => {
    it("keeps the default titleless layout while hiding the visible heading", () => {
        const markup = renderToStaticMarkup(
            <WorkspaceHeader
                density="compact"
                eyebrow="News"
                title="News overview"
                showTitle={false}
                stats={[
                    { label: "Scope", value: "All active sources", tone: "accent" },
                    { label: "Unread", value: "3 unread", tone: "warning" },
                ]}
                actions={<button type="button">Refresh</button>}
            />,
        );

        expect(markup).toContain('<h1 class="sr-only">News overview</h1>');
        expect(markup).not.toContain("font-display font-semibold tracking-[-0.04em] text-foreground text-2xl md:text-[1.9rem]");
        expect(markup).toContain('class="flex flex-col gap-2.5"');
        expect(countOccurrences(markup, 'class="stat-pill"')).toBe(2);
        expect(countOccurrences(markup, ">Refresh<")).toBe(1);
    });

    it("uses a denser layout for compact titleless headers", () => {
        const markup = renderToStaticMarkup(
            <WorkspaceHeader
                density="compact"
                eyebrow="News"
                title="News overview"
                showTitle={false}
                titlelessLayout="compact"
                stats={[
                    { label: "Scope", value: "All active sources", tone: "accent" },
                    { label: "Unread", value: "3 unread", tone: "warning" },
                ]}
                actions={<button type="button">Refresh</button>}
            />,
        );

        expect(markup).toContain('<h1 class="sr-only">News overview</h1>');
        expect(markup).not.toContain("font-display font-semibold tracking-[-0.04em] text-foreground text-2xl md:text-[1.9rem]");
        expect(markup).toContain('class="flex flex-col gap-2"');
        expect(countOccurrences(markup, 'class="stat-pill"')).toBe(2);
        expect(countOccurrences(markup, ">Refresh<")).toBe(1);
    });
});
