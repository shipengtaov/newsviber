// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalChat from "@/views/GlobalChat";

const DESKTOP_LAYOUT_MEDIA_QUERY = "(min-width: 1024px)";
const SCOPE_PANEL_COLLAPSED_STORAGE_KEY = "globalChatScopePanelCollapsed_v1";

const {
    mockDeleteGlobalChatThread,
    mockGetGlobalChatThread,
    mockListGlobalChatContextArticles,
    mockListGlobalChatMessages,
    mockListGlobalChatSources,
    mockListGlobalChatThreads,
    mockPersistGlobalChatMessage,
    mockReplaceMessages,
    mockSaveGlobalChatThreadScope,
    mockSend,
    mockToast,
} = vi.hoisted(() => ({
    mockDeleteGlobalChatThread: vi.fn(),
    mockGetGlobalChatThread: vi.fn(),
    mockListGlobalChatContextArticles: vi.fn(),
    mockListGlobalChatMessages: vi.fn(),
    mockListGlobalChatSources: vi.fn(),
    mockListGlobalChatThreads: vi.fn(),
    mockPersistGlobalChatMessage: vi.fn(),
    mockReplaceMessages: vi.fn(),
    mockSaveGlobalChatThreadScope: vi.fn(),
    mockSend: vi.fn(),
    mockToast: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const namespace = typeof options?.ns === "string" ? options.ns : ns;
            if (namespace === "common") {
                return key;
            }

            switch (key) {
                case "eyebrow":
                    return "Global chat";
                case "title":
                    return "Chat across sources";
                case "newChat":
                    return "New chat";
                case "conversations":
                    return "Conversations";
                case "savedThreads":
                    return "Saved threads";
                case "startNewThread":
                    return "Start new thread";
                case "liveThread":
                    return "Live thread";
                case "scopeChangesNote":
                    return "Scope changes apply to future messages.";
                case "threadScope":
                    return "Thread scope";
                case "contextFilters":
                    return "Context filters";
                case "tuneDescription":
                    return "Tune the time range and sources.";
                case "expandThreadScope":
                    return "Expand thread scope";
                case "collapseThreadScope":
                    return "Collapse thread scope";
                case "currentScope":
                    return "Current scope";
                case "timeRange":
                    return "Time range";
                case "last24Hours":
                    return "Last 24 hours";
                case "last3Days":
                    return "Last 3 days";
                case "last7Days":
                    return "Last 7 days";
                case "last30Days":
                    return "Last 30 days";
                case "customRange":
                    return "Custom range";
                case "dataSources":
                    return "Data sources";
                case "useAllActiveSources":
                    return "Use all active sources";
                case "allActiveSources":
                    return "All active sources";
                case "allNActiveSources":
                    return `${options?.count ?? 0} active sources`;
                case "nSelectedSources":
                    return `${options?.count ?? 0} selected sources`;
                case "usingAllActiveSources":
                    return `Using ${options?.count ?? 0} active sources`;
                case "selectedActiveSources":
                    return `${options?.count ?? 0} active sources selected`;
                case "startScopedConversation":
                    return "Start a scoped conversation";
                case "startScopedDesc":
                    return "Ask about the current filtered context.";
                case "loadingConversation":
                    return "Loading conversation";
                case "askAboutRecentNews":
                    return "Ask about recent news";
                case "noActiveSourcesAvailable":
                    return "No active sources available";
                case "activateOrAddSource":
                    return "Activate or add a source.";
                case "timeRangeLabel":
                    return "Time range";
                case "sourceScopeLabel":
                    return "Sources";
                default:
                    return namespace ? `${namespace}:${key}` : key;
            }
        },
    }),
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({
        toast: mockToast,
    }),
}));

vi.mock("@/hooks/use-streaming-conversation", () => ({
    useStreamingConversation: () => ({
        messages: [],
        isStreaming: false,
        streamPhase: "idle",
        send: mockSend,
        replaceMessages: mockReplaceMessages,
    }),
}));

