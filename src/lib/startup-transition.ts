export const STARTUP_SHELL_ID = "startup-shell";
export const STARTUP_SHELL_CLOSING_CLASS = "startup-stage--closing";

const STARTUP_SHELL_REMOVE_DELAY_MS = 220;
const STARTUP_TRANSITION_PAINT_FRAMES = 2;

let startupShellDismissPromise: Promise<void> | null = null;
let startupTransitionPromise: Promise<void> | null = null;

function getStartupShellElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const element = document.getElementById(STARTUP_SHELL_ID);
  return element instanceof HTMLElement ? element : null;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }

    globalThis.setTimeout(resolve, 16);
  });
}

async function waitForStablePaint(): Promise<void> {
  for (let frame = 0; frame < STARTUP_TRANSITION_PAINT_FRAMES; frame += 1) {
    await waitForAnimationFrame();
  }
}

export function dismissStartupShell(): Promise<void> {
  if (startupShellDismissPromise) {
    return startupShellDismissPromise;
  }

  const shell = getStartupShellElement();
  if (!shell) {
    return Promise.resolve();
  }

  shell.classList.add(STARTUP_SHELL_CLOSING_CLASS);
  startupShellDismissPromise = wait(STARTUP_SHELL_REMOVE_DELAY_MS).then(() => {
    shell.remove();
  });

  return startupShellDismissPromise;
}

export function completeStartupTransition(): Promise<void> {
  if (!startupTransitionPromise) {
    startupTransitionPromise = (async () => {
      await waitForStablePaint();
      await dismissStartupShell();
    })().catch((error) => {
      startupTransitionPromise = null;
      throw error;
    });
  }

  return startupTransitionPromise;
}

export function resetStartupTransitionForTests(): void {
  startupShellDismissPromise = null;
  startupTransitionPromise = null;
}
