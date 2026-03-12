import { describe, expect, it } from "vitest";
import { summarizeArticleContextText } from "@/lib/creative-service";

describe("creative service context helpers", () => {
    it("strips HTML from article context before sending it to the model", () => {
        expect(summarizeArticleContextText(
            "<p>Strong <strong>signal</strong> with <a href=\"https://example.com\">evidence</a>.</p>",
            "<div>Fallback body</div>",
        )).toBe("Strong signal with evidence.");
    });

    it("falls back to sanitized body content when summary is empty", () => {
        expect(summarizeArticleContextText(
            "",
            "<h2>Deep dive</h2><p>Second line</p>",
        )).toBe("Deep dive Second line");
    });
});
