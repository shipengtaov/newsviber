import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db";

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

const { loadMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: loadMock,
  },
}));

function setWindow(value: Window | Record<string, unknown>): void {
  Object.defineProperty(globalThis, "window", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("shared database loader", () => {
  beforeEach(() => {
    resetDbForTests();
    loadMock.mockReset();
    setWindow({
      __TAURI_INTERNALS__: {
        invoke: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();

    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as { window?: Window }).window;
    }
  });

  it("waits for the Tauri bridge before loading the SQLite database", async () => {
    vi.useFakeTimers();

    const database = { path: "sqlite:newsviber.db" };
    loadMock.mockResolvedValue(database);
    setWindow({});

    const dbPromise = getDb();
    await Promise.resolve();

    expect(loadMock).not.toHaveBeenCalled();

    setWindow({
      __TAURI_INTERNALS__: {
        invoke: vi.fn(),
      },
    });

    await vi.advanceTimersByTimeAsync(20);

    await expect(dbPromise).resolves.toBe(database);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient SQLite startup failures and caches the resolved connection", async () => {
    vi.useFakeTimers();

    const database = { path: "sqlite:newsviber.db" };
    loadMock
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValueOnce(database);

    const firstPromise = getDb();
    const secondPromise = getDb();
    await vi.runAllTimersAsync();

    await expect(firstPromise).resolves.toBe(database);
    await expect(secondPromise).resolves.toBe(database);
    expect(loadMock).toHaveBeenCalledTimes(2);

    await expect(getDb()).resolves.toBe(database);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces persistent startup failures after exhausting retries", async () => {
    vi.useFakeTimers();

    loadMock.mockRejectedValue(new Error("database is busy"));

    const dbPromise = getDb();
    const rejection = expect(dbPromise).rejects.toThrow("database is busy");
    await vi.runAllTimersAsync();

    await rejection;
    expect(loadMock).toHaveBeenCalledTimes(4);
  });
});
