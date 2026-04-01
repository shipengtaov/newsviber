import { describe, expect, it } from "vitest";
import {
  buildAutomationReportDiscussionSystemPrompt,
  buildGlobalChatSystemPrompt,
  getChatMarkdownFormattingInstructions,
} from "@/lib/chat-prompts";

describe("chat prompt builders", () => {
  it("adds consistent markdown guidance to the global chat prompt", () => {
    const prompt = buildGlobalChatSystemPrompt({
      scopeSummary: "Time range: Last 7 Days. Data sources: All active sources.",
      sourceCoverageLines: ["- Reuters: 5 matching article(s) in the current time range, 20 total stored"],
      shortlistLines: ["- [ID 42] [2026-03-12T08:00:00Z] Reuters: Example headline (Article URL: https://example.com/article) - Example summary"],
    });

    expect(prompt).toContain("Current thread scope:");
    expect(prompt).toContain("Recent scoped article shortlist:");
    expect(prompt).toContain("[ID 42]");
    expect(prompt).toContain(getChatMarkdownFormattingInstructions());
    expect(prompt).toContain("numeric markdown links such as [1](https://example.com/article)");
    expect(prompt).toContain("If you need more evidence and article retrieval tools are available");
  });

  it("preserves automation report context while appending markdown guidance", () => {
    const prompt = buildAutomationReportDiscussionSystemPrompt({
      title: "AI News Desk",
      bodyMarkdown: "## Market pulse\nProvider updates",
      supportingContextLines: ["- [2026-03-12T08:00:00Z] Reuters: Example headline (Article URL: https://example.com/article) - Example summary"],
    });

    expect(prompt).toContain("Title: AI News Desk");
    expect(prompt).toContain("## Market pulse");
    expect(prompt).toContain("Supporting article context:");
    expect(prompt).toContain("Article URL: https://example.com/article");
    expect(prompt).toContain(getChatMarkdownFormattingInstructions());
  });

  it("adds web search guidance for automation report discussion when enabled", () => {
    const prompt = buildAutomationReportDiscussionSystemPrompt({
      title: "AI News Desk",
      bodyMarkdown: "## Market pulse\nProvider updates",
      supportingContextLines: [],
      enableWebSearch: true,
    });

    expect(prompt).toContain("use web search before answering from memory");
    expect(prompt).toContain("Do not ask the user to search in a browser");
    expect(prompt).toContain("cite the source URLs inline");
    expect(prompt).toContain("If you use external web findings, cite them with the exact source URLs returned by web search.");
  });
});
