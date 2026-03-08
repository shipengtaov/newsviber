import { describe, expect, it } from "vitest";
import { formatUtcDate, formatUtcDateTime, parseUtcTimestamp } from "@/lib/time";

describe("time helpers", () => {
    it("preserves ISO timestamps with an explicit UTC designator", () => {
        expect(parseUtcTimestamp("2026-03-08T12:00:00.000Z")?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
    });

    it("treats SQLite datetime strings without a time zone as UTC", () => {
        expect(parseUtcTimestamp("2026-03-08 12:00:00")?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
    });

    it("treats ISO-like timestamps without a time zone as UTC", () => {
        expect(parseUtcTimestamp("2026-03-08T12:00:00")?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
    });

    it("returns null for empty or invalid timestamps", () => {
        expect(parseUtcTimestamp("")).toBeNull();
        expect(parseUtcTimestamp("not-a-date")).toBeNull();
        expect(parseUtcTimestamp(null)).toBeNull();
        expect(parseUtcTimestamp(undefined)).toBeNull();
    });

    it("returns the provided fallback for invalid formatted values", () => {
        expect(formatUtcDateTime("not-a-date", "Never")).toBe("Never");
        expect(formatUtcDate(null, "Never")).toBe("Never");
    });

    it("formats valid timestamps using the parsed absolute instant", () => {
        const parsed = parseUtcTimestamp("2026-03-08 12:00:00");
        expect(parsed).not.toBeNull();
        expect(formatUtcDateTime("2026-03-08 12:00:00")).toBe(parsed?.toLocaleString());
        expect(formatUtcDate("2026-03-08 12:00:00")).toBe(parsed?.toLocaleDateString());
    });
});
