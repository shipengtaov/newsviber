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
      contextLines: ["- [2026-03-12T08:00:00Z] Reuters: Example headline - Example summary"],
    });

    expect(prompt).toContain("Current thread scope:");
    expect(prompt).toContain("Relevant news context:");
    expect(prompt).toContain(getChatMarkdownFormattingInstructions());
  });

  it("preserves automation report context while appending markdown guidance", () => {
    const prompt = buildAutomationReportDiscussionSystemPrompt({
      title: "AI News Desk",
      bodyMarkdown: "## Market pulse\nProvider updates",
    });

    expect(prompt).toContain("Title: AI News Desk");
    expect(prompt).toContain("## Market pulse");
    expect(prompt).toContain(getChatMarkdownFormattingInstructions());
  });

  it("adds web search guidance for automation report discussion when enabled", () => {
    const prompt = buildAutomationReportDiscussionSystemPrompt({
      title: "AI News Desk",
      bodyMarkdown: "## Market pulse\nProvider updates",
      enableWebSearch: true,
    });

    expect(prompt).toContain("use web search before answering from memory");
    expect(prompt).toContain("Do not ask the user to search in a browser");
    expect(prompt).toContain("cite the source URLs inline");
  });
});
