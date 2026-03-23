import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    listenMock,
    saveMock,
    writeTextFileMock,
    listRssSourcesForExportMock,
    serializeSourcesToOpmlMock,
    toastMock,
} = vi.hoisted(() => ({
    listenMock: vi.fn(),
    saveMock: vi.fn(),
    writeTextFileMock: vi.fn(),
    listRssSourcesForExportMock: vi.fn(),
    serializeSourcesToOpmlMock: vi.fn(),
    toastMock: vi.fn(),
}));

function translate(key: string, options?: Record<string, unknown>): string {
    switch (key) {
        case "sources:exportNoSources":
            return "No RSS sources available to export";
        case "sources:exportOpmlDialogTitle":
            return "Export OPML sources";
        case "sources:exportOpmlComplete":
            return "OPML export complete";
        case "sources:exportOpmlCompleteDesc":
            return `Saved ${options?.count ?? 0} RSS sources to ${options?.fileName ?? "file.opml"}.`;
        case "sources:exportOpmlFailed":
            return "OPML export failed";
        default:
            return key;
    }
}

vi.mock("@tauri-apps/api/event", () => ({
    listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
    save: saveMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
    writeTextFile: writeTextFileMock,
}));

vi.mock("@/lib/source-service", () => ({
    listRssSourcesForExport: listRssSourcesForExportMock,
}));

vi.mock("@/lib/source-opml", () => ({
    serializeSourcesToOpml: serializeSourcesToOpmlMock,
}));

vi.mock("@/hooks/use-toast", () => ({
    toast: toastMock,
}));

vi.mock("@/lib/i18n", () => ({
    default: {
        t: translate,
    },
}));

import {
    EXPORT_SOURCES_OPML_APP_EVENT,
    exportSourcesToOpml,
    registerExportSourcesOpmlMenuHandler,
} from "@/lib/source-opml-export";

describe("source OPML export helper", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-23T09:10:11Z"));

        listenMock.mockReset();
        saveMock.mockReset();
        writeTextFileMock.mockReset();
        listRssSourcesForExportMock.mockReset();
        serializeSourcesToOpmlMock.mockReset();
        toastMock.mockReset();

        listRssSourcesForExportMock.mockResolvedValue([{
            id: 11,
            name: "Example Feed",
            source_type: "rss",
            url: "https://example.com/feed.xml",
            active: true,
            config: null,
            fetch_interval: 60,
            last_fetch: null,
            created_at: "2026-03-20T00:00:00Z",
        }]);
        serializeSourcesToOpmlMock.mockReturnValue("<opml />");
        saveMock.mockResolvedValue("/tmp/export.opml");
        writeTextFileMock.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("exports RSS sources through the native save dialog", async () => {
        await exportSourcesToOpml();

        expect(listRssSourcesForExportMock).toHaveBeenCalled();
        expect(serializeSourcesToOpmlMock).toHaveBeenCalledWith([{
            name: "Example Feed",
            url: "https://example.com/feed.xml",
            active: true,
            fetchInterval: 60,
        }]);
        expect(saveMock).toHaveBeenCalledWith({
            title: "Export OPML sources",
            defaultPath: "newsviber-sources-2026-03-23.opml",
            filters: [{ name: "OPML", extensions: ["opml"] }],
        });
        expect(writeTextFileMock).toHaveBeenCalledWith("/tmp/export.opml", "<opml />");
        expect(toastMock).toHaveBeenCalledWith({
            title: "OPML export complete",
            description: "Saved 1 RSS sources to export.opml.",
        });
    });

    it("shows a toast when there are no RSS sources to export", async () => {
        listRssSourcesForExportMock.mockResolvedValueOnce([]);

        await exportSourcesToOpml();

        expect(saveMock).not.toHaveBeenCalled();
        expect(toastMock).toHaveBeenCalledWith({
            title: "No RSS sources available to export",
        });
    });

    it("registers the menu listener for the app-level export event", async () => {
        const unlistenMock = vi.fn();
        const handler = vi.fn();
        listenMock.mockResolvedValue(unlistenMock);

        const unlisten = await registerExportSourcesOpmlMenuHandler(handler);

        expect(listenMock).toHaveBeenCalledWith(
            EXPORT_SOURCES_OPML_APP_EVENT,
            expect.any(Function),
        );

        const menuHandler = listenMock.mock.calls[0]?.[1];
        await menuHandler?.({});

        expect(handler).toHaveBeenCalledTimes(1);
        expect(unlisten).toBe(unlistenMock);
    });
});
