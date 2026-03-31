import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useOutletContext } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { useMainMenuScrollMemory } from "@/hooks/use-main-menu-scroll-memory";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CONTENT_GUTTER_LEFT_CLASS } from "@/components/layout/layout-spacing";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebarCollapsed_v1";
const TITLEBAR_HEIGHT = 46;
const TRAFFIC_LIGHT_X = 14;
const TRAFFIC_LIGHT_Y = 14;
const MAC_TRAFFIC_LIGHT_DIAMETER = 12;
const MAC_TRAFFIC_LIGHT_GAP = 8;
const TRAFFIC_LIGHT_GROUP_WIDTH = MAC_TRAFFIC_LIGHT_DIAMETER * 3 + MAC_TRAFFIC_LIGHT_GAP * 2;
const TOGGLE_BUTTON_SIZE = 28;
const TOGGLE_BUTTON_GAP = 14;
const TOGGLE_BUTTON_LEFT = TRAFFIC_LIGHT_X + TRAFFIC_LIGHT_GROUP_WIDTH + TOGGLE_BUTTON_GAP;
const TOGGLE_BUTTON_TOP = TRAFFIC_LIGHT_Y + MAC_TRAFFIC_LIGHT_DIAMETER / 2 - TOGGLE_BUTTON_SIZE / 2;
const NON_DRAGGABLE_TITLEBAR_TARGETS = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[contenteditable='true']",
    "[data-no-window-drag]",
].join(", ");

function isNonDraggableTitlebarTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(NON_DRAGGABLE_TITLEBAR_TARGETS) !== null;
}

export type MainLayoutOutletContext = {
    mainScrollRef: RefObject<HTMLElement | null>;
};

export function useMainLayoutScrollContainer(): RefObject<HTMLElement | null> {
    return useOutletContext<MainLayoutOutletContext>().mainScrollRef;
}

export function MainLayout() {
    const { t } = useTranslation();
    const mainRef = useRef<HTMLElement>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
        try {
            return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });

    useMainMenuScrollMemory(mainRef);

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? "1" : "0");
        } catch {
            // Ignore persistence failures (e.g. storage restrictions).
        }
    }, [isSidebarCollapsed]);

    const handleTitlebarMouseDown = async (event: MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0 || isNonDraggableTitlebarTarget(event.target) || !isTauri()) {
            return;
        }

        try {
            await getCurrentWindow().startDragging();
        } catch (error) {
            console.error("Failed to start window dragging", error);
        }
    };

    const layoutShellStyle = {
        "--layout-titlebar-height": `${TITLEBAR_HEIGHT + 8}px`,
        "--layout-titlebar-safe-height": `${TITLEBAR_HEIGHT + 6}px`,
    } as CSSProperties;

    return (
        <div className="relative h-screen w-full overflow-hidden bg-background text-foreground">
            <div data-layout-shell="true" className="relative flex h-full w-full overflow-hidden" style={layoutShellStyle}>
                <div
                    data-layout-titlebar="true"
                    data-tauri-drag-region
                    onMouseDown={handleTitlebarMouseDown}
                    className="absolute inset-x-0 top-0 z-20 h-[var(--layout-titlebar-height)] border-b border-border bg-background"
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarCollapsed((value) => !value)}
                    data-no-window-drag
                    aria-label={isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
                    className="absolute z-30 text-muted-foreground hover:bg-muted hover:text-foreground"
                    style={{ left: TOGGLE_BUTTON_LEFT, top: TOGGLE_BUTTON_TOP, width: TOGGLE_BUTTON_SIZE, height: TOGGLE_BUTTON_SIZE }}
                >
                    {isSidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                </Button>
                <Sidebar collapsed={isSidebarCollapsed} />
                <div data-layout-main-column="true" className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                    <main ref={mainRef} className={`min-w-0 flex-1 overflow-y-auto ${CONTENT_GUTTER_LEFT_CLASS} pr-2 pb-2 pt-[var(--layout-titlebar-safe-height)] md:pr-3 md:pb-3`}>
                        <Outlet context={{ mainScrollRef: mainRef }} />
                    </main>
                </div>
            </div>
            <Toaster />
        </div>
    );
}
