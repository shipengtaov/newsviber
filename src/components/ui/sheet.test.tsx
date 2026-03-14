// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

describe("Sheet", () => {
    let container: HTMLDivElement;
    let root: Root;
    let previousActEnvironment: boolean | undefined;

    beforeEach(() => {
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

    function renderSheet(showOverlay?: boolean) {
        act(() => {
            root.render(
                <Sheet open onOpenChange={() => undefined}>
                    <SheetContent showOverlay={showOverlay}>
                        <SheetHeader>
                            <SheetTitle>Panel</SheetTitle>
                            <SheetDescription>Testing sheet rendering.</SheetDescription>
                        </SheetHeader>
                    </SheetContent>
                </Sheet>,
            );
        });
    }

    it("renders the overlay by default", () => {
        renderSheet();

        expect(document.body.querySelector('[data-slot="sheet-overlay"]')).not.toBeNull();
        expect(document.body.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
    });

    it("does not render the overlay when showOverlay is false", () => {
        renderSheet(false);

        expect(document.body.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
        expect(document.body.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
    });
});
