// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    checkMock,
    getAppVersionMock,
    isTauriMock,
    relaunchMock,
    toastMock,
} = vi.hoisted(() => ({
    checkMock: vi.fn(),
    getAppVersionMock: vi.fn(),
    isTauriMock: vi.fn(),
    relaunchMock: vi.fn(),
    toastMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
    isTauri: isTauriMock,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
    check: checkMock,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
    relaunch: relaunchMock,
}));

vi.mock("@/lib/version", () => ({
    APP_VERSION: "26.2.0",
    getAppVersion: getAppVersionMock,
}));

vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({
        toast: toastMock,
    }),
}));

vi.mock("react-i18next", () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: { ns?: string }) => {
            const namespace = options?.ns ?? ns ?? "common";
            const translations: Record<string, Record<string, string>> = {
                common: {
                    close: "Close",
                },
                settings: {
                    currentVersion: "Current Version",
                    updateDialogTitle: "Update Available",
                    updateDialogDesc: "A signed update is available for download and installation.",
                    updateVersionLabel: "Latest Version",
                    updatePublishedLabel: "Published",
                    updateReleaseNotes: "Release Notes",
                    installUpdate: "Install Update",
                    installingUpdate: "Installing Update...",
                    downloadPreparing: "Preparing download...",
                    restartToFinish: "Restart to Finish Update",
                    restartToFinishDesc: "The update has been installed. Restart News Viber to finish applying it.",
                    restartNow: "Restart Now",
                    updateRestartFailed: "Restart Failed",
                },
            };

            return translations[namespace]?.[key] ?? key;
        },
    }),
}));

vi.mock("@/components/ui/button", () => ({
    Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
        <button {...props}>{children}</button>
    ),
}));

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { AppUpdateProvider } from "@/components/update/AppUpdateProvider";

type MockUpdate = {
    body?: string;
    close: ReturnType<typeof vi.fn>;
    currentVersion: string;
    date?: string;
    downloadAndInstall: ReturnType<typeof vi.fn>;
    version: string;
};

function createMockUpdate(overrides: Partial<MockUpdate> = {}): MockUpdate {
    return {
        body: "Release notes",
        close: vi.fn().mockResolvedValue(undefined),
        currentVersion: "26.2.0",
        date: "2026-03-22T09:55:32Z",
        downloadAndInstall: vi.fn().mockResolvedValue(undefined),
        version: "26.3.0",
        ...overrides,
    };
}

describe("AppUpdateProvider", () => {
    let container: HTMLDivElement;
    let root: Root;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        checkMock.mockReset();
        getAppVersionMock.mockReset();
        isTauriMock.mockReset();
        relaunchMock.mockReset();
        toastMock.mockReset();
        getAppVersionMock.mockResolvedValue("26.2.0");
        isTauriMock.mockReturnValue(true);

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
        document.body.innerHTML = "";
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    async function flushAsyncWork() {
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
    }

    function renderProvider() {
        act(() => {
            root.render(
                <AppUpdateProvider>
                    <div>App</div>
                </AppUpdateProvider>,
            );
        });
    }

    it("opens a minimal update dialog when a startup check finds an update", async () => {
        checkMock.mockResolvedValue(createMockUpdate());

        renderProvider();
        await flushAsyncWork();

        const text = document.body.textContent ?? "";

        expect(text).toContain("Update Available");
        expect(text).toContain("Install Update");
        expect(text).toContain("Close");
        expect(text).not.toContain("A signed update is available for download and installation.");
        expect(text).not.toContain("Current Version");
        expect(text).not.toContain("Latest Version");
        expect(text).not.toContain("Published");
        expect(text).not.toContain("Release Notes");
        expect(text).not.toContain("Release notes");
    });

    it("keeps install progress visible and switches to restart-only actions after success", async () => {
        let resolveInstall: (() => void) | null = null;
        const update = createMockUpdate({
            downloadAndInstall: vi.fn((onEvent: (event: {
                data: { chunkLength?: number; contentLength?: number | null };
                event: "Finished" | "Progress" | "Started";
            }) => void) => {
                onEvent({
                    event: "Started",
                    data: { contentLength: 1024 },
                });
                onEvent({
                    event: "Progress",
                    data: { chunkLength: 512 },
                });

                return new Promise<void>((resolve) => {
                    resolveInstall = resolve;
                });
            }),
        });
        checkMock.mockResolvedValue(update);

        renderProvider();
        await flushAsyncWork();

        const installButton = Array.from(document.querySelectorAll("button"))
            .find((button) => button.textContent === "Install Update");
        if (!installButton) {
            throw new Error("Install button not found.");
        }

        act(() => {
            installButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await flushAsyncWork();

        let text = document.body.textContent ?? "";
        expect(text).toContain("Installing Update...");
        expect(text).toContain("512 B / 1 KB");

        await act(async () => {
            resolveInstall?.();
            await Promise.resolve();
        });
        await flushAsyncWork();

        text = document.body.textContent ?? "";
        expect(text).toContain("Restart to Finish Update");
        expect(text).toContain("Restart Now");
        expect(text).not.toContain("The update has been installed. Restart News Viber to finish applying it.");
    });
});
