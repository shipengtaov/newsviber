// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STARTUP_SHELL_CLOSING_CLASS,
  STARTUP_SHELL_ID,
  completeStartupTransition,
  dismissStartupShell,
  resetStartupTransitionForTests,
} from "@/lib/startup-transition";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

describe("startup transition helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="${STARTUP_SHELL_ID}" class="startup-stage startup-stage--overlay"></div>`;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      globalThis.setTimeout(() => callback(performance.now()), 16)) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) =>
      globalThis.clearTimeout(handle)) as unknown as typeof cancelAnimationFrame;
    resetStartupTransitionForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    resetStartupTransitionForTests();
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("dismisses the static startup shell after applying the closing class", async () => {
    const dismissal = dismissStartupShell();
    const startupShell = document.getElementById(STARTUP_SHELL_ID);

    expect(startupShell).not.toBeNull();
    expect(startupShell?.classList.contains(STARTUP_SHELL_CLOSING_CLASS)).toBe(true);

    await vi.advanceTimersByTimeAsync(220);
    await dismissal;

    expect(document.getElementById(STARTUP_SHELL_ID)).toBeNull();
  });

  it("waits for paint and then removes the startup shell", async () => {
    const transition = completeStartupTransition();

    await vi.runAllTimersAsync();
    await expect(transition).resolves.toBeUndefined();

    expect(document.getElementById(STARTUP_SHELL_ID)).toBeNull();
  });
});
