import { RefObject, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const MAIN_MENU_PATHS = new Set(["/", "/sources", "/chat", "/creative", "/settings"]);
const STORAGE_KEY = "mainMenuScrollPositions_v1";
const RESTORE_TOLERANCE_PX = 2;
const MAX_RESTORE_ATTEMPTS = 180;

type ScrollMemoryMap = Record<string, number>;

function isMainMenuPath(pathname: string): boolean {
  return MAIN_MENU_PATHS.has(pathname);
}

function normalizeScrollTop(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function parseStoredMap(raw: string | null): ScrollMemoryMap {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const normalized: ScrollMemoryMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "number") continue;
      normalized[key] = normalizeScrollTop(value);
    }
    return normalized;
  } catch {
    return {};
  }
}

function persistMap(map: ScrollMemoryMap): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function useMainMenuScrollMemory(containerRef: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const restoreFrameRef = useRef<number | null>(null);
  const restoreAttemptsRef = useRef(0);
  const restoreTargetPathRef = useRef<string | null>(null);
  const restoreTargetTopRef = useRef(0);
  const activePathRef = useRef(pathname);
  const scrollMapRef = useRef<ScrollMemoryMap>(
    parseStoredMap(sessionStorage.getItem(STORAGE_KEY)),
  );

  const savePathScroll = (path: string, scrollTop: number) => {
    if (!isMainMenuPath(path)) return;

    const normalizedTop = normalizeScrollTop(scrollTop);
    if (scrollMapRef.current[path] === normalizedTop) return;

    scrollMapRef.current[path] = normalizedTop;
    persistMap(scrollMapRef.current);
  };

  const cancelRestore = () => {
    if (restoreFrameRef.current !== null) {
      cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    }
    restoreAttemptsRef.current = 0;
    restoreTargetPathRef.current = null;
  };

  const startRestore = (path: string, targetTop: number) => {
    cancelRestore();

    restoreTargetPathRef.current = path;
    restoreTargetTopRef.current = normalizeScrollTop(targetTop);

    const restoreStep = () => {
      const container = containerRef.current;
      if (!container) {
        cancelRestore();
        return;
      }

      if (activePathRef.current !== restoreTargetPathRef.current) {
        cancelRestore();
        return;
      }

      const target = restoreTargetTopRef.current;
      container.scrollTop = target;

      const reached = Math.abs(container.scrollTop - target) <= RESTORE_TOLERANCE_PX;
      if (reached || restoreAttemptsRef.current >= MAX_RESTORE_ATTEMPTS) {
        cancelRestore();
        return;
      }

      restoreAttemptsRef.current += 1;
      restoreFrameRef.current = requestAnimationFrame(restoreStep);
    };

    restoreFrameRef.current = requestAnimationFrame(restoreStep);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (!isMainMenuPath(pathname)) return;
      savePathScroll(pathname, container.scrollTop);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [containerRef, pathname]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isMainMenuPath(pathname)) {
      const latestMap = parseStoredMap(sessionStorage.getItem(STORAGE_KEY));
      scrollMapRef.current = latestMap;
      const target = latestMap[pathname] ?? 0;
      startRestore(pathname, target);
      return;
    }

    cancelRestore();
  }, [containerRef, pathname]);

  useEffect(() => {
    activePathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    return () => {
      cancelRestore();

      const container = containerRef.current;
      const currentPath = activePathRef.current;
      if (container && isMainMenuPath(currentPath)) {
        savePathScroll(currentPath, container.scrollTop);
      }
    };
  }, [containerRef]);
}
