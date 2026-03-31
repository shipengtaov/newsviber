import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Newspaper, Rss, MessageSquare, Bot, Settings } from "lucide-react";
import { addAutomationSyncListener } from "@/lib/automation-events";
import { listAutomationProjects } from "@/lib/automation-service";
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
    unreadScope?: "news" | "automation";
};

export function Sidebar({ collapsed }: SidebarProps) {
    const { t } = useTranslation();
    const location = useLocation();
    const { currentVersion } = useAppUpdate();
    const [hasNewsUnread, setHasNewsUnread] = useState(false);
    const [hasAutomationUnread, setHasAutomationUnread] = useState(false);
    const navItems: NavItem[] = [
        { name: t("nav.news"), path: "/", icon: Newspaper, unreadScope: "news" },
        { name: t("nav.automation"), path: "/automation", icon: Bot, unreadScope: "automation" },
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

        async function refreshAutomationUnreadState() {
            try {
                const projects = await listAutomationProjects();
                if (!isDisposed) {
                    setHasAutomationUnread(projects.some((project) => project.unread_report_count > 0));
                }
            } catch (error) {
                console.error("Failed to refresh sidebar automation unread state", error);
            }
        }

        void refreshNewsUnreadState();
        void refreshAutomationUnreadState();

        const removeNewsSyncListener = addNewsSyncListener(() => {
            void refreshNewsUnreadState();
        });
        const removeAutomationSyncListener = addAutomationSyncListener(() => {
            void refreshAutomationUnreadState();
        });

        return () => {
            isDisposed = true;
            removeNewsSyncListener();
            removeAutomationSyncListener();
        };
    }, []);

    return (
        <aside
            data-sidebar-shell="true"
            className={cn(
                "relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-150 ease-out motion-reduce:transition-none",
                collapsed ? "w-16" : "w-56",
            )}
        >
                <div className="flex h-full flex-col px-1.5 pb-2 pt-[var(--layout-titlebar-safe-height)]">
                <div
                    data-sidebar-brand="true"
                    className={cn(
                        "grid items-center px-2 py-1.5 transition-[grid-template-columns,column-gap] duration-150 ease-out motion-reduce:transition-none",
                        collapsed ? "grid-cols-[2rem_0fr] gap-0" : "grid-cols-[2rem_minmax(0,1fr)] gap-2",
                    )}
                >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="42" strokeLinecap="round">
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
                        <div className="text-lg font-semibold tracking-tight text-foreground">{t("appName")}</div>
                    </div>
                </div>

                <nav className="mt-2 flex-1 space-y-0.5 px-0.5">
                    {navItems.map((item) => {
                        const isActive = item.path === "/"
                            ? location.pathname === "/" || location.pathname.startsWith("/news/")
                            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                        const hasUnreadIndicator = item.unreadScope === "news"
                            ? hasNewsUnread
                            : item.unreadScope === "automation"
                                ? hasAutomationUnread
                                : false;
                        return (
                            <Link
                                key={item.name}
                                to={item.path}
                                title={item.name}
                                aria-current={isActive ? "page" : undefined}
                                data-active={isActive ? "true" : "false"}
                                className={cn(
                                    "group relative grid items-center rounded-md py-1.5 text-sm font-medium transition-colors duration-100",
                                    collapsed ? "grid-cols-[1.25rem_0fr] gap-0 px-2.5" : "grid-cols-[1.25rem_minmax(0,1fr)] gap-2 px-2.5",
                                    isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
                                                    isActive ? "unread-badge-active ring-primary" : "ring-card"
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
                <div className={cn("px-3 py-2 text-[11px] text-muted-foreground", collapsed && "text-center px-1")}>
                    <span
                        className={cn(
                            "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
                            contentTransitionClass,
                        )}
                    >
                        v{currentVersion}
                    </span>
                </div>
            </div>
        </aside>
    );
}
