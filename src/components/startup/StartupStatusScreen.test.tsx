import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StartupStatusScreen } from "@/components/startup/StartupStatusScreen";

describe("StartupStatusScreen", () => {
  it("renders the loading state without visible startup copy", () => {
    const markup = renderToStaticMarkup(
      <StartupStatusScreen
        title="Starting News Viber"
        kicker={null}
        description={null}
        preserveCopySpace
      />,
    );

    expect(markup).toContain(">Starting News Viber<");
    expect(markup).toContain("startup-shell__progress-bar");
    expect(markup).toContain("startup-shell__copy-placeholder");
    expect(markup).not.toContain("App Startup");
    expect(markup).not.toContain("Restoring persisted settings and preparing the app.");
  });

  it("renders the error state details and retry action", () => {
    const markup = renderToStaticMarkup(
      <StartupStatusScreen
        title="Failed to restore persisted settings"
        description="News Viber could not load your saved application settings from SQLite."
        detail="database is locked"
        showRetry
        onRetry={() => undefined}
      />,
    );

    expect(markup).toContain(">App Startup<");
    expect(markup).toContain(">Failed to restore persisted settings<");
    expect(markup).toContain(
      "News Viber could not load your saved application settings from SQLite.",
    );
    expect(markup).toContain("database is locked");
    expect(markup).toContain(">Retry<");
  });
});
