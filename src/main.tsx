import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { StartupStatusScreen } from "@/components/startup/StartupStatusScreen";
import {
  AppSettingsBootstrapError,
  AppStartupI18nError,
  bootstrapApplication,
} from "./lib/app-startup";
import { completeStartupTransition } from "./lib/startup-transition";

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

async function renderBootstrappedScreen(node: React.ReactNode) {
  render(node);

  try {
    await completeStartupTransition();
  } catch (error) {
    console.error("Failed to complete startup transition:", error);
  }
}

async function renderApp() {
  await renderBootstrappedScreen(<App />);
}

function renderLoadingScreen() {
  render(
    <StartupStatusScreen
      title="Starting News Viber"
      kicker={null}
      description={null}
      preserveCopySpace
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
        "News Viber could not load your saved application settings from SQLite. Your data was not changed. Retry after the database finishes initializing.",
      detail,
    };
  }

  if (error instanceof AppStartupI18nError) {
    return {
      title: "Failed to initialize translations",
      description:
        "News Viber could not finish loading its translations. Retry to continue launching the app.",
      detail,
    };
  }

  return {
    title: "Failed to start the app",
    description:
      "An unexpected startup error prevented News Viber from launching correctly. Retry to try again.",
    detail,
  };
}

async function renderBootstrapError(error: unknown) {
  const content = describeBootstrapError(error);

  await renderBootstrappedScreen(
    <StartupStatusScreen
      title={content.title}
      description={content.description}
      detail={content.detail}
      showRetry
      onRetry={() => {
        void bootstrap();
      }}
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

    await renderApp();
  } catch (error) {
    if (error instanceof AppSettingsBootstrapError) {
      console.error("Failed to bootstrap persisted settings:", getErrorCause(error) ?? error);
    } else if (error instanceof AppStartupI18nError) {
      console.error("Failed to initialize i18n during app bootstrap:", error);
    } else {
      console.error("Unexpected application bootstrap failure:", error);
    }

    await renderBootstrapError(error);
  } finally {
    isBootstrapping = false;
  }
}

void bootstrap();
