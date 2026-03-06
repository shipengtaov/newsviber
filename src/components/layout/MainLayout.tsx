import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Outlet } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { useMainMenuScrollMemory } from "@/hooks/use-main-menu-scroll-memory";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebarCollapsed_v1";
const TITLEBAR_HEIGHT = 46;
const TRAFFIC_LIGHT_X = 14;
const TRAFFIC_LIGHT_Y = 14;
const MAC_TRAFFIC_LIGHT_DIAMETER = 12;
const MAC_TRAFFIC_LIGHT_GAP = 8;
const TRAFFIC_LIGHT_GROUP_WIDTH = MAC_TRAFFIC_LIGHT_DIAMETER * 3 + MAC_TRAFFIC_LIGHT_GAP * 2;
const TOGGLE_BUTTON_SIZE = 34;
const TOGGLE_BUTTON_GAP = 20;
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

export function MainLayout() {
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

    return (
        <div className="relative h-screen w-full overflow-hidden bg-background">
            <div className="absolute inset-x-0 top-0 z-20" style={{ height: TITLEBAR_HEIGHT }}>
                <div
                    data-tauri-drag-region
                    onMouseDown={handleTitlebarMouseDown}
                    className="absolute inset-0 border-b bg-background/90 backdrop-blur"
                />
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed((value) => !value)}
                data-no-window-drag
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="absolute z-30 rounded-xl bg-transparent hover:bg-transparent"
                style={{ left: TOGGLE_BUTTON_LEFT, top: TOGGLE_BUTTON_TOP, width: TOGGLE_BUTTON_SIZE, height: TOGGLE_BUTTON_SIZE }}
            >
                {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            <div className="flex h-full w-full overflow-hidden" style={{ paddingTop: TITLEBAR_HEIGHT }}>
                <Sidebar collapsed={isSidebarCollapsed} />
                <main ref={mainRef} className="flex-1 overflow-y-auto min-w-0">
                    <Outlet />
                </main>
            </div>
            <Toaster />
        </div>
    );
}
