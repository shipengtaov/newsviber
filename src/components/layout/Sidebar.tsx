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
    const contentTransitionClass = collapsed
        ? "pointer-events-none -translate-x-2 opacity-0"
        : "translate-x-0 opacity-100";

    return (
        <aside
            className={cn(
                "surface-panel flex h-full shrink-0 flex-col overflow-hidden px-2 py-3 transition-[width] duration-200 ease-out motion-reduce:transition-none",
                collapsed ? "w-20" : "w-[18.75rem]",
            )}
        >
            <div className="overflow-hidden rounded-[1.35rem] border border-white/60 bg-background/56 px-2 py-4 shadow-soft backdrop-blur-sm">
                <div
                    className={cn(
                        "grid items-center transition-[grid-template-columns,column-gap] duration-200 ease-out motion-reduce:transition-none",
                        collapsed ? "grid-cols-[3rem_0fr] gap-0" : "grid-cols-[3rem_minmax(0,1fr)] gap-3",
                    )}
                >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-primary text-primary-foreground shadow-glow">
                        <Newspaper className="h-5 w-5" />
                    </div>
                    <div
                        className={cn(
                            "min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
                            contentTransitionClass,
                        )}
                    >
                        <div className="font-display text-[1.45rem] font-semibold tracking-[-0.05em] text-foreground">GetNews</div>
                    </div>
                </div>
            </div>

            <nav className="mt-4 flex-1 space-y-1.5 px-2">
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
                                "group relative grid items-center rounded-[1.15rem] py-3 text-sm font-medium transition-[background-color,color,box-shadow,transform,grid-template-columns,column-gap,padding] duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none",
                                collapsed ? "grid-cols-[1.25rem_0fr] gap-0 px-3.5" : "grid-cols-[1.25rem_minmax(0,1fr)] gap-3 px-3.5",
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
                                    "min-w-0 overflow-hidden whitespace-nowrap text-left transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
                                    contentTransitionClass,
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
                        "overflow-hidden whitespace-nowrap text-center transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
                        contentTransitionClass,
                    )}
                >
                    Warm paper UI · Beta v0.1
                </div>
            </div>
        </aside>
    );
}
