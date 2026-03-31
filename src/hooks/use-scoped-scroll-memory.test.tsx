// @vitest-environment jsdom

import { act, useEffect, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useScopedScrollMemory } from "@/hooks/use-scoped-scroll-memory";

type HarnessApi = {
    container: HTMLDivElement;
    saveCurrentScopeScroll: () => void;
};

type HarnessProps = {
    storageKey: string;
    scopeKey: string | null;
    onReady: (api: HarnessApi) => void;
};

function TestHarness({ storageKey, scopeKey, onReady }: HarnessProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { saveCurrentScopeScroll } = useScopedScrollMemory({
        containerRef: containerRef as RefObject<HTMLElement | null>,
        storageKey,
        scopeKey,
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        onReady({ container, saveCurrentScopeScroll });
    }, [onReady, saveCurrentScopeScroll]);

    return <div ref={containerRef} />;
}

describe("useScopedScrollMemory", () => {
    let container: HTMLDivElement;
    let root: Root;
    let harnessApi: HarnessApi | null;
    let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
    let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        sessionStorage.clear();
        harnessApi = null;
        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        originalRequestAnimationFrame = window.requestAnimationFrame;
        originalCancelAnimationFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0);
        window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
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
        sessionStorage.clear();
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    function renderHarness(scopeKey: string | null, storageKey = "scoped-scroll-memory-test") {
        act(() => {
            root.render(
                <TestHarness
                    storageKey={storageKey}
                    scopeKey={scopeKey}
                    onReady={(nextApi) => {
                        harnessApi = nextApi;
                    }}
                />,
            );
        });
    }

    async function flushAnimationFrame() {
        await act(async () => {
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 0);
            });
        });
    }

    function requireHarnessApi(): HarnessApi {
        if (!harnessApi) {
            throw new Error("Harness API not ready.");
        }

        return harnessApi;
    }

    it("restores board and project scroll positions independently", async () => {
        renderHarness("automation:board");
        await flushAnimationFrame();

        const api = requireHarnessApi();
        api.container.scrollTop = 120;
        act(() => {
            api.saveCurrentScopeScroll();
        });

        renderHarness("automation:project:7");
        await flushAnimationFrame();

        expect(api.container.scrollTop).toBe(0);

        api.container.scrollTop = 420;
        act(() => {
            api.saveCurrentScopeScroll();
        });

        renderHarness(null);
        await flushAnimationFrame();

        api.container.scrollTop = 75;
        act(() => {
            api.container.dispatchEvent(new Event("scroll"));
            api.saveCurrentScopeScroll();
        });

        renderHarness("automation:project:7");
        await flushAnimationFrame();
        expect(api.container.scrollTop).toBe(420);

        renderHarness("automation:board");
        await flushAnimationFrame();
        expect(api.container.scrollTop).toBe(120);
    });

    it("keeps different project scopes isolated", async () => {
        renderHarness("automation:project:1");
        await flushAnimationFrame();

        const api = requireHarnessApi();
        api.container.scrollTop = 110;
        act(() => {
            api.saveCurrentScopeScroll();
        });

        renderHarness("automation:project:2");
        await flushAnimationFrame();
        expect(api.container.scrollTop).toBe(0);

        api.container.scrollTop = 270;
        act(() => {
            api.saveCurrentScopeScroll();
        });

        renderHarness("automation:project:1");
        await flushAnimationFrame();
        expect(api.container.scrollTop).toBe(110);

        renderHarness("automation:project:2");
        await flushAnimationFrame();
        expect(api.container.scrollTop).toBe(270);
    });
});
