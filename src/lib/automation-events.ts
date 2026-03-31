export const AUTOMATION_SYNC_EVENT = "automation-sync";

export function dispatchAutomationSyncEvent(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new Event(AUTOMATION_SYNC_EVENT));
}

export function addAutomationSyncListener(listener: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    window.addEventListener(AUTOMATION_SYNC_EVENT, listener);
    return () => {
        window.removeEventListener(AUTOMATION_SYNC_EVENT, listener);
    };
}
