export function getChatMarkdownFormattingInstructions(): string {
  return `Respond in concise markdown.

- Use a short heading only when it improves clarity.
- Prefer bullet lists for key points, steps, or takeaways.
- Use blockquotes only for important callouts.
- Use tables only when comparing options or facts.
- Use fenced code blocks only when the user asks for code, commands, or structured output.
- Avoid deep nesting, long boilerplate sections, or overly rigid templates.`;
}

function getInlineCitationFormattingInstructions(options: { includeExternalWebSources: boolean }): string {
  return `Citation rules:
- Cite non-obvious factual claims inline using numeric markdown links such as [1](https://example.com/article).
- Put citations at the end of the sentence or bullet they support.
- Use the supplied article URLs when citing the provided news context.
${options.includeExternalWebSources ? "- If you use external web findings, cite them with the exact source URLs returned by web search." : ""}
- Reuse the same URL with the same number within a reply when practical.
- Do not output a references section, footnotes list, or bare URLs.
- Do not invent or guess URLs.`;
}

function appendChatMarkdownFormatting(basePrompt: string): string {
  return `${basePrompt.trim()}

Reply formatting:
${getChatMarkdownFormattingInstructions()}`;
}

export type GlobalChatSystemPromptInput = {
  scopeSummary: string;
  sourceCoverageLines: string[];
  shortlistLines?: string[];
  contextLines?: string[];
};

export type AutomationReportDiscussionSystemPromptInput = {
  title: string;
  bodyMarkdown: string;
  supportingContextLines: string[];
  enableWebSearch?: boolean;
};

export function buildAutomationReportDiscussionSystemPrompt({
  title,
  bodyMarkdown,
  supportingContextLines,
  enableWebSearch = false,
}: AutomationReportDiscussionSystemPromptInput): string {
  return appendChatMarkdownFormatting(`You are discussing an automation report you generated.
Report Data:
Title: ${title}
Body:
${bodyMarkdown}

Supporting article context:
${supportingContextLines.length > 0 ? supportingContextLines.join("\n") : "- No supporting article URLs are available for this report."}

${enableWebSearch
  ? `Prefer the report content first. When the report does not clearly answer the user's question, or the user asks for fresher facts, external validation, entity identification, or missing background, use web search before answering from memory.
Do not ask the user to search in a browser when web search can help you resolve the question yourself.
If you use external web findings, clearly distinguish them from the report content and cite the source URLs inline.
If web search does not return enough evidence, say that clearly.`
  : "Use the report content as your primary evidence and do not invent facts beyond it."}

${getInlineCitationFormattingInstructions({ includeExternalWebSources: enableWebSearch })}

Be concise and explore the user's questions further.`);
}

export function buildGlobalChatSystemPrompt({
  scopeSummary,
  sourceCoverageLines,
  shortlistLines,
  contextLines,
}: GlobalChatSystemPromptInput): string {
  const resolvedShortlistLines = shortlistLines ?? contextLines ?? [];

  return appendChatMarkdownFormatting(`You are an AI assistant inside a news aggregation app.

Current thread scope:
${scopeSummary}

Current source coverage:
${sourceCoverageLines.join("\n")}

Recent scoped article shortlist:
${resolvedShortlistLines.length > 0 ? resolvedShortlistLines.join("\n") : "- No recent scoped articles are currently available."}

${getInlineCitationFormattingInstructions({ includeExternalWebSources: false })}

Answer the user's question primarily with the shortlist and any article details you retrieve through available tools.
If the shortlist is enough, answer directly without extra tool calls.
If you need more evidence and article retrieval tools are available, inspect the most relevant article IDs before making detailed claims.
If the shortlist is insufficient and no article retrieval tools are available in the current run, say that clearly instead of inventing details.`);
}
