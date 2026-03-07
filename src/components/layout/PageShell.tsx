import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
    children: ReactNode;
    className?: string;
    size?: "default" | "wide";
};

const SIZE_CLASS_MAP: Record<NonNullable<PageShellProps["size"]>, string> = {
    default: "max-w-5xl",
    wide: "max-w-6xl",
};

export function PageShell({ children, className, size = "default" }: PageShellProps) {
    return (
        <div className={cn("w-full mx-auto p-8", SIZE_CLASS_MAP[size], className)}>
            {children}
        </div>
    );
}
