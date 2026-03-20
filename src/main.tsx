import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import {
  AppSettingsBootstrapError,
  AppStartupI18nError,
  bootstrapApplication,
} from "./lib/app-startup";

const rootElement = document.getElementById("root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Application root element was not found.");
}

const root = ReactDOM.createRoot(rootElement);
let isBootstrapping = false;

function render(node: React.ReactNode) {
  root.render(
    <React.StrictMode>
      {node}
    </React.StrictMode>,
  );
}

function renderApp() {
  render(<App />);
}

type BootstrapStatusScreenProps = {
  title: string;
  description: string;
  detail?: string | null;
  showRetry?: boolean;
};

function BootstrapStatusScreen({
  title,
  description,
  detail = null,
  showRetry = false,
}: BootstrapStatusScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <div className="w-full max-w-xl rounded-[1.75rem] border border-border/60 bg-card/90 p-8 shadow-xl backdrop-blur-sm">
        <div className="space-y-4">
          <div className="inline-flex rounded-full border border-border/60 bg-muted px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            App Startup
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {detail ? (
            <pre className="overflow-x-auto rounded-2xl border border-border/50 bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
              {detail}
            </pre>
          ) : null}
          {showRetry ? (
            <button
              type="button"
              onClick={() => {
                void bootstrap();
              }}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderLoadingScreen() {
  render(
    <BootstrapStatusScreen
      title="Starting Stream Deck"
      description="Restoring persisted settings and preparing the app."
    />,
  );
}

function getErrorCause(error: Error): unknown {
  return "cause" in error ? (error as { cause?: unknown }).cause : undefined;
}

function describeBootstrapError(error: unknown): {
  title: string;
  description: string;
  detail: string | null;
} {
  const detail =
    error instanceof Error
      ? String(getErrorCause(error) ?? error.message)
      : String(error);

  if (error instanceof AppSettingsBootstrapError) {
    return {
      title: "Failed to restore persisted settings",
      description:
        "Stream Deck could not load your saved application settings from SQLite. Your data was not changed. Retry after the database finishes initializing.",
      detail,
    };
  }

  if (error instanceof AppStartupI18nError) {
    return {
      title: "Failed to initialize translations",
      description:
        "Stream Deck could not finish loading its translations. Retry to continue launching the app.",
      detail,
    };
  }

  return {
    title: "Failed to start the app",
    description:
      "An unexpected startup error prevented Stream Deck from launching correctly. Retry to try again.",
    detail,
  };
}

function renderBootstrapError(error: unknown) {
  const content = describeBootstrapError(error);

  render(
    <BootstrapStatusScreen
      title={content.title}
      description={content.description}
      detail={content.detail}
      showRetry
    />,
  );
}

async function bootstrap() {
  if (isBootstrapping) {
    return;
  }

  isBootstrapping = true;
  renderLoadingScreen();

  try {
    const result = await bootstrapApplication();

    if (result.recoveredI18nError) {
      console.error(
        "Failed to initialize i18n from persisted settings, recovered with defaults:",
        result.recoveredI18nError,
      );
    }

    renderApp();
  } catch (error) {
    if (error instanceof AppSettingsBootstrapError) {
      console.error("Failed to bootstrap persisted settings:", getErrorCause(error) ?? error);
    } else if (error instanceof AppStartupI18nError) {
      console.error("Failed to initialize i18n during app bootstrap:", error);
    } else {
      console.error("Unexpected application bootstrap failure:", error);
    }

    renderBootstrapError(error);
  } finally {
    isBootstrapping = false;
  }
}

void bootstrap();