vi.mock("@/lib/global-chat-service", () => {
    type MockGlobalChatScopeInput = {
        title?: string;
        time_range_mode: "preset" | "custom";
        preset_days: number | null;
        custom_start_date: string | null;
        custom_end_date: string | null;
        source_ids: number[];
    };

    const DEFAULT_SCOPE = {
        time_range_mode: "preset" as const,
        preset_days: 7,
        custom_start_date: null,
        custom_end_date: null,
        source_ids: [] as number[],
    };

    function normalizeGlobalChatScopeInput(input: Partial<MockGlobalChatScopeInput> = {}) {
        if (input.time_range_mode === "custom") {
            return {
                title: input.title?.trim() || undefined,
                time_range_mode: "custom" as const,
                preset_days: null,
                custom_start_date: input.custom_start_date ?? "2026-03-19",
                custom_end_date: input.custom_end_date ?? input.custom_start_date ?? "2026-03-19",
                source_ids: Array.isArray(input.source_ids) ? input.source_ids : [],
            };
        }

        return {
            title: input.title?.trim() || undefined,
            time_range_mode: "preset" as const,
            preset_days: typeof input.preset_days === "number" ? input.preset_days : DEFAULT_SCOPE.preset_days,
            custom_start_date: null,
            custom_end_date: null,
            source_ids: Array.isArray(input.source_ids) ? input.source_ids : [],
        };
    }

    return {
        buildGlobalChatTitle: vi.fn((content: string) => content.trim()),
        createDefaultGlobalChatScopeInput: vi.fn(() => ({ ...DEFAULT_SCOPE })),
        createGlobalChatCustomRangeFromPresetDays: vi.fn(() => ({
            custom_start_date: "2026-03-13",
            custom_end_date: "2026-03-19",
        })),
        deleteGlobalChatThread: mockDeleteGlobalChatThread,
        formatGlobalChatContextLine: vi.fn(() => "Context line"),
        formatLocalDateInputValue: vi.fn(() => "2026-03-19"),
        getGlobalChatThread: mockGetGlobalChatThread,
        listGlobalChatContextArticles: mockListGlobalChatContextArticles,
        listGlobalChatMessages: mockListGlobalChatMessages,
        listGlobalChatSources: mockListGlobalChatSources,
        listGlobalChatThreads: mockListGlobalChatThreads,
        normalizeGlobalChatScopeInput,
        persistGlobalChatMessage: mockPersistGlobalChatMessage,
        saveGlobalChatThreadScope: mockSaveGlobalChatThreadScope,
    };
});

vi.mock("@/components/layout/WorkspaceHeader", () => ({
    WorkspaceHeader: ({ title, actions }: { title: ReactNode; actions?: ReactNode }) => (
        <div data-testid="workspace-header">
            <div>{title}</div>
            {actions}
        </div>
    ),
    EmptyState: ({ title, description }: { title: ReactNode; description?: ReactNode }) => (
        <div data-testid="empty-state">
            <div>{title}</div>
            {description ? <div>{description}</div> : null}
        </div>
    ),
}));

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
    ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
    ),
}));

vi.mock("@/components/ui/select", () => ({
    Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => <div id={id}>{children}</div>,
    SelectValue: () => <span />,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <div data-value={value}>{children}</div>,
}));

