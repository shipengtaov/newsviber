import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({
    getDbMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    getDb: getDbMock,
}));

import {
    getGlobalChatArticlesByIds,
    listGlobalChatShortlistArticles,
    searchGlobalChatArticlesInScope,
} from "@/lib/global-chat-service";

afterEach(() => {
    getDbMock.mockReset();
});

describe("global chat shortlist queries", () => {
    it("returns compact shortlist previews with sanitized article text", async () => {
        const selectMock = vi.fn().mockResolvedValue([{
            id: 11,
            source_name: "Reuters",
            title: "AI chips are getting cheaper",
            summary: "<p>Lower prices with <strong>better</strong> throughput.</p>",
            content: null,
            published_at: "2026-03-12T08:00:00Z",
            inserted_at: "2026-03-12T08:05:00Z",
            article_url: "https://example.com/article",
        }]);

        getDbMock.mockResolvedValue({
            select: selectMock,
        });

        const result = await listGlobalChatShortlistArticles({
            time_range_mode: "preset",
            preset_days: 7,
            source_ids: [],
        });

        expect(selectMock).toHaveBeenCalledWith(expect.stringContaining("LIMIT 12"), []);
        expect(result).toEqual([{
            id: 11,
            source_name: "Reuters",
            title: "AI chips are getting cheaper",
            preview: "Lower prices with better throughput.",
            published_at: "2026-03-12T08:00:00Z",
            inserted_at: "2026-03-12T08:05:00Z",
            article_url: "https://example.com/article",
        }]);
    });

    it("returns only scoped article IDs and preserves the requested order", async () => {
        const selectMock = vi.fn().mockResolvedValue([
            {
                id: 4,
                source_name: "Reuters",
                title: "Second article",
                summary: "Second summary",
                content: "Second body",
                published_at: "2026-03-12T08:00:00Z",
                inserted_at: "2026-03-12T08:05:00Z",
                article_url: "https://example.com/second",
            },
            {
                id: 7,
                source_name: "HN",
                title: "First article",
                summary: "First summary",
                content: "First body",
                published_at: "2026-03-13T08:00:00Z",
                inserted_at: "2026-03-13T08:05:00Z",
                article_url: "https://example.com/first",
            },
        ]);

        getDbMock.mockResolvedValue({
            select: selectMock,
        });

        const result = await getGlobalChatArticlesByIds({
            time_range_mode: "preset",
            preset_days: 7,
            source_ids: [],
        }, [7, 4, 999]);

        expect(result.map((article) => article.id)).toEqual([7, 4]);
        expect(result[0]).toEqual(expect.objectContaining({
            id: 7,
            title: "First article",
            summary: "First summary",
            content: "First body",
        }));
    });

    it("searches within the current scope using the normalized query", async () => {
        const selectMock = vi.fn().mockResolvedValue([{
            id: 21,
            source_name: "Ben's Bites",
            title: "GPU demand rises",
            summary: "",
            content: "<p>GPU demand is rising across AI infra.</p>",
            published_at: null,
            inserted_at: "2026-03-14T08:05:00Z",
            article_url: "https://example.com/gpu-demand",
        }]);

        getDbMock.mockResolvedValue({
            select: selectMock,
        });

        const result = await searchGlobalChatArticlesInScope({
            time_range_mode: "preset",
            preset_days: 7,
            source_ids: [3],
        }, " GPU demand ", 4);

        expect(selectMock).toHaveBeenCalledWith(
            expect.stringContaining("LOWER(a.title) LIKE"),
            expect.arrayContaining([3, "%gpu demand%"]),
        );
        expect(result).toEqual([{
            id: 21,
            source_name: "Ben's Bites",
            title: "GPU demand rises",
            preview: "GPU demand is rising across AI infra.",
            published_at: null,
            inserted_at: "2026-03-14T08:05:00Z",
            article_url: "https://example.com/gpu-demand",
        }]);
    });
});
