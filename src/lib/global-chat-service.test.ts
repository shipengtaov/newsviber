import { describe, expect, it } from "vitest";
import {
    buildGlobalChatArticleQueryParts,
    buildGlobalChatCustomRangeBounds,
    buildGlobalChatEventTimestampExpression,
    buildGlobalChatTitle,
    formatGlobalChatContextLine,
    normalizeGlobalChatMessage,
    normalizeGlobalChatScopeInput,
    normalizeGlobalChatThread,
} from "@/lib/global-chat-service";

describe("global chat scope helpers", () => {
    it("normalizes preset scope values and keeps an empty source list as all active sources", () => {
        expect(normalizeGlobalChatScopeInput({
            time_range_mode: "preset",
            preset_days: 999,
            source_ids: [],
        })).toEqual({
            time_range_mode: "preset",
            preset_days: 7,
            custom_start_date: null,
            custom_end_date: null,
            source_ids: [],
        });
    });

    it("deduplicates source ids and normalizes custom date order", () => {
        expect(normalizeGlobalChatScopeInput({
            time_range_mode: "custom",
            custom_start_date: "2026-03-08",
            custom_end_date: "2026-03-02",
            source_ids: [5, 2, 5, -1],
        })).toEqual({
            time_range_mode: "custom",
            preset_days: null,
            custom_start_date: "2026-03-02",
            custom_end_date: "2026-03-08",
            source_ids: [5, 2],
        });
    });
});

describe("global chat article query helpers", () => {
    it("builds a preset query without a source filter when all active sources are selected", () => {
        const result = buildGlobalChatArticleQueryParts({
            time_range_mode: "preset",
            preset_days: 7,
            source_ids: [],
        });

        expect(result.params).toEqual([]);
        expect(result.conditions.join(" ")).toContain("-7 days");
        expect(result.conditions.join(" ")).not.toContain("a.source_id IN");
        expect(result.event_timestamp_expression).toContain("julianday(a.published_at) IS NOT NULL");
    });

    it("builds a custom date query with UTC bounds and explicit selected sources", () => {
        const expectedBounds = buildGlobalChatCustomRangeBounds("2026-03-01", "2026-03-03");
        const result = buildGlobalChatArticleQueryParts({
            time_range_mode: "custom",
            custom_start_date: "2026-03-01",
            custom_end_date: "2026-03-03",
            source_ids: [4, 7],
        });

        expect(result.params.slice(0, 2)).toEqual([
            expectedBounds.startUtcIso,
            expectedBounds.endExclusiveUtcIso,
        ]);
        expect(result.params.slice(2)).toEqual([4, 7]);
        expect(result.conditions.join(" ")).toContain("NOT EXISTS");
    });
});

describe("global chat normalization helpers", () => {
    it("falls back to created_at when published_at cannot be parsed by SQLite", () => {
        expect(buildGlobalChatEventTimestampExpression("a")).toContain("a.created_at");
        expect(buildGlobalChatEventTimestampExpression("a")).toContain("julianday(a.published_at) IS NOT NULL");
    });

    it("builds a compact conversation title from the first user prompt", () => {
        expect(buildGlobalChatTitle("  This    is a thread title  ")).toBe("This is a thread title");
        expect(buildGlobalChatTitle("a".repeat(80), 20)).toBe(`${"a".repeat(17)}...`);
    });

    it("normalizes persisted thread and message rows", () => {
        expect(normalizeGlobalChatThread({
            id: 9,
            title: "  News Digest  ",
            time_range_mode: "preset",
            preset_days: 30,
            custom_start_date: null,
            custom_end_date: null,
            source_ids_csv: "3,3,1",
            created_at: "2026-03-10 08:00:00",
            updated_at: "2026-03-10 09:00:00",
        } as any)).toEqual({
            id: 9,
            title: "News Digest",
            time_range_mode: "preset",
            preset_days: 30,
            custom_start_date: null,
            custom_end_date: null,
            source_ids: [3, 1],
            created_at: "2026-03-10 08:00:00",
            updated_at: "2026-03-10 09:00:00",
        });

        expect(normalizeGlobalChatMessage({
            id: 2,
            thread_id: 9,
            role: "assistant",
            content: "Hello",
            created_at: "2026-03-10 09:00:00",
        } as any)).toEqual({
            id: 2,
            thread_id: 9,
            role: "assistant",
            content: "Hello",
            created_at: "2026-03-10 09:00:00",
        });
    });

    it("formats global chat context without leaking HTML tags", () => {
        expect(formatGlobalChatContextLine({
            source_name: "Ben's Bites",
            title: "Shipping AI features",
            summary: "<p>A concise summary with <strong>bold</strong> text</p>",
            published_at: "2026-03-10T09:00:00Z",
            inserted_at: "2026-03-10T09:10:00Z",
        })).toBe("- [2026-03-10T09:00:00Z] Ben's Bites: Shipping AI features - A concise summary with bold text");
    });
});
