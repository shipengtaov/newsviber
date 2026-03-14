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
    default: "border-border/60 bg-background/72",
    accent: "border-primary/20 bg-accent/70",
    warning: "border-amber-300/50 bg-amber-100/75 text-amber-950",
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
        <div className={cn("stat-pill", TONE_CLASS_MAP[tone], className)}>
            <div className="stat-pill-label">{label}</div>
            <div className="stat-pill-value">{value}</div>
        </div>
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
            {icon ? <div className="text-primary/70">{icon}</div> : null}
            <div className="space-y-1">
                <div className="font-display text-lg font-semibold text-foreground">{title}</div>
                {description ? <p className="max-w-xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
            </div>
            {action}
        </div>
    );
}

export function WorkspaceHeader({
    leading,
    eyebrow,
    title,
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
    const shouldRenderDescription = showDescription ?? Boolean(description);
    const shouldRenderStats = showStats ?? Boolean(stats && stats.length > 0);

    return (
        <section
            className={cn(
                "surface-panel workspace-enter",
                density === "compact" ? "px-4 py-4 md:px-5 md:py-5" : "px-5 py-5 md:px-7 md:py-7",
                className,
            )}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-white/70" aria-hidden="true" />
            <div className={cn("flex flex-col", density === "compact" ? "gap-3.5" : "gap-5")}>
                <div className={cn("flex flex-col", density === "compact" ? "gap-3.5 lg:flex-row lg:items-start lg:justify-between" : "gap-5 lg:flex-row lg:items-start lg:justify-between")}>
                    <div className={cn("min-w-0", density === "compact" ? "space-y-2" : "space-y-3")}>
                        {leading ? <div className="flex items-center gap-2">{leading}</div> : null}
                        {eyebrow ? <SectionLabel className={density === "compact" ? "px-2.5 py-0.5 text-[10px]" : undefined}>{eyebrow}</SectionLabel> : null}
                        <div className={cn(density === "compact" ? "space-y-1.5" : "space-y-2")}>
                            <h1
                                className={cn(
                                    "font-display font-semibold tracking-[-0.04em] text-foreground",
                                    density === "compact" ? "text-2xl md:text-[1.9rem]" : "text-3xl md:text-[2.3rem]",
                                    titleClassName,
                                )}
                            >
                                {title}
                            </h1>
                            {description && shouldRenderDescription ? (
                                <p
                                    className={cn(
                                        "max-w-3xl text-muted-foreground",
                                        density === "compact" ? "text-sm leading-6" : "text-sm leading-7 md:text-base",
                                        descriptionClassName,
                                    )}
                                >
                                    {description}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">{actions}</div> : null}
                </div>
                {shouldRenderStats && stats && stats.length > 0 ? (
                    <div className={cn("flex flex-wrap", density === "compact" ? "gap-2.5" : "gap-3")}>
                        {stats.map((stat, index) => (
                            <StatPill key={`${String(stat.label)}-${index}`} {...stat} />
                        ))}
                    </div>
                ) : null}
                {children}
            </div>
        </section>
    );
}
