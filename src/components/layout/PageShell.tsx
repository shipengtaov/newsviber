import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type WorkspaceHeaderProps, WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { CONTENT_GUTTER_X_CLASS } from "@/components/layout/layout-spacing";

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
    default: `${CONTENT_GUTTER_X_CLASS} py-5 md:py-7`,
    workspace: `${CONTENT_GUTTER_X_CLASS} py-3 md:py-4 lg:py-5`,
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
