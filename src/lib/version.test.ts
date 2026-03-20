import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION, getAppVersion, resetAppVersionCacheForTests } from "@/lib/version";

const { mockIsTauri, mockGetVersion } = vi.hoisted(() => ({
    mockIsTauri: vi.fn(),
    mockGetVersion: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
    isTauri: mockIsTauri,
}));

vi.mock("@tauri-apps/api/app", () => ({
    getVersion: mockGetVersion,
}));

describe("app version helper", () => {
    beforeEach(() => {
        resetAppVersionCacheForTests();
        mockIsTauri.mockReset();
        mockGetVersion.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses the bundled version outside Tauri", async () => {
        mockIsTauri.mockReturnValue(false);

        await expect(getAppVersion()).resolves.toBe(APP_VERSION);
        expect(mockGetVersion).not.toHaveBeenCalled();
    });

    it("caches the native version lookup inside Tauri", async () => {
        mockIsTauri.mockReturnValue(true);
        mockGetVersion.mockResolvedValue("26.3.1");

        await expect(getAppVersion()).resolves.toBe("26.3.1");
        await expect(getAppVersion()).resolves.toBe("26.3.1");
        expect(mockGetVersion).toHaveBeenCalledTimes(1);
    });

    it("falls back to the bundled version when the native lookup fails", async () => {
        mockIsTauri.mockReturnValue(true);
        mockGetVersion.mockRejectedValue(new Error("boom"));

        await expect(getAppVersion()).resolves.toBe(APP_VERSION);
    });
});
