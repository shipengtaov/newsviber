import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({
    getDbMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    getDb: getDbMock,
}));

import {
    createSource,
    importOpmlSources,
    listRssSourcesForExport,
    listSources,
    updateSource,
} from "@/lib/source-service";

afterEach(() => {
    getDbMock.mockReset();
});

describe("source service", () => {
    it("normalizes source rows for source management", async () => {
        getDbMock.mockResolvedValue({
            select: vi.fn().mockResolvedValue([{
                id: 3,
                name: "Example",
                source_type: "rss",
                url: "https://example.com/feed",
                active: 1,
                config: null,
                fetch_interval: null,
                last_fetch: "2026-03-23T00:00:00Z",
                created_at: "2026-03-20T00:00:00Z",
            }]),
            execute: vi.fn(),
        });

        await expect(listSources()).resolves.toEqual([{
            id: 3,
            name: "Example",
            source_type: "rss",
            url: "https://example.com/feed",
            active: true,
            config: null,
            fetch_interval: 60,
            last_fetch: "2026-03-23T00:00:00Z",
            created_at: "2026-03-20T00:00:00Z",
        }]);
    });

    it("normalizes URLs when creating and updating sources", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn(),
            execute: executeMock,
        });

        await createSource({
            name: "Example",
            sourceType: "rss",
            url: "https://example.com/feed/#fragment",
            fetchInterval: 15,
        });
        await updateSource(7, {
            name: "Example Updated",
            sourceType: "rss",
            url: "https://example.com/feed/",
            fetchInterval: 0,
            active: false,
        });

        expect(executeMock).toHaveBeenNthCalledWith(
            1,
            "INSERT INTO sources (name, source_type, url, fetch_interval, active, config) VALUES ($1, $2, $3, $4, $5, $6)",
            ["Example", "rss", "https://example.com/feed", 15, 1, null],
        );
        expect(executeMock).toHaveBeenNthCalledWith(
            2,
            "UPDATE sources SET name = $1, source_type = $2, url = $3, fetch_interval = $4, active = $5, config = $6 WHERE id = $7",
            ["Example Updated", "rss", "https://example.com/feed", 0, 0, null, 7],
        );
    });

    it("exports only RSS sources", async () => {
        const selectMock = vi.fn().mockResolvedValue([]);
        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });

        await listRssSourcesForExport();

        expect(selectMock).toHaveBeenCalledWith(
            "SELECT * FROM sources WHERE source_type = $1 ORDER BY LOWER(name) ASC, id ASC",
            ["rss"],
        );
    });

    it("skips matching URLs in skip mode", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn().mockResolvedValue([{
                id: 4,
                name: "Existing",
                source_type: "rss",
                url: "https://example.com/feed/",
                active: 1,
                config: null,
                fetch_interval: 60,
                last_fetch: null,
                created_at: null,
            }]),
            execute: executeMock,
        });

        await expect(importOpmlSources([{
            name: "Imported",
            url: "https://example.com/feed#top",
            active: false,
            fetchInterval: 15,
        }], "skip")).resolves.toEqual({
            insertedCount: 0,
            updatedCount: 0,
            skippedDuplicateCount: 1,
            skippedInvalidCount: 0,
        });

        expect(executeMock).not.toHaveBeenCalled();
    });

    it("uses the provided fallback interval for imported entries that omit it", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn().mockResolvedValue([{
                id: 4,
                name: "Existing",
                source_type: "rss",
                url: "https://example.com/feed/",
                active: 1,
                config: null,
                fetch_interval: 60,
                last_fetch: "2026-03-20T00:00:00Z",
                created_at: null,
            }]),
            execute: executeMock,
        });

        const result = await importOpmlSources([
            {
                name: "Imported Existing",
                url: "https://example.com/feed",
                active: false,
                fetchInterval: 5,
            },
            {
                name: "",
                url: "https://another.example.com/rss/",
                active: true,
                fetchInterval: null,
            },
        ], "overwrite", 30);

        expect(result).toEqual({
            insertedCount: 1,
            updatedCount: 1,
            skippedDuplicateCount: 0,
            skippedInvalidCount: 0,
        });
        expect(executeMock).toHaveBeenNthCalledWith(
            1,
            "UPDATE sources SET name = $1, active = $2, fetch_interval = $3 WHERE id = $4",
            ["Imported Existing", 0, 5, 4],
        );
        expect(executeMock).toHaveBeenNthCalledWith(
            2,
            "INSERT INTO sources (name, source_type, url, fetch_interval, active, config) VALUES ($1, $2, $3, $4, $5, $6)",
            ["another.example.com", "rss", "https://another.example.com/rss", 30, 1, null],
        );
    });

    it("rejects imports with missing fetch interval when no fallback is provided", async () => {
        getDbMock.mockResolvedValue({
            select: vi.fn().mockResolvedValue([]),
            execute: vi.fn(),
        });

        await expect(importOpmlSources([{
            name: "Imported",
            url: "https://example.com/feed.xml",
            active: true,
            fetchInterval: null,
        }], "skip")).rejects.toThrow("Missing fetch interval for imported source.");
    });
});
