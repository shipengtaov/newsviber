export const CREATIVE_SYNC_EVENT = "creative-sync";

export function dispatchCreativeSyncEvent(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new Event(CREATIVE_SYNC_EVENT));
}

export function addCreativeSyncListener(listener: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    window.addEventListener(CREATIVE_SYNC_EVENT, listener);
    return () => {
        window.removeEventListener(CREATIVE_SYNC_EVENT, listener);
    };
}
