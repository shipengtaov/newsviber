import { type RefObject, useEffect, useRef } from "react";

const RESTORE_TOLERANCE_PX = 2;
const MAX_RESTORE_ATTEMPTS = 180;

type ScrollMemoryMap = Record<string, number>;

type UseScopedScrollMemoryOptions = {
    containerRef: RefObject<HTMLElement | null>;
    storageKey: string;
    scopeKey: string | null;
};

function normalizeScrollTop(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function parseStoredMap(raw: string | null): ScrollMemoryMap {
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return {};
        }

        const normalized: ScrollMemoryMap = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value !== "number") {
                continue;
            }

            normalized[key] = normalizeScrollTop(value);
        }

        return normalized;
    } catch {
        return {};
    }
}

function readStoredMap(storageKey: string): ScrollMemoryMap {
    try {
        return parseStoredMap(sessionStorage.getItem(storageKey));
    } catch {
        return {};
    }
}

function persistStoredMap(storageKey: string, map: ScrollMemoryMap): void {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify(map));
    } catch {
        // Ignore persistence failures (e.g. storage restrictions).
    }
}

export function useScopedScrollMemory({
    containerRef,
    storageKey,
    scopeKey,
}: UseScopedScrollMemoryOptions): { saveCurrentScopeScroll: () => void } {
    const restoreFrameRef = useRef<number | null>(null);
    const restoreAttemptsRef = useRef(0);
    const restoreTargetScopeRef = useRef<string | null>(null);
    const restoreTargetTopRef = useRef(0);
    const activeScopeRef = useRef(scopeKey);
    const scrollMapRef = useRef<ScrollMemoryMap>(readStoredMap(storageKey));

    const saveScopeScroll = (targetScopeKey: string, scrollTop: number) => {
        const normalizedTop = normalizeScrollTop(scrollTop);
        if (scrollMapRef.current[targetScopeKey] === normalizedTop) {
            return;
        }

        scrollMapRef.current[targetScopeKey] = normalizedTop;
        persistStoredMap(storageKey, scrollMapRef.current);
    };

    const cancelRestore = () => {
        if (restoreFrameRef.current !== null) {
            cancelAnimationFrame(restoreFrameRef.current);
            restoreFrameRef.current = null;
        }

        restoreAttemptsRef.current = 0;
        restoreTargetScopeRef.current = null;
    };

    const startRestore = (targetScopeKey: string, targetTop: number) => {
        cancelRestore();

        restoreTargetScopeRef.current = targetScopeKey;
        restoreTargetTopRef.current = normalizeScrollTop(targetTop);

        const restoreStep = () => {
            const container = containerRef.current;
            if (!container) {
                cancelRestore();
                return;
            }

            if (activeScopeRef.current !== restoreTargetScopeRef.current) {
                cancelRestore();
                return;
            }

            const restoreTargetTop = restoreTargetTopRef.current;
            container.scrollTop = restoreTargetTop;

            const reachedTarget = Math.abs(container.scrollTop - restoreTargetTop) <= RESTORE_TOLERANCE_PX;
            if (reachedTarget || restoreAttemptsRef.current >= MAX_RESTORE_ATTEMPTS) {
                cancelRestore();
                return;
            }

            restoreAttemptsRef.current += 1;
            restoreFrameRef.current = requestAnimationFrame(restoreStep);
        };

        restoreFrameRef.current = requestAnimationFrame(restoreStep);
    };

    const saveCurrentScopeScroll = () => {
        const container = containerRef.current;
        const currentScopeKey = activeScopeRef.current;

        if (!container || currentScopeKey === null) {
            return;
        }

        saveScopeScroll(currentScopeKey, container.scrollTop);
    };

    useEffect(() => {
        activeScopeRef.current = scopeKey;
    }, [scopeKey]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const handleScroll = () => {
            if (scopeKey === null) {
                return;
            }

            saveScopeScroll(scopeKey, container.scrollTop);
        };

        container.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            container.removeEventListener("scroll", handleScroll);
        };
    }, [containerRef, scopeKey, storageKey]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        scrollMapRef.current = readStoredMap(storageKey);

        if (scopeKey === null) {
            cancelRestore();
            return;
        }

        startRestore(scopeKey, scrollMapRef.current[scopeKey] ?? 0);
    }, [containerRef, scopeKey, storageKey]);

    useEffect(() => {
        return () => {
            cancelRestore();
            saveCurrentScopeScroll();
        };
    }, [containerRef, storageKey]);

    return { saveCurrentScopeScroll };
}
