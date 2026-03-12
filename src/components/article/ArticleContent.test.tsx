import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleContent } from "@/components/article/ArticleContent";

describe("ArticleContent", () => {
    it("renders sanitized HTML content when the article body is HTML", () => {
        const markup = renderToStaticMarkup(
            <ArticleContent content={'<h1>Digest</h1><p onclick="alert(1)">Line</p><script>alert(1)</script>'} />,
        );

        expect(markup).toContain("<h1>Digest</h1>");
        expect(markup).toContain("<p>Line</p>");
        expect(markup).not.toContain("onclick");
        expect(markup).not.toContain("<script");
        expect(markup).not.toContain("alert(1)");
    });

    it("keeps markdown and plain text on the markdown render path", () => {
        const markup = renderToStaticMarkup(
            <ArticleContent content={"# Daily Brief\n\n- First point\n\nUse `npm test`."} />,
        );

        expect(markup).toContain("<h1>Daily Brief</h1>");
        expect(markup).toContain("<li>First point</li>");
        expect(markup).toContain("<code>npm test</code>");
    });
});
