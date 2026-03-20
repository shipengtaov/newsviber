import { getVersion as getTauriAppVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";

export const APP_VERSION = __APP_VERSION__;

let versionPromise: Promise<string> | null = null;

export async function getAppVersion(): Promise<string> {
    if (!isTauri()) {
        return APP_VERSION;
    }

    versionPromise ??= getTauriAppVersion().catch((error) => {
        console.error("Failed to read native app version:", error);
        return APP_VERSION;
    });

    return versionPromise;
}

export function resetAppVersionCacheForTests(): void {
    versionPromise = null;
}
