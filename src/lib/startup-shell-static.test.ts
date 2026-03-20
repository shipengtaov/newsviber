import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("static startup shell", () => {
  it("keeps the loading shell copyless while preserving placeholder nodes", () => {
    const markup = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(markup).toContain("Starting Stream Deck");
    expect(markup).toContain("startup-shell__copy-placeholder");
    expect(markup).not.toContain("App Startup");
    expect(markup).not.toContain("Restoring persisted settings and preparing the app.");
  });
});
