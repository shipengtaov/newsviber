import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useOutletContext } from "react-router-dom";
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

    return (
        <div className="relative h-screen w-full overflow-hidden bg-background text-foreground">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_48%)]" />
                <div className="absolute right-[-8%] top-[12%] h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(251,191,36,0.18),_transparent_68%)] blur-3xl" />
                <div className="absolute bottom-[-10%] left-[18%] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.1),_transparent_72%)] blur-3xl" />
            </div>
            <div className="absolute inset-x-0 top-0 z-20 px-3 pt-3 md:px-4" style={{ height: TITLEBAR_HEIGHT + 12 }}>
                <div
                    data-tauri-drag-region
                    onMouseDown={handleTitlebarMouseDown}
                    className="surface-panel absolute inset-0 rounded-[1.4rem] border-white/50 bg-background/70"
                />
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed((value) => !value)}
                data-no-window-drag
                aria-label={isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
                className="absolute z-30 border border-border/50 bg-background/60 text-muted-foreground shadow-soft backdrop-blur-sm hover:bg-card/90 hover:text-foreground"
                style={{ left: TOGGLE_BUTTON_LEFT, top: TOGGLE_BUTTON_TOP, width: TOGGLE_BUTTON_SIZE, height: TOGGLE_BUTTON_SIZE }}
            >
                {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            <div className="relative z-10 flex h-full w-full overflow-hidden px-3 pb-3 pt-2 md:px-4 md:pb-4" style={{ paddingTop: TITLEBAR_HEIGHT + 10 }}>
                <Sidebar collapsed={isSidebarCollapsed} />
                <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto pl-3 md:pl-4">
                    <Outlet context={{ mainScrollRef: mainRef }} />
                </main>
            </div>
            <Toaster />
        </div>
    );
}
