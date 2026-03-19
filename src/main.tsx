import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { bootstrapAppSettings } from "./lib/app-settings";
import { initializeI18n } from "./lib/i18n";

function renderApp() {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

async function bootstrap() {
  try {
    const settings = await bootstrapAppSettings();
    await initializeI18n(settings.languagePreference);
  } catch (error) {
    console.error("Failed to bootstrap persisted settings:", error);
    await initializeI18n();
  }

  renderApp();
}

void bootstrap();
