// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SourceManager from "@/views/SourceManager";

const {
    toastMock,
    listSourcesMock,
    setSourceActiveMock,
    deleteSourceMock,
    importOpmlSourcesMock,
    fetchSourceMock,
    fetchSourcesMock,
    openMock,
    readTextFileMock,
    parseOpmlTextMock,
} = vi.hoisted(() => ({
    toastMock: vi.fn(),
    listSourcesMock: vi.fn(),
    setSourceActiveMock: vi.fn(),
    deleteSourceMock: vi.fn(),
    importOpmlSourcesMock: vi.fn(),
    fetchSourceMock: vi.fn(),
    fetchSourcesMock: vi.fn(),
    openMock: vi.fn(),
    readTextFileMock: vi.fn(),
    parseOpmlTextMock: vi.fn(),
}));

function translate(template: string, options?: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(options?.[key] ?? ""));
}

const sourceTranslations: Record<string, string> = {
    eyebrow: "Sources",
    title: "Source management",
    description: "Manage the feeds that power your information flow.",
    activeCount: "{{count}} running",
    inactiveCount: "{{count}} paused",
    fetchAll: "Fetch All",
    fetchingAll: "Fetching All...",
    addSource: "Add Source",
    createSourceAction: "Create Source",
    importOpml: "Import OPML",
    importingOpml: "Importing OPML...",
    type: "Type:",
    status: "Status:",
    fetch: "Fetch",
    deactivateSource: "Deactivate source",
    activateSource: "Activate source",
    deleteSourceTitle: "Delete source",
    noSourcesAdded: "No sources added yet.",
    deleteSourceDialog: "Delete source?",
    deleteSourceDesc: "Delete {{name}}?",
    deleteSourceDescGeneric: "Delete this source?",
    sourceActivated: "Source activated",
    sourceDeactivated: "Source deactivated",
    sourceDeleted: "Source deleted",
    noActiveSourceToFetch: "No active sources to fetch",
    fetchingNSources: "Fetching {{count}} active sources...",
    fetchAllComplete: "Fetch All Complete",
    fetchAllCompleteDesc: "Fetched {{inserted}} new articles. {{succeeded}} succeeded{{failedPart}}.",
    fetchComplete: "Fetch complete",
    fetchCompleteDesc: "Fetched {{fetched}} articles, saved {{inserted}} new.",
    fetchFailed: "Fetch failed",
    fetchingSource: "Fetching {{name}}...",
    importOpmlDialogTitle: "Import OPML sources",
    importModeSkip: "Skip duplicates",
    importModeOverwrite: "Overwrite existing",
    importOpmlReviewTitle: "Review OPML import",
    importOpmlReviewDesc: "{{count}} feeds are ready to import. Review conflicts before continuing.",
    importOpmlReviewSummary: "Import check summary",
    importOpmlReviewDuplicates: "{{count}} feeds already exist in Sources.",
    importOpmlReviewMissingFetchInterval: "{{count}} feeds need a Fetch Interval before they can be imported.",
    importOpmlReviewFileDuplicates: "{{count}} duplicate feeds inside the file will be ignored.",
    importOpmlReviewInvalid: "{{count}} invalid outlines will be ignored.",
    importOpmlMissingFetchIntervalLabel: "Fetch Interval (Minutes)",
    importOpmlMissingFetchIntervalPlaceholder: "e.g. 60",
    importOpmlMissingFetchIntervalHelp: "Default for missing entries: 60 Minutes. This value only applies to the {{count}} imported feeds that do not already define one. Set 0 for manual refresh.",
    importOpmlMissingFetchIntervalRequired: "Enter a Fetch Interval before importing these feeds.",
    confirmImportOpml: "Import sources",
    importOpmlComplete: "OPML import complete",
    importOpmlCompleteDesc: "Added {{inserted}}, updated {{updated}}, skipped {{duplicates}} duplicates, ignored {{invalid}} invalid entries.",
    importOpmlFailed: "OPML import failed",
    importOpmlNoFeeds: "No valid RSS feeds found in this OPML file",
    importOpmlNoFeedsDesc: "The file did not contain any importable outlines with xmlUrl.",
    rssAtomFeed: "RSS/Atom Feed",
};

const commonTranslations: Record<string, string> = {
    active: "Active",
    inactive: "Inactive",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    error: "Error",
};

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const namespace = options?.ns ?? ns ?? "common";
            const dictionary = namespace === "common" ? commonTranslations : sourceTranslations;
            return translate(dictionary[key] ?? key, options);
        },
    }),
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({
        toast: toastMock,
    }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: openMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
    readTextFile: readTextFileMock,
}));

vi.mock("@/lib/source-opml", () => ({
    normalizeSourceUrl: (url: string) => url.trim().replace(/\/+$/, ""),
    parseOpmlText: parseOpmlTextMock,
}));

