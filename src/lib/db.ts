import Database from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:getnews.db";
const DB_LOAD_RETRY_ATTEMPTS = 4;
const DB_LOAD_RETRY_DELAY_MS = 120;
const TAURI_READY_WAIT_MS = 600;
const TAURI_READY_POLL_INTERVAL_MS = 20;

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
};

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

function isTauriInvokeReady(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return typeof (window as TauriWindow).__TAURI_INTERNALS__?.invoke === "function";
}

async function waitForTauriInvokeReady(): Promise<void> {
  if (isTauriInvokeReady()) {
    return;
  }

  const deadline = Date.now() + TAURI_READY_WAIT_MS;

  while (!isTauriInvokeReady() && Date.now() < deadline) {
    await wait(TAURI_READY_POLL_INTERVAL_MS);
  }
}

function isTransientDbLoadError(error: unknown): boolean {
  const message = String(error).toLowerCase();

  return (
    message.includes("database is locked") ||
    message.includes("database is busy") ||
    message.includes("sqlite_busy") ||
    message.includes("sqlite_locked") ||
    message.includes("__tauri_internals__") ||
    message.includes("reading 'invoke'") ||
    message.includes("invoke is not a function") ||
    (message.includes("tauri") && message.includes("not ready"))
  );
}

async function loadDbWithRetries(): Promise<Database> {
  let lastError: unknown;

  for (let attempt = 0; attempt < DB_LOAD_RETRY_ATTEMPTS; attempt += 1) {
    await waitForTauriInvokeReady();

    try {
      return await Database.load(DB_PATH);
    } catch (error) {
      lastError = error;

      if (!isTransientDbLoadError(error) || attempt === DB_LOAD_RETRY_ATTEMPTS - 1) {
        throw error;
      }

      await wait(DB_LOAD_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getDb(): Promise<Database> {
  if (db) {
    return db;
  }

  if (!dbPromise) {
    dbPromise = loadDbWithRetries()
      .then((database) => {
        db = database;
        return database;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }

  return dbPromise;
}

export function resetDbForTests(): void {
  db = null;
  dbPromise = null;
}