vi.mock("@/components/chat/ChatMarkdown", () => ({
    ChatMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

describe("GlobalChat scope panel defaults", () => {
    let container: HTMLDivElement;
    let root: Root;
    let desktopLayoutMatches = true;
    let originalMatchMedia: typeof window.matchMedia | undefined;
    let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        mockToast.mockReset();
        mockDeleteGlobalChatThread.mockReset();
        mockGetGlobalChatThread.mockReset();
        mockListGlobalChatContextArticles.mockReset();
        mockListGlobalChatMessages.mockReset();
        mockListGlobalChatSources.mockReset();
        mockListGlobalChatThreads.mockReset();
        mockPersistGlobalChatMessage.mockReset();
        mockReplaceMessages.mockReset();
        mockSaveGlobalChatThreadScope.mockReset();
        mockSend.mockReset();

        mockDeleteGlobalChatThread.mockResolvedValue(undefined);
        mockGetGlobalChatThread.mockResolvedValue(null);
        mockListGlobalChatContextArticles.mockResolvedValue([]);
        mockListGlobalChatMessages.mockResolvedValue([]);
        mockListGlobalChatSources.mockResolvedValue([]);
        mockListGlobalChatThreads.mockResolvedValue([]);
        mockPersistGlobalChatMessage.mockResolvedValue(1);
        mockSaveGlobalChatThreadScope.mockResolvedValue({
            id: 1,
            title: "Thread",
            time_range_mode: "preset",
            preset_days: 7,
            custom_start_date: null,
            custom_end_date: null,
            source_ids: [],
            created_at: "2026-03-19T00:00:00Z",
            updated_at: "2026-03-19T00:00:00Z",
        });

        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

        originalMatchMedia = window.matchMedia;
        originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        desktopLayoutMatches = true;
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === DESKTOP_LAYOUT_MEDIA_QUERY ? desktopLayoutMatches : false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        HTMLElement.prototype.scrollIntoView = vi.fn();

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        document.body.innerHTML = "";
        localStorage.clear();
        sessionStorage.clear();
        window.matchMedia = originalMatchMedia as typeof window.matchMedia;
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView as typeof HTMLElement.prototype.scrollIntoView;
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    function renderGlobalChat(initialEntry = "/chat") {
        act(() => {
            root.render(
                <MemoryRouter initialEntries={[initialEntry]}>
                    <Routes>
                        <Route path="/chat" element={<GlobalChat />} />
                        <Route path="/chat/:threadId" element={<GlobalChat />} />
                    </Routes>
                </MemoryRouter>,
            );
        });
    }

    async function flushAsyncWork() {
        await act(async () => {
            await Promise.resolve();
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 0);
            });
        });
    }

    async function settleGlobalChat() {
        await flushAsyncWork();
        await flushAsyncWork();
    }

    function findButtonByLabel(label: string): HTMLButtonElement | null {
        const button = Array.from(container.querySelectorAll("button")).find((candidate) => (
            candidate.getAttribute("aria-label") === label
        ));

        return button instanceof HTMLButtonElement ? button : null;
    }

    function findButtonByText(text: string): HTMLButtonElement | null {
        const button = Array.from(container.querySelectorAll("button")).find((candidate) => (
            candidate.textContent?.includes(text)
        ));

        return button instanceof HTMLButtonElement ? button : null;
    }

    function getChatInput(): HTMLInputElement {
        const chatInput = container.querySelector('input[placeholder="Ask about recent news"]');
        expect(chatInput).toBeInstanceOf(HTMLInputElement);
        return chatInput as HTMLInputElement;
    }

    function getRootLayout(): HTMLDivElement {
        const rootLayout = container.firstElementChild;
        expect(rootLayout).toBeInstanceOf(HTMLDivElement);
        return rootLayout as HTMLDivElement;
    }

    function getMainSplitLayout(): HTMLDivElement {
        const mainSplitLayout = getRootLayout().lastElementChild;
        expect(mainSplitLayout).toBeInstanceOf(HTMLDivElement);
        return mainSplitLayout as HTMLDivElement;
    }

    function getThreadsPanel(): HTMLElement {
        const startNewThreadButton = Array.from(container.querySelectorAll("button")).find((candidate) => (
            candidate.textContent?.includes("Start new thread")
        ));
        expect(startNewThreadButton).toBeInstanceOf(HTMLButtonElement);

        const threadsPanel = startNewThreadButton?.closest("aside");
        expect(threadsPanel).toBeInstanceOf(HTMLElement);
        return threadsPanel as HTMLElement;
    }

    function getThreadsScrollContainer(): HTMLDivElement {
        const scrollContainer = Array.from(getThreadsPanel().children).find((child) => (
            child instanceof HTMLDivElement
            && child.className.includes("max-h-72")
            && child.className.includes("flex-1")
        ));

        expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
        return scrollContainer as HTMLDivElement;
    }

    function getConversationSection(): HTMLElement {
        const conversationSection = getChatInput().closest("section");
        expect(conversationSection).toBeInstanceOf(HTMLElement);
        return conversationSection as HTMLElement;
    }

    function getConversationScrollContainer(): HTMLDivElement {
        const conversationScrollContainer = getConversationSection().children.item(1);
        expect(conversationScrollContainer).toBeInstanceOf(HTMLDivElement);
        return conversationScrollContainer as HTMLDivElement;
    }

    it("defaults the desktop scope panel to collapsed when no stored preference exists", async () => {
        renderGlobalChat();
        await settleGlobalChat();

        expect(findButtonByLabel("Expand thread scope")).not.toBeNull();
        expect(findButtonByLabel("Collapse thread scope")).toBeNull();
        expect(container.textContent).not.toContain("Context filters");
        expect(localStorage.getItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY)).toBe("true");
    });

    it("keeps the desktop scope panel expanded when a stored false preference exists", async () => {
        localStorage.setItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY, "false");

        renderGlobalChat();
        await settleGlobalChat();

        expect(findButtonByLabel("Expand thread scope")).toBeNull();
        expect(findButtonByLabel("Collapse thread scope")).not.toBeNull();
        expect(container.textContent).toContain("Context filters");
        expect(localStorage.getItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY)).toBe("false");
    });

    it("keeps the desktop scope panel collapsed when a stored true preference exists", async () => {
        localStorage.setItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY, "true");

        renderGlobalChat();
        await settleGlobalChat();

        expect(findButtonByLabel("Expand thread scope")).not.toBeNull();
        expect(findButtonByLabel("Collapse thread scope")).toBeNull();
        expect(container.textContent).not.toContain("Context filters");
        expect(localStorage.getItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY)).toBe("true");
    });

    it("does not render the collapsed desktop variant on mobile layouts", async () => {
        desktopLayoutMatches = false;
        localStorage.setItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY, "true");

        renderGlobalChat();
        await settleGlobalChat();

        expect(findButtonByLabel("Expand thread scope")).toBeNull();
        expect(findButtonByLabel("Collapse thread scope")).toBeNull();
        expect(container.textContent).toContain("Context filters");
        expect(localStorage.getItem(SCOPE_PANEL_COLLAPSED_STORAGE_KEY)).toBe("true");
    });

    it("constrains the desktop chat workspace inside the page height", async () => {
        renderGlobalChat();
        await settleGlobalChat();

        const rootLayout = getRootLayout();
        const mainSplitLayout = getMainSplitLayout();
        const conversationColumns = mainSplitLayout.lastElementChild;

        expect(rootLayout.className).toContain("h-full");
        expect(rootLayout.className).toContain("min-h-0");
        expect(rootLayout.className).toContain("overflow-hidden");
        expect(rootLayout.className).not.toContain("min-h-full");

        expect(mainSplitLayout.className).toContain("min-h-0");
        expect(mainSplitLayout.className).toContain("flex-1");
        expect(mainSplitLayout.className).toContain("overflow-hidden");

        expect(conversationColumns).toBeInstanceOf(HTMLDivElement);
        expect((conversationColumns as HTMLDivElement).className).toContain("min-h-0");
        expect((conversationColumns as HTMLDivElement).className).toContain("flex-1");
        expect((conversationColumns as HTMLDivElement).className).toContain("overflow-hidden");
    });

    it("keeps the threads list and conversation body as independent internal scroll regions on desktop", async () => {
        renderGlobalChat();
        await settleGlobalChat();

        const threadsPanel = getThreadsPanel();
        const threadsScrollContainer = getThreadsScrollContainer();
        const conversationSection = getConversationSection();
        const conversationScrollContainer = getConversationScrollContainer();

        expect(threadsPanel.className).toContain("h-full");
        expect(threadsPanel.className).toContain("min-h-0");

        expect(threadsScrollContainer.className).toContain("max-h-72");
        expect(threadsScrollContainer.className).toContain("min-h-0");
        expect(threadsScrollContainer.className).toContain("flex-1");

        expect(conversationSection.className).toContain("min-h-0");
        expect(conversationSection.className).toContain("flex-1");
        expect(conversationSection.className).toContain("overflow-hidden");

        expect(conversationScrollContainer.className).toContain("min-h-0");
        expect(conversationScrollContainer.className).toContain("flex-1");
    });

    it("focuses the chat input after clicking new chat from an existing thread", async () => {
        mockGetGlobalChatThread.mockResolvedValue({
            id: 1,
            title: "Thread",
            time_range_mode: "preset",
            preset_days: 7,
            custom_start_date: null,
            custom_end_date: null,
            source_ids: [],
            created_at: "2026-03-19T00:00:00Z",
            updated_at: "2026-03-19T00:00:00Z",
        });
        mockListGlobalChatMessages.mockResolvedValue([
            { role: "user", content: "Existing thread message" },
        ]);

        renderGlobalChat("/chat/1");
        await settleGlobalChat();

        const newChatButton = findButtonByText("New chat");
        const chatInput = getChatInput();

        expect(newChatButton).toBeInstanceOf(HTMLButtonElement);

        act(() => {
            newChatButton?.focus();
            newChatButton?.click();
        });
        await settleGlobalChat();

        expect(document.activeElement).toBe(chatInput);
    });
});
