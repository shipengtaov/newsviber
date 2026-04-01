import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

describe("ChatMarkdown", () => {
  it("renders structured markdown, GFM tables, and code blocks", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown
        content={`# Brief

- First point

> Important note

| Provider | Model |
| --- | --- |
| OpenAI | GPT |

Use \`npm test\`.

\`\`\`bash
npm test
\`\`\`

[Read more](https://example.com)`}
      />,
    );

    expect(markup).toContain("<h1>Brief</h1>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain("<blockquote>");
    expect(markup).toContain('class="chat-markdown-table-wrapper not-prose"');
    expect(markup).toContain('class="chat-markdown-pre not-prose"');
    expect(markup).toContain("<code>npm test</code>");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer noopener"');
  });

  it("does not render unsupported protocols as clickable links", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown content="[Open local file](file:///tmp/example.txt)" />,
    );

    expect(markup).not.toContain("<a");
    expect(markup).toContain("chat-markdown-link-disabled");
  });

  it("renders numeric markdown links as citation chips with a tooltip", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown content={"增长放缓 [1](https://example.com/article)"} />,
    );

    expect(markup).toContain("chat-markdown-citation-sup");
    expect(markup).toContain("chat-markdown-citation-tooltip");
    expect(markup).toContain("example.com");
    expect(markup).toContain("https://example.com/article");
  });

  it("applies inverse tone styles without changing markdown safety behavior", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown
        tone="inverse"
        content={`# User Note

Inline \`code\`

\`\`\`txt
visible code block
\`\`\`

| Column | Value |
| --- | --- |
| Tone | Inverse |

[Safe link](https://example.com)
[Unsafe link](file:///tmp/example.txt)`}
      />,
    );

    expect(markup).toContain("chat-markdown-inverse");
    expect(markup).toContain('class="chat-markdown-pre not-prose"');
    expect(markup).toContain('href="https://example.com"');
    expect(markup).not.toContain('href="file:///tmp/example.txt"');
    expect(markup).toContain("chat-markdown-link-disabled");
  });
});
