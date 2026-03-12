import { describe, expect, it } from "vitest";
import {
  buildArticleDiscussionSystemPrompt,
  buildCreativeCardDiscussionSystemPrompt,
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

  it("preserves article context while appending markdown guidance", () => {
    const prompt = buildArticleDiscussionSystemPrompt({
      articleTitle: "Example article",
      sourceName: "Example source",
      articleContent: "Article body",
      relatedContext: "\n\nRelated Articles Context:\n- [2026-03-12T07:00:00Z] Related story: Context",
    });

    expect(prompt).toContain('titled "Example article" source: Example source');
    expect(prompt).toContain("Related Articles Context:");
    expect(prompt).toContain(getChatMarkdownFormattingInstructions());
  });

  it("preserves creative card context while appending markdown guidance", () => {
    const prompt = buildCreativeCardDiscussionSystemPrompt({
      title: "AI News Desk",
      bodyMarkdown: "## Market pulse\nProvider updates",
    });

    expect(prompt).toContain("Title: AI News Desk");
    expect(prompt).toContain("## Market pulse");
    expect(prompt).toContain(getChatMarkdownFormattingInstructions());
  });
});
