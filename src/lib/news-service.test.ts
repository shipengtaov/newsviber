import { afterEach, describe, expect, it, vi } from "vitest";

const {
    dispatchNewsSyncEventMock,
    getDbMock,
} = vi.hoisted(() => ({
    dispatchNewsSyncEventMock: vi.fn(),
    getDbMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    getDb: getDbMock,
}));

vi.mock("@/lib/news-events", () => ({
    dispatchNewsSyncEvent: dispatchNewsSyncEventMock,
}));

import {
    listNewsSources,
    markNewsArticleAsRead,
    markScopedNewsArticlesAsRead,
} from "@/lib/news-service";

afterEach(() => {
    dispatchNewsSyncEventMock.mockReset();
    getDbMock.mockReset();
});

describe("news service unread state", () => {
    it("maps unread source counts from source queries", async () => {
        const selectMock = vi.fn().mockResolvedValue([{
            id: 5,
            name: "HN",
            source_type: "rss",
            url: "https://news.ycombinator.com/rss",
            active: 1,
            fetch_interval: null,
            last_fetch: "2026-03-14T01:00:00Z",
            article_count: 12,
            unread_count: 4,
        }]);

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });

        await expect(listNewsSources()).resolves.toEqual([{
            id: 5,
            name: "HN",
            source_type: "rss",
            url: "https://news.ycombinator.com/rss",
            active: true,
            fetch_interval: 0,
            last_fetch: "2026-03-14T01:00:00Z",
            article_count: 12,
            unread_count: 4,
        }]);

        expect(selectMock).toHaveBeenCalledWith(expect.stringContaining("AS unread_count"));
    });

    it("marks a single article as read", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn(),
            execute: executeMock,
        });

        await markNewsArticleAsRead(18);

        expect(executeMock).toHaveBeenCalledWith(
            "UPDATE articles SET is_read = 1 WHERE id = $1",
            [18],
        );
        expect(dispatchNewsSyncEventMock).toHaveBeenCalledTimes(1);
    });

    it("marks all unread articles in a source as read", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn(),
            execute: executeMock,
        });

        await markScopedNewsArticlesAsRead(7);

        expect(executeMock).toHaveBeenCalledWith(
            "UPDATE articles SET is_read = 1 WHERE source_id = $1 AND is_read = 0",
            [7],
        );
        expect(dispatchNewsSyncEventMock).toHaveBeenCalledTimes(1);
    });

    it("marks all unread articles in active sources as read", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn(),
            execute: executeMock,
        });

        await markScopedNewsArticlesAsRead(null);

        expect(executeMock).toHaveBeenCalledWith(
            "UPDATE articles SET is_read = 1 WHERE is_read = 0 AND source_id IN (SELECT id FROM sources WHERE active = 1)",
            [],
        );
        expect(dispatchNewsSyncEventMock).toHaveBeenCalledTimes(1);
    });
});
