export function getChatMarkdownFormattingInstructions(): string {
  return `Respond in concise markdown.

- Use a short heading only when it improves clarity.
- Prefer bullet lists for key points, steps, or takeaways.
- Use blockquotes only for important callouts.
- Use tables only when comparing options or facts.
- Use fenced code blocks only when the user asks for code, commands, or structured output.
- Avoid deep nesting, long boilerplate sections, or overly rigid templates.`;
}

function appendChatMarkdownFormatting(basePrompt: string): string {
  return `${basePrompt.trim()}

Reply formatting:
${getChatMarkdownFormattingInstructions()}`;
}

export type GlobalChatSystemPromptInput = {
  scopeSummary: string;
  sourceCoverageLines: string[];
  contextLines: string[];
};

export function buildGlobalChatSystemPrompt({
  scopeSummary,
  sourceCoverageLines,
  contextLines,
}: GlobalChatSystemPromptInput): string {
  return appendChatMarkdownFormatting(`You are an AI assistant inside a news aggregation app.

Current thread scope:
${scopeSummary}

Current source coverage:
${sourceCoverageLines.join("\n")}

Relevant news context:
${contextLines.join("\n")}

Answer the user's question primarily with the supplied context. If the context is sparse or missing facts, say that clearly instead of inventing details.`);
}

export type ArticleDiscussionSystemPromptInput = {
  articleTitle: string;
  sourceName: string;
  articleContent: string;
  relatedContext?: string;
};

export function buildArticleDiscussionSystemPrompt({
  articleTitle,
  sourceName,
  articleContent,
  relatedContext,
}: ArticleDiscussionSystemPromptInput): string {
  return appendChatMarkdownFormatting(`You are a helpful reading assistant. The user is reading the following article titled "${articleTitle}" source: ${sourceName}.
Current Article Content:
${articleContent}${relatedContext ?? ""}

Answer the user's questions based primarily on the current article. Use related context if asked for broader info. Be concise.`);
}

export type CreativeCardDiscussionSystemPromptInput = {
  title: string;
  bodyMarkdown: string;
};

export function buildCreativeCardDiscussionSystemPrompt({
  title,
  bodyMarkdown,
}: CreativeCardDiscussionSystemPromptInput): string {
  return appendChatMarkdownFormatting(`You are discussing a creative report you generated.
Report Data:
Title: ${title}
Body:
${bodyMarkdown}

Be concise and explore the user's questions further.`);
}
