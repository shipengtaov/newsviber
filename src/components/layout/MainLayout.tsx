import { useRef } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { useMainMenuScrollMemory } from "@/hooks/use-main-menu-scroll-memory";

export function MainLayout() {
    const mainRef = useRef<HTMLElement>(null);
    useMainMenuScrollMemory(mainRef);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            <Sidebar />
            <main ref={mainRef} className="flex-1 overflow-y-auto min-w-0">
                <Outlet />
            </main>
            <Toaster />
        </div>
    );
}
