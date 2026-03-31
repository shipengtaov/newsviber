import { describe, expect, it } from "vitest";
import {
  getAutomationReportBodyMarkdown,
  getAutomationReportPreviewExcerpt,
} from "@/lib/automation-report";

describe("automation report helpers", () => {
  it("returns the stored markdown body without rewriting headings", () => {
    expect(getAutomationReportBodyMarkdown({
      full_report: "# Weekly Brief\n\n## Opportunities\nLaunch faster.",
    })).toBe(
      "# Weekly Brief\n\n## Opportunities\nLaunch faster.",
    );
  });

  it("builds a readable preview excerpt from markdown content", () => {
    expect(
      getAutomationReportPreviewExcerpt({
        full_report: "# Weekly Brief\n\n## Opportunities\n- Launch faster\n- Talk to customers",
      }, 80),
    ).toBe("Weekly Brief Opportunities Launch faster Talk to customers");
  });

  it("returns a placeholder when no content exists", () => {
    expect(getAutomationReportBodyMarkdown({})).toBe("_No content provided._");
  });
});
