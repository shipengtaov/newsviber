import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";

export function MainLayout() {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            <Sidebar />
            <main className="flex-1 overflow-y-auto min-w-0">
                <Outlet />
            </main>
            <Toaster />
        </div>
    );
}
