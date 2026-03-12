import { describe, expect, it } from "vitest";
import {
    DEFAULT_SOURCE_RETURN_TO,
    isNewsReturnToPath,
    resolveSourceReturnTo,
} from "@/lib/source-navigation";

describe("source navigation helpers", () => {
    it("accepts in-app relative return paths", () => {
        expect(resolveSourceReturnTo("/")).toBe("/");
        expect(resolveSourceReturnTo("/news/42?page=2&q=ai")).toBe("/news/42?page=2&q=ai");
    });

    it("falls back to the source manager for missing or invalid return paths", () => {
        expect(resolveSourceReturnTo(null)).toBe(DEFAULT_SOURCE_RETURN_TO);
        expect(resolveSourceReturnTo("")).toBe(DEFAULT_SOURCE_RETURN_TO);
        expect(resolveSourceReturnTo("sources")).toBe(DEFAULT_SOURCE_RETURN_TO);
        expect(resolveSourceReturnTo("https://example.com")).toBe(DEFAULT_SOURCE_RETURN_TO);
        expect(resolveSourceReturnTo("//example.com")).toBe(DEFAULT_SOURCE_RETURN_TO);
    });

    it("detects when the return target points back to the news view", () => {
        expect(isNewsReturnToPath("/")).toBe(true);
        expect(isNewsReturnToPath("/news/7?source=3")).toBe(true);
        expect(isNewsReturnToPath("/sources")).toBe(false);
        expect(isNewsReturnToPath("/chat")).toBe(false);
    });
});
