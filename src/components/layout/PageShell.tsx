import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
    children: ReactNode;
    className?: string;
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
    default: "p-8",
    workspace: "px-4 py-4 md:px-6 md:py-6 lg:px-4 lg:py-4",
};

export function PageShell({ children, className, size = "default", variant = "default" }: PageShellProps) {
    return (
        <div className={cn("mx-auto w-full", PADDING_CLASS_MAP[variant], SIZE_CLASS_MAP[variant][size], className)}>
            {children}
        </div>
    );
}
