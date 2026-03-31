import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageShell } from "@/components/layout/PageShell";

describe("PageShell", () => {
    it("uses the shared workspace horizontal gutter", () => {
        const markup = renderToStaticMarkup(
            <PageShell variant="workspace">
                <div>Body</div>
            </PageShell>,
        );

        expect(markup).toContain('class="mx-auto w-full');
        expect(markup).toContain("px-2");
        expect(markup).toContain("md:px-3");
        expect(markup).toContain("py-2");
        expect(markup).toContain("md:py-3");
        expect(markup).toContain("max-w-6xl");
        expect(markup).toContain(">Body<");
    });
});
