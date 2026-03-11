import { describe, expect, it } from "vitest";
import {
  buildLegacyCreativeCardMarkdown,
  getCreativeCardBodyMarkdown,
  getCreativeCardPreviewExcerpt,
  stripLeadingMarkdownTitle,
} from "@/lib/creative-card";

describe("creative card helpers", () => {
  it("removes a leading markdown title from full reports", () => {
    expect(stripLeadingMarkdownTitle("# Weekly Brief\n\n## Opportunities\nLaunch faster.")).toBe(
      "## Opportunities\nLaunch faster.",
    );
  });

  it("falls back to legacy fields when full report is missing", () => {
    expect(
      getCreativeCardBodyMarkdown({
        full_report: "",
        signals: "Model providers are shipping faster.",
        ideas: "Package niche daily digests for product teams.",
      }),
    ).toBe(
      "## Key Signals\nModel providers are shipping faster.\n\n## Creative Ideas\nPackage niche daily digests for product teams.",
    );
  });

  it("builds a readable preview excerpt from markdown content", () => {
    expect(
      getCreativeCardPreviewExcerpt({
        full_report: "# Weekly Brief\n\n## Opportunities\n- Launch faster\n- Talk to customers",
      }, 80),
    ).toBe("Opportunities Launch faster Talk to customers");
  });

  it("returns a placeholder when no content exists", () => {
    expect(buildLegacyCreativeCardMarkdown({})).toBe("_No content provided._");
  });
});