vi.mock("@/lib/source-events", () => ({
    addSourceFetchSyncListener: vi.fn(() => () => {}),
    dispatchSourceFetchSyncEvent: vi.fn(),
}));

vi.mock("@/lib/source-fetch", () => ({
    fetchSource: fetchSourceMock,
    fetchSources: fetchSourcesMock,
}));

vi.mock("@/lib/source-service", () => ({
    listSources: listSourcesMock,
    setSourceActive: setSourceActiveMock,
    deleteSource: deleteSourceMock,
    importOpmlSources: importOpmlSourcesMock,
}));

vi.mock("@/components/layout/PageShell", () => ({
    PageShell: ({ header, children }: { header?: { actions?: ReactNode }; children: ReactNode }) => (
        <div>
            <div>{header?.actions}</div>
            <div>{children}</div>
        </div>
    ),
}));

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }: { open?: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
    const React = await import("react");

    const DropdownMenuContext = React.createContext<{
        open: boolean;
        setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    } | null>(null);

    function useDropdownMenuContext() {
        const context = React.useContext(DropdownMenuContext);
        if (!context) {
            throw new Error("Dropdown menu context is missing.");
        }

        return context;
    }

    return {
        DropdownMenu: ({ children }: { children: ReactNode }) => {
            const [open, setOpen] = React.useState(false);
            return (
                <DropdownMenuContext.Provider value={{ open, setOpen }}>
                    {children}
                </DropdownMenuContext.Provider>
            );
        },
        DropdownMenuTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) => {
            const { open, setOpen } = useDropdownMenuContext();

            if (asChild && React.isValidElement(children)) {
                const child = children as React.ReactElement<{ onClick?: (event: unknown) => void }>;
                return React.cloneElement(child, {
                    onClick: (event: unknown) => {
                        child.props.onClick?.(event);
                        setOpen(!open);
                    },
                });
            }

            return <button onClick={() => setOpen(!open)}>{children}</button>;
        },
        DropdownMenuContent: ({ children }: { children: ReactNode }) => {
            const { open } = useDropdownMenuContext();
            return open ? <div>{children}</div> : null;
        },
        DropdownMenuItem: ({
            children,
            disabled,
            onSelect,
        }: {
            children: ReactNode;
            disabled?: boolean;
            onSelect?: (event: { preventDefault: () => void }) => void;
        }) => {
            const { setOpen } = useDropdownMenuContext();
            return (
                <button
                    disabled={disabled}
                    onClick={() => {
                        onSelect?.({ preventDefault() {} });
                        setOpen(false);
                    }}
                >
                    {children}
                </button>
            );
        },
    };
});

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === label,
    );

    if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Button "${label}" not found.`);
    }

    return button;
}

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
}

async function changeInput(input: HTMLInputElement, value: string) {
    await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
}

async function openAddSourceMenu(container: HTMLElement) {
    await click(findButton(container, "Add Source"));
}

describe("SourceManager", () => {
    let container: HTMLDivElement;
    let root: Root;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        toastMock.mockReset();
        listSourcesMock.mockReset();
        setSourceActiveMock.mockReset();
        deleteSourceMock.mockReset();
        importOpmlSourcesMock.mockReset();
        fetchSourceMock.mockReset();
        fetchSourcesMock.mockReset();
        openMock.mockReset();
        readTextFileMock.mockReset();
        parseOpmlTextMock.mockReset();

        listSourcesMock.mockResolvedValue([{
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
        fetchSourceMock.mockResolvedValue({
            insertedCount: 0,
            fetchedCount: 0,
            successCount: 1,
            failCount: 0,
        });
        fetchSourcesMock.mockResolvedValue({
            insertedCount: 0,
            fetchedCount: 0,
            successCount: 1,
            failCount: 0,
        });
        importOpmlSourcesMock.mockResolvedValue({
            insertedCount: 1,
            updatedCount: 0,
            skippedDuplicateCount: 0,
            skippedInvalidCount: 0,
        });
        parseOpmlTextMock.mockReturnValue({
            entries: [{
                name: "Imported Feed",
                url: "https://imported.example.com/feed.xml",
                active: true,
                fetchInterval: 15,
            }],
            skippedDuplicateCount: 0,
            skippedInvalidCount: 0,
        });
        openMock.mockResolvedValue("/tmp/import.opml");
        readTextFileMock.mockResolvedValue("<opml />");

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    async function renderView() {
        await act(async () => {
            root.render(
                <MemoryRouter>
                    <SourceManager />
                </MemoryRouter>,
            );
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        });
    }

    it("replaces the page-level export button with an Add Source dropdown", async () => {
        await renderView();

        expect(container.textContent).not.toContain("Export OPML");

        await openAddSourceMenu(container);

        expect(findButton(container, "Create Source")).toBeDefined();
        expect(findButton(container, "Import OPML")).toBeDefined();
    });

    it("imports directly when there are no duplicate URLs or missing fetch intervals", async () => {
        await renderView();

        await openAddSourceMenu(container);
        await click(findButton(container, "Import OPML"));

        expect(openMock).toHaveBeenCalledWith({
            title: "Import OPML sources",
            filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
            multiple: false,
            directory: false,
        });
        expect(readTextFileMock).toHaveBeenCalledWith("/tmp/import.opml");
        expect(parseOpmlTextMock).toHaveBeenCalledWith("<opml />");
        expect(importOpmlSourcesMock).toHaveBeenCalledWith([{
            name: "Imported Feed",
            url: "https://imported.example.com/feed.xml",
            active: true,
            fetchInterval: 15,
        }], "skip", null);
        expect(container.textContent).not.toContain("Review OPML import");
    });

    it("shows the duplicate review dialog after the file is selected", async () => {
        parseOpmlTextMock.mockReturnValueOnce({
            entries: [{
                name: "Duplicate Feed",
                url: "https://example.com/feed.xml",
                active: true,
                fetchInterval: 15,
            }],
            skippedDuplicateCount: 0,
            skippedInvalidCount: 0,
        });

        await renderView();

        await openAddSourceMenu(container);
        await click(findButton(container, "Import OPML"));

        expect(container.textContent).toContain("Review OPML import");
        expect(container.textContent).toContain("1 feeds already exist in Sources.");
        expect(container.textContent).toContain("Skip duplicates");
        expect(container.textContent).toContain("Overwrite existing");
        expect(container.textContent).not.toContain("Ignore feed URLs that already exist in Sources and keep the current records.");
        expect(container.textContent).not.toContain("When a feed URL already exists, update the matching source name and refresh settings.");
        const skipButton = findButton(container, "Skip duplicates");
        expect(skipButton.className).toContain("bg-amber-400");
        expect(skipButton.className).not.toContain("bg-slate-950");
        expect(container.innerHTML).toContain("bg-amber-50/95");

        await click(skipButton);

        expect(importOpmlSourcesMock).toHaveBeenCalledWith([{
            name: "Duplicate Feed",
            url: "https://example.com/feed.xml",
            active: true,
            fetchInterval: 15,
        }], "skip", null);
    });

    it("requires a fetch interval when imported entries omit it", async () => {
        parseOpmlTextMock.mockReturnValueOnce({
            entries: [{
                name: "Missing Interval Feed",
                url: "https://imported.example.com/feed.xml",
                active: true,
                fetchInterval: null,
            }],
            skippedDuplicateCount: 0,
            skippedInvalidCount: 0,
        });

        await renderView();

        await openAddSourceMenu(container);
        await click(findButton(container, "Import OPML"));

        expect(container.textContent).toContain("1 feeds need a Fetch Interval before they can be imported.");
        expect(container.textContent).not.toContain("Skip duplicates");

        const input = container.querySelector('input[type="number"]');
        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Expected the missing fetch interval input to be rendered.");
        }
        expect(input.value).toBe("60");
        expect(container.textContent).toContain("Fetch Interval (Minutes)");
        expect(container.textContent).toContain("Default for missing entries: 60 Minutes.");

        const importButton = findButton(container, "Import sources");
        expect(importButton.className).toContain("bg-amber-400");
        expect(importButton.className).not.toContain("bg-slate-950");

        await click(importButton);

        expect(importOpmlSourcesMock).toHaveBeenCalledWith([{
            name: "Missing Interval Feed",
            url: "https://imported.example.com/feed.xml",
            active: true,
            fetchInterval: null,
        }], "skip", 60);
    });

    it("shows both duplicate options and the missing interval input when both checks fail", async () => {
        parseOpmlTextMock.mockReturnValueOnce({
            entries: [{
                name: "Duplicate Feed",
                url: "https://example.com/feed.xml",
                active: true,
                fetchInterval: null,
            }],
            skippedDuplicateCount: 1,
            skippedInvalidCount: 2,
        });

        await renderView();

        await openAddSourceMenu(container);
        await click(findButton(container, "Import OPML"));

        expect(container.textContent).toContain("1 feeds already exist in Sources.");
        expect(container.textContent).toContain("1 feeds need a Fetch Interval before they can be imported.");
        expect(container.textContent).toContain("1 duplicate feeds inside the file will be ignored.");
        expect(container.textContent).toContain("2 invalid outlines will be ignored.");

        const input = container.querySelector('input[type="number"]');
        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Expected the missing fetch interval input to be rendered.");
        }
        expect(input.value).toBe("60");

        await changeInput(input, "25");
        await click(findButton(container, "Overwrite existing"));

        expect(importOpmlSourcesMock).toHaveBeenCalledWith([{
            name: "Duplicate Feed",
            url: "https://example.com/feed.xml",
            active: true,
            fetchInterval: null,
        }], "overwrite", 25);
    });
});
