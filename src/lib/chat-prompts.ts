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

export type CreativeCardDiscussionSystemPromptInput = {
  title: string;
  bodyMarkdown: string;
  enableWebSearch?: boolean;
};

export function buildCreativeCardDiscussionSystemPrompt({
  title,
  bodyMarkdown,
  enableWebSearch = false,
}: CreativeCardDiscussionSystemPromptInput): string {
  return appendChatMarkdownFormatting(`You are discussing a creative report you generated.
Report Data:
Title: ${title}
Body:
${bodyMarkdown}

${enableWebSearch
  ? `Prefer the report content first. When the report does not clearly answer the user's question, or the user asks for fresher facts, external validation, entity identification, or missing background, use web search before answering from memory.
Do not ask the user to search in a browser when web search can help you resolve the question yourself.
If you use external web findings, clearly distinguish them from the report content and cite the source URLs inline.
If web search does not return enough evidence, say that clearly.`
  : "Use the report content as your primary evidence and do not invent facts beyond it."}

Be concise and explore the user's questions further.`);
}
