export const SOURCE_FETCH_SYNC_EVENT = "source-fetch-sync";

export function dispatchSourceFetchSyncEvent(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new Event(SOURCE_FETCH_SYNC_EVENT));
}

export function addSourceFetchSyncListener(listener: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    window.addEventListener(SOURCE_FETCH_SYNC_EVENT, listener);
    return () => {
        window.removeEventListener(SOURCE_FETCH_SYNC_EVENT, listener);
    };
}
