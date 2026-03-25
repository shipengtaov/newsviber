import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Newspaper, Rss, MessageSquare, Lightbulb, Settings } from "lucide-react";
import { addCreativeSyncListener } from "@/lib/creative-events";
import { listCreativeProjects } from "@/lib/creative-service";
import { addNewsSyncListener } from "@/lib/news-events";
import { listNewsSources } from "@/lib/news-service";
import { useAppUpdate } from "@/components/update/AppUpdateProvider";

type SidebarProps = {
    collapsed: boolean;
};

type NavItem = {
    name: string;
    path: string;
    icon: typeof Newspaper;
    unreadScope?: "news" | "creative";
};

export function Sidebar({ collapsed }: SidebarProps) {
    const { t } = useTranslation();
    const location = useLocation();
    const { currentVersion } = useAppUpdate();
    const [hasNewsUnread, setHasNewsUnread] = useState(false);
    const [hasCreativeUnread, setHasCreativeUnread] = useState(false);
    const navItems: NavItem[] = [
        { name: t("nav.news"), path: "/", icon: Newspaper, unreadScope: "news" },
        { name: t("nav.creativeSpace"), path: "/creative", icon: Lightbulb, unreadScope: "creative" },
        { name: t("nav.chat"), path: "/chat", icon: MessageSquare },
        { name: t("nav.sources"), path: "/sources", icon: Rss },
        { name: t("nav.settings"), path: "/settings", icon: Settings },
    ];
    const contentTransitionClass = collapsed
        ? "pointer-events-none -translate-x-2 opacity-0"
        : "translate-x-0 opacity-100";

    useEffect(() => {
        let isDisposed = false;

        async function refreshNewsUnreadState() {
            try {
                const sources = await listNewsSources();
                if (!isDisposed) {
                    setHasNewsUnread(sources.some((source) => source.unread_count > 0));
                }
            } catch (error) {
                console.error("Failed to refresh sidebar news unread state", error);
            }
        }

        async function refreshCreativeUnreadState() {
            try {
                const projects = await listCreativeProjects();
                if (!isDisposed) {
                    setHasCreativeUnread(projects.some((project) => project.unread_card_count > 0));
                }
            } catch (error) {
                console.error("Failed to refresh sidebar creative unread state", error);
            }
        }

        void refreshNewsUnreadState();
        void refreshCreativeUnreadState();

        const removeNewsSyncListener = addNewsSyncListener(() => {
            void refreshNewsUnreadState();
        });
        const removeCreativeSyncListener = addCreativeSyncListener(() => {
            void refreshCreativeUnreadState();
        });

        return () => {
            isDisposed = true;
            removeNewsSyncListener();
            removeCreativeSyncListener();
        };
    }, []);

    return (
        <aside
            data-sidebar-shell="true"
            className={cn(
                "relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-r border-white/45 bg-background/58 shadow-soft backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none",
                collapsed ? "w-20" : "w-64",
            )}
        >
            <div className="flex h-full flex-col px-2 pb-3 pt-[var(--layout-titlebar-safe-height)] md:pb-4">
                <div
                    data-sidebar-brand="true"
                    className={cn(
                        "grid items-center rounded-[1.35rem] px-2 py-3 transition-[grid-template-columns,column-gap] duration-200 ease-out motion-reduce:transition-none",
                        collapsed ? "grid-cols-[3rem_0fr] gap-0" : "grid-cols-[3rem_minmax(0,1fr)] gap-3",
                    )}
                >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-primary text-primary-foreground shadow-glow">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="42" strokeLinecap="round">
                            <path d="M 120 200 C 180 150, 240 250, 300 200 C 350 160, 392 200, 392 200" />
                            <path d="M 120 280 C 180 230, 240 330, 300 280 C 350 240, 392 280, 392 280" />
                            <path d="M 120 360 C 180 310, 240 410, 300 360 C 350 320, 392 360, 392 360" />
                        </svg>
                    </div>
                    <div
                        className={cn(
                            "min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
                            contentTransitionClass,
                        )}
                    >
                        <div className="font-display text-[1.45rem] font-semibold tracking-[-0.05em] text-foreground">{t("appName")}</div>
                    </div>
                </div>

                <nav className="mt-4 flex-1 space-y-1.5 px-2">
                    {navItems.map((item) => {
                        const isActive = item.path === "/"
                            ? location.pathname === "/" || location.pathname.startsWith("/news/")
                            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                        const hasUnreadIndicator = item.unreadScope === "news"
                            ? hasNewsUnread
                            : item.unreadScope === "creative"
                                ? hasCreativeUnread
                                : false;
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
                                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                                    <item.icon className="h-4 w-4 shrink-0" />
                                    {hasUnreadIndicator ? (
                                        <div className="unread-badge-container">
                                            <div
                                                aria-hidden="true"
                                                data-sidebar-unread={item.unreadScope}
                                                className={cn(
                                                    "unread-badge",
                                                    isActive ? "ring-primary" : "ring-background/90"
                                                )}
                                            />
                                        </div>
                                    ) : null}
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
                        v{currentVersion}
                    </div>
                </div>
            </div>
        </aside>
    );
}
