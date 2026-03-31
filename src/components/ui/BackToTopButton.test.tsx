// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackToTopButton } from "@/components/ui/BackToTopButton";

function createMatchMediaResult(matches: boolean) {
    return {
        matches,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    };
}

describe("BackToTopButton", () => {
    let container: HTMLDivElement;
    let root: Root;
    let firstTarget: HTMLDivElement;
    let secondTarget: HTMLDivElement;
    let originalMatchMedia: typeof window.matchMedia | undefined;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
        const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
        previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

        originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaResult(false));

        firstTarget = document.createElement("div");
        secondTarget = document.createElement("div");
        document.body.append(firstTarget, secondTarget);

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });

        container.remove();
        firstTarget.remove();
        secondTarget.remove();
        window.matchMedia = originalMatchMedia as typeof window.matchMedia;
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    });

    function renderButton(targetRefs: Array<{ current: HTMLDivElement | null }>) {
        act(() => {
            root.render(
                <BackToTopButton
                    targetRefs={targetRefs}
                    label="Back to top"
                />,
            );
        });
    }

    function queryButton(): HTMLButtonElement | null {
        const button = container.querySelector('button[aria-label="Back to top"]');
        return button instanceof HTMLButtonElement ? button : null;
    }

    function getButton(): HTMLButtonElement {
        const button = queryButton();
        if (!button) {
            throw new Error("Back-to-top button not found.");
        }

        return button;
    }

    function setScrollTop(target: HTMLDivElement, value: number) {
        target.scrollTop = value;
        act(() => {
            target.dispatchEvent(new Event("scroll"));
        });
    }

    it("stays hidden until any target scroll crosses the threshold", () => {
        renderButton([
            { current: firstTarget },
            { current: secondTarget },
        ]);

        expect(queryButton()).toBeNull();

        setScrollTop(secondTarget, 301);

        expect(getButton()).toBeInstanceOf(HTMLButtonElement);
    });

    it("scrolls each unique target back to the top once", () => {
        const firstScrollTo = vi.fn(({ top }: ScrollToOptions) => {
            firstTarget.scrollTop = top ?? 0;
            firstTarget.dispatchEvent(new Event("scroll"));
        });
        const secondScrollTo = vi.fn(({ top }: ScrollToOptions) => {
            secondTarget.scrollTop = top ?? 0;
            secondTarget.dispatchEvent(new Event("scroll"));
        });

        Object.defineProperty(firstTarget, "scrollTo", {
            value: firstScrollTo as unknown as typeof firstTarget.scrollTo,
            configurable: true,
        });
        Object.defineProperty(secondTarget, "scrollTo", {
            value: secondScrollTo as unknown as typeof secondTarget.scrollTo,
            configurable: true,
        });

        renderButton([
            { current: firstTarget },
            { current: firstTarget },
            { current: secondTarget },
        ]);

        setScrollTop(firstTarget, 360);
        setScrollTop(secondTarget, 420);

        act(() => {
            getButton().click();
        });

        expect(firstScrollTo).toHaveBeenCalledTimes(1);
        expect(secondScrollTo).toHaveBeenCalledTimes(1);
        expect(firstScrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
        expect(secondScrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
        expect(firstTarget.scrollTop).toBe(0);
        expect(secondTarget.scrollTop).toBe(0);
        expect(queryButton()).toBeNull();
    });
});
