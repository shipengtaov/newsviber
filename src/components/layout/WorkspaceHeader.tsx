import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "warning";

export type WorkspaceStat = {
    label: ReactNode;
    value: ReactNode;
    tone?: Tone;
};

export type WorkspaceHeaderProps = {
    leading?: ReactNode;
    eyebrow?: ReactNode;
    title: ReactNode;
    showTitle?: boolean;
    titlelessLayout?: "default" | "compact";
    description?: ReactNode;
    showDescription?: boolean;
    actions?: ReactNode;
    stats?: WorkspaceStat[];
    showStats?: boolean;
    density?: "default" | "compact";
    children?: ReactNode;
    className?: string;
    titleClassName?: string;
    descriptionClassName?: string;
};

const TONE_CLASS_MAP: Record<Tone, string> = {
    default: "",
    accent: "text-primary",
    warning: "text-amber-600 dark:text-amber-400",
};

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span className={cn("section-kicker", className)}>
            {children}
        </span>
    );
}

export function StatPill({ label, value, tone = "default", className }: WorkspaceStat & { className?: string }) {
    return (
        <span className={cn("stat-pill", className)}>
            <span className="stat-pill-label">{label}:</span>
            <span className={cn("stat-pill-value", TONE_CLASS_MAP[tone])}>{value}</span>
        </span>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    action,
    className,
}: {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("editor-empty workspace-enter", className)}>
            {icon ? <div className="text-muted-foreground">{icon}</div> : null}
            <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">{title}</div>
                {description ? <p className="max-w-xl text-xs leading-5 text-muted-foreground">{description}</p> : null}
            </div>
            {action}
        </div>
    );
}

export function WorkspaceHeader({
    leading,
    eyebrow,
    title,
    showTitle,
    titlelessLayout = "default",
    description,
    showDescription,
    actions,
    stats,
    showStats,
    density = "compact",
    children,
    className,
    titleClassName,
    descriptionClassName,
}: WorkspaceHeaderProps) {
    const shouldRenderVisibleTitle = showTitle ?? true;
    const shouldRenderDescription = showDescription ?? Boolean(description);
    const shouldRenderStats = showStats ?? Boolean(stats && stats.length > 0);
    const shouldRenderTextBlock = shouldRenderVisibleTitle || Boolean(description && shouldRenderDescription);
    const shouldUseCompactTitlelessLayout = !shouldRenderVisibleTitle && titlelessLayout === "compact";

    const statsContent = shouldRenderStats && stats && stats.length > 0 ? (
        <div className="flex flex-wrap gap-2">
            {stats.map((stat, index) => (
                <StatPill key={`${String(stat.label)}-${index}`} {...stat} />
            ))}
        </div>
    ) : null;

    const textBlockContent = shouldRenderTextBlock ? (
        <div className={cn(shouldRenderVisibleTitle && description && shouldRenderDescription ? "space-y-1" : undefined)}>
            {shouldRenderVisibleTitle ? (
                <h1
                    className={cn(
                        "font-semibold tracking-tight text-foreground",
                        density === "compact" ? "text-lg" : "text-xl",
                        titleClassName,
                    )}
                >
                    {title}
                </h1>
            ) : null}
            {description && shouldRenderDescription ? (
                <p className={cn("text-xs leading-5 text-muted-foreground", descriptionClassName)}>
                    {description}
                </p>
            ) : null}
        </div>
    ) : null;

    return (
        <section
            className={cn(
                "surface-panel workspace-enter px-3 py-2",
                className,
            )}
        >
            <div className={cn("flex flex-col", shouldUseCompactTitlelessLayout ? "gap-2" : "gap-2.5")}>
                {shouldUseCompactTitlelessLayout ? (
                    <div className={cn("flex flex-col gap-2", actions ? "lg:flex-row lg:items-center lg:justify-between" : undefined)}>
                        <div className={cn("min-w-0", statsContent || textBlockContent || leading || eyebrow ? "space-y-2" : undefined)}>
                            {leading ? <div className="flex items-center gap-2">{leading}</div> : null}
                            {eyebrow ? <SectionLabel>{eyebrow}</SectionLabel> : null}
                            <h1 className="sr-only">{title}</h1>
                            {textBlockContent}
                            {statsContent}
                        </div>
                        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">{actions}</div> : null}
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 space-y-1.5">
                                {leading ? <div className="flex items-center gap-2">{leading}</div> : null}
                                {eyebrow ? <SectionLabel>{eyebrow}</SectionLabel> : null}
                                {!shouldRenderVisibleTitle ? <h1 className="sr-only">{title}</h1> : null}
                                {textBlockContent}
                            </div>
                            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">{actions}</div> : null}
                        </div>
                        {statsContent}
                    </>
                )}
                {children}
            </div>
        </section>
    );
}
