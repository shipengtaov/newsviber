import { type RefObject, useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BackToTopButtonProps = {
    targetRefs: RefObject<HTMLElement | null>[];
    label: string;
    threshold?: number;
    className?: string;
};

function getScrollTargets(targetRefs: RefObject<HTMLElement | null>[]): HTMLElement[] {
    const seenTargets = new Set<HTMLElement>();

    for (const targetRef of targetRefs) {
        const target = targetRef.current;
        if (!(target instanceof HTMLElement) || seenTargets.has(target)) {
            continue;
        }

        seenTargets.add(target);
    }

    return Array.from(seenTargets);
}

function shouldReduceMotion(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollElementToTop(target: HTMLElement, behavior: ScrollBehavior) {
    if (typeof target.scrollTo === "function") {
        target.scrollTo({ top: 0, behavior });
        return;
    }

    target.scrollTop = 0;
    target.dispatchEvent(new Event("scroll"));
}

export function BackToTopButton({
    targetRefs,
    label,
    threshold = 300,
    className,
}: BackToTopButtonProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const targets = getScrollTargets(targetRefs);
        if (targets.length === 0) {
            setIsVisible(false);
            return;
        }

        const syncVisibility = () => {
            setIsVisible(targets.some((target) => target.scrollTop > threshold));
        };

        syncVisibility();

        for (const target of targets) {
            target.addEventListener("scroll", syncVisibility, { passive: true });
        }

        return () => {
            for (const target of targets) {
                target.removeEventListener("scroll", syncVisibility);
            }
        };
    }, [targetRefs, threshold]);

    if (!isVisible) {
        return null;
    }

    const handleClick = () => {
        const behavior: ScrollBehavior = shouldReduceMotion() ? "auto" : "smooth";

        for (const target of getScrollTargets(targetRefs)) {
            scrollElementToTop(target, behavior);
        }
    };

    return (
        <Button
            type="button"
            size="icon"
            onClick={handleClick}
            aria-label={label}
            title={label}
            data-no-window-drag
            className={cn(
                "fixed bottom-4 right-4 z-40 h-10 w-10 rounded-full shadow-elevated md:bottom-5 md:right-5",
                className,
            )}
        >
            <ChevronUp className="h-4 w-4" />
        </Button>
    );
}
