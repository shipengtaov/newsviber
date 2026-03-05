import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Newspaper, Rss, MessageSquare, Lightbulb, Settings } from "lucide-react";

type SidebarProps = {
    collapsed: boolean;
};

export function Sidebar({ collapsed }: SidebarProps) {
    const location = useLocation();
    const navItems = [
        { name: "News", path: "/", icon: Newspaper },
        { name: "Sources", path: "/sources", icon: Rss },
        { name: "Global Chat", path: "/chat", icon: MessageSquare },
        { name: "Creative Space", path: "/creative", icon: Lightbulb },
        { name: "Settings", path: "/settings", icon: Settings },
    ];

    return (
        <div
            className={cn(
                "flex h-full flex-col border-r bg-muted/20 transition-[width] duration-300 ease-out",
                collapsed ? "w-16" : "w-64",
            )}
        >
            <div className="flex items-center border-b overflow-hidden px-3 py-4">
                <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                    <Newspaper className="h-5 w-5" />
                </div>
                <div
                    className={cn(
                        "whitespace-nowrap font-bold text-xl tracking-tight overflow-hidden transition-[max-width,opacity,margin] duration-200",
                        collapsed ? "ml-0 max-w-0 opacity-0" : "ml-3 max-w-[180px] opacity-100",
                    )}
                >
                    GetNews
                </div>
            </div>
            <nav className="mt-3 flex-1 space-y-1 px-3">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
                    return (
                        <Link
                            key={item.name}
                            to={item.path}
                            title={item.name}
                            className={cn(
                                "flex items-center rounded-lg py-2.5 text-sm font-medium transition-all hover:bg-muted/80 hover:text-primary",
                                "px-3",
                                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                            )}
                        >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                <item.icon className="h-4 w-4 shrink-0" />
                            </span>
                            <span
                                className={cn(
                                    "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200",
                                    collapsed ? "ml-0 max-w-0 opacity-0" : "ml-3 max-w-[180px] opacity-100",
                                )}
                            >
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>
            <div className="border-t px-3 py-4 text-xs text-muted-foreground">
                <div
                    className={cn(
                        "overflow-hidden whitespace-nowrap text-center transition-[max-width,opacity,margin] duration-200",
                        collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
                    )}
                >
                    GetNews Beta v0.1
                </div>
            </div>
        </div>
    );
}
