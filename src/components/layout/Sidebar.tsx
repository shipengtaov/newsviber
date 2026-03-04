import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Newspaper, Rss, MessageSquare, Lightbulb, Settings } from "lucide-react";

export function Sidebar() {
    const location = useLocation();
    const navItems = [
        { name: "News", path: "/", icon: Newspaper },
        { name: "Sources", path: "/sources", icon: Rss },
        { name: "Global Chat", path: "/chat", icon: MessageSquare },
        { name: "Creative Space", path: "/creative", icon: Lightbulb },
        { name: "Settings", path: "/settings", icon: Settings },
    ];

    return (
        <div className="flex h-full w-64 flex-col border-r bg-muted/20">
            <div className="p-6 flex items-center space-x-3">
                <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                    <Newspaper className="h-5 w-5" />
                </div>
                <div className="font-bold text-xl tracking-tight">GetNews</div>
            </div>
            <nav className="flex-1 space-y-1 px-4 mt-2">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
                    return (
                        <Link
                            key={item.name}
                            to={item.path}
                            className={cn(
                                "flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-muted/80 hover:text-primary",
                                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            <span>{item.name}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t text-xs text-muted-foreground text-center">
                GetNews Beta v0.1
            </div>
        </div>
    );
}
