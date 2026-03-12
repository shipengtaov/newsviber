import { describe, expect, it } from "vitest";
import {
    compactHtmlText,
    isProbablyHtml,
    sanitizeArticleHtml,
    stripHtmlToText,
} from "@/lib/article-html";

describe("article HTML helpers", () => {
    it("preserves rich article structure while sanitizing dangerous markup", () => {
        const sanitized = sanitizeArticleHtml(`
            <article>
                <h2>Daily Brief</h2>
                <p onclick="alert(1)" style="color:red">Ship <strong>faster</strong>.</p>
                <figure>
                    <img src="https://example.com/brief.png" alt="Brief" />
                    <figcaption>Morning note</figcaption>
                </figure>
                <ul><li>First point</li><li>Second point</li></ul>
            </article>
        `);

        expect(sanitized).toContain("<article>");
        expect(sanitized).toContain("<h2>Daily Brief</h2>");
        expect(sanitized).toContain("<strong>faster</strong>");
        expect(sanitized).toContain('<img src="https://example.com/brief.png" alt="Brief">');
        expect(sanitized).toContain("<figcaption>Morning note</figcaption>");
        expect(sanitized).toContain("<li>Second point</li>");
        expect(sanitized).not.toContain("onclick");
        expect(sanitized).not.toContain("style=");
    });

    it("removes forbidden tags and unsafe URL attributes", () => {
        const sanitized = sanitizeArticleHtml(`
            <div>
                <script>alert("xss")</script>
                <iframe src="https://example.com/embed"></iframe>
                <a href="javascript:alert(1)">Bad link</a>
                <img src="data:image/png;base64,abc" alt="Tracker" />
                <form action="https://example.com"><input value="secret" /></form>
                <a href="https://example.com/good">Good link</a>
            </div>
        `);

        expect(sanitized).not.toContain("<script");
        expect(sanitized).not.toContain("alert(\"xss\")");
        expect(sanitized).not.toContain("<iframe");
        expect(sanitized).not.toContain("<form");
        expect(sanitized).not.toContain("<input");
        expect(sanitized).not.toContain('href="javascript:alert(1)"');
        expect(sanitized).not.toContain('src="data:image/png;base64,abc"');
        expect(sanitized).toContain('<a href="https://example.com/good">Good link</a>');
    });

    it("converts HTML into readable plain text", () => {
        expect(stripHtmlToText(`
            <h2>Launch &amp; Learn</h2>
            <p>First paragraph.</p>
            <p>Second&nbsp;paragraph with <a href="https://example.com">link</a>.</p>
        `)).toBe("Launch & Learn\nFirst paragraph.\nSecond paragraph with link.");

        expect(compactHtmlText("<p>One</p><p>Two</p>")).toBe("One Two");
    });

    it("detects real HTML without misclassifying plain text", () => {
        expect(isProbablyHtml("<div><p>Example</p></div>")).toBe(true);
        expect(isProbablyHtml("Ben's Bites <2026 edition> & more")).toBe(false);
        expect(isProbablyHtml("Use **markdown** here.")).toBe(false);
    });
});
