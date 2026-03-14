import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type WorkspaceHeaderProps, WorkspaceHeader } from "@/components/layout/WorkspaceHeader";

type PageShellProps = {
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    header?: WorkspaceHeaderProps;
    size?: "default" | "wide";
    variant?: "default" | "workspace";
};

const SIZE_CLASS_MAP: Record<
    NonNullable<PageShellProps["variant"]>,
    Record<NonNullable<PageShellProps["size"]>, string>
> = {
    default: {
        default: "max-w-5xl",
        wide: "max-w-6xl",
    },
    workspace: {
        default: "max-w-6xl",
        wide: "max-w-7xl",
    },
};

const PADDING_CLASS_MAP: Record<NonNullable<PageShellProps["variant"]>, string> = {
    default: "px-4 py-5 md:px-8 md:py-7",
    workspace: "px-4 py-3 md:px-6 md:py-4 lg:px-8 lg:py-5",
};

export function PageShell({
    children,
    className,
    contentClassName,
    header,
    size = "default",
    variant = "default",
}: PageShellProps) {
    return (
        <div className={cn("mx-auto w-full", PADDING_CLASS_MAP[variant], SIZE_CLASS_MAP[variant][size], className)}>
            <div className="space-y-4 md:space-y-6">
                {header ? <WorkspaceHeader {...header} /> : null}
                <div className={contentClassName}>{children}</div>
            </div>
        </div>
    );
}
