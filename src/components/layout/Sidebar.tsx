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
        { name: "Creative Space", path: "/creative", icon: Lightbulb },
        { name: "Chat", path: "/chat", icon: MessageSquare },
        { name: "Sources", path: "/sources", icon: Rss },
        { name: "Settings", path: "/settings", icon: Settings },
    ];

    return (
        <aside
            className={cn(
                "surface-panel flex h-full flex-col transition-[width,padding] duration-300 ease-out",
                collapsed ? "w-20 px-2 py-2" : "w-[18.75rem] px-3 py-3",
            )}
        >
            <div className="overflow-hidden rounded-[1.35rem] border border-white/60 bg-background/56 px-3 py-4 shadow-soft backdrop-blur-sm">
                <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-primary text-primary-foreground shadow-glow">
                    <Newspaper className="h-5 w-5" />
                </div>
                    <div
                        className={cn(
                            "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200",
                            collapsed ? "ml-0 max-w-0 opacity-0" : "ml-0 max-w-[220px] opacity-100",
                        )}
                    >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Signal Hub</div>
                        <div className="mt-1 font-display text-[1.45rem] font-semibold tracking-[-0.05em] text-foreground">GetNews</div>
                        <div className="mt-1 text-sm text-muted-foreground">Information workspace</div>
                    </div>
                </div>
            </div>

            <div className={cn("px-2 pt-4", collapsed && "px-1")}>
                <div
                    className={cn(
                        "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-opacity",
                        collapsed ? "opacity-0" : "opacity-100",
                    )}
                >
                    Navigate
                </div>
            </div>

            <nav className={cn("mt-3 flex-1 space-y-1.5 px-2", collapsed && "px-1")}>
                {navItems.map((item) => {
                    const isActive = item.path === "/"
                        ? location.pathname === "/" || location.pathname.startsWith("/news/")
                        : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                    return (
                        <Link
                            key={item.name}
                            to={item.path}
                            title={item.name}
                            aria-current={isActive ? "page" : undefined}
                            data-active={isActive ? "true" : "false"}
                            className={cn(
                                "group relative flex items-center rounded-[1.15rem] py-3 text-sm font-medium transition-all duration-200 motion-safe:hover:-translate-y-0.5",
                                collapsed ? "justify-center px-2.5" : "px-3.5",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-glow"
                                    : "text-muted-foreground hover:bg-background/72 hover:text-foreground",
                            )}
                        >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
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
            <div className={cn("mt-3 rounded-[1.25rem] border border-white/60 bg-background/56 px-3 py-4 text-xs text-muted-foreground shadow-soft", collapsed && "px-2")}>
                <div
                    className={cn(
                        "overflow-hidden whitespace-nowrap text-center transition-[max-width,opacity,margin] duration-200",
                        collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
                    )}
                >
                    Warm paper UI · Beta v0.1
                </div>
            </div>
        </aside>
    );
}
