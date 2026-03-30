import { isTauri } from "@tauri-apps/api/core";
import type { FetchFunction } from "@ai-sdk/provider-utils";

let tauriFetchPromise: Promise<FetchFunction | null> | null = null;

async function loadTauriFetch(): Promise<FetchFunction | null> {
  if (!isTauri()) {
    return null;
  }

  if (!tauriFetchPromise) {
    tauriFetchPromise = import("@tauri-apps/plugin-http")
      .then((module) => module.fetch as FetchFunction)
      .catch(() => null);
  }

  return tauriFetchPromise;
}

export const runtimeFetch: FetchFunction = async (input, init) => {
  const tauriFetch = await loadTauriFetch();
  if (tauriFetch) {
    return tauriFetch(input as URL | Request | string, init as RequestInit);
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("No fetch implementation is available.");
  }

  return globalThis.fetch(input as RequestInfo | URL, init as RequestInit);
};
