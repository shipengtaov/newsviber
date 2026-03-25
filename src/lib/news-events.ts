export const NEWS_SYNC_EVENT = "news-sync";

export function dispatchNewsSyncEvent(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new Event(NEWS_SYNC_EVENT));
}

export function addNewsSyncListener(listener: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    window.addEventListener(NEWS_SYNC_EVENT, listener);
    return () => {
        window.removeEventListener(NEWS_SYNC_EVENT, listener);
    };
}
