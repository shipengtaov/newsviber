import { describe, expect, it } from "vitest";
import {
  getCreativeCardBodyMarkdown,
  getCreativeCardPreviewExcerpt,
} from "@/lib/creative-card";

describe("creative card helpers", () => {
  it("returns the stored markdown body without rewriting headings", () => {
    expect(getCreativeCardBodyMarkdown({
      full_report: "# Weekly Brief\n\n## Opportunities\nLaunch faster.",
    })).toBe(
      "# Weekly Brief\n\n## Opportunities\nLaunch faster.",
    );
  });

  it("builds a readable preview excerpt from markdown content", () => {
    expect(
      getCreativeCardPreviewExcerpt({
        full_report: "# Weekly Brief\n\n## Opportunities\n- Launch faster\n- Talk to customers",
      }, 80),
    ).toBe("Weekly Brief Opportunities Launch faster Talk to customers");
  });

  it("returns a placeholder when no content exists", () => {
    expect(getCreativeCardBodyMarkdown({})).toBe("_No content provided._");
  });
});
