type CreativeCardContentSource = {
  full_report?: string | null;
  signals?: string | null;
  interpretation?: string | null;
  ideas?: string | null;
  counterpoints?: string | null;
  next_actions?: string | null;
};

function sectionContent(content: string): string {
  const trimmedContent = content.trim();
  return trimmedContent || "_No content provided._";
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[*-]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripLeadingMarkdownTitle(markdown: string): string {
  const normalizedMarkdown = markdown.trim();
  if (!normalizedMarkdown) {
    return "";
  }

  const lines = normalizedMarkdown.split("\n");
  const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyLineIndex === -1) {
    return "";
  }

  if (!/^#\s+/.test(lines[firstNonEmptyLineIndex].trim())) {
    return normalizedMarkdown;
  }

  const remainingLines = lines.slice(firstNonEmptyLineIndex + 1);
  while (remainingLines.length > 0 && remainingLines[0].trim() === "") {
    remainingLines.shift();
  }

  return remainingLines.join("\n").trim();
}

export function buildLegacyCreativeCardMarkdown(card: CreativeCardContentSource): string {
  const sections = [
    ["Key Signals", card.signals ?? ""],
    ["Interpretation", card.interpretation ?? ""],
    ["Creative Ideas", card.ideas ?? ""],
    ["Counterpoints", card.counterpoints ?? ""],
    ["Next Actions", card.next_actions ?? ""],
  ]
    .map(([title, content]) => ({
      title,
      content: String(content).trim(),
    }))
    .filter((section) => section.content);

  if (sections.length === 0) {
    return "_No content provided._";
  }

  return sections
    .map((section) => `## ${section.title}\n${sectionContent(section.content)}`)
    .join("\n\n");
}

export function getCreativeCardBodyMarkdown(card: CreativeCardContentSource): string {
  const fullReport = stripLeadingMarkdownTitle(card.full_report ?? "");
  if (fullReport) {
    return fullReport;
  }

  return buildLegacyCreativeCardMarkdown(card);
}

export function getCreativeCardPreviewExcerpt(
  card: CreativeCardContentSource,
  maxLength = 220,
): string {
  const plainText = markdownToPlainText(getCreativeCardBodyMarkdown(card));
  if (!plainText) {
    return "No content provided.";
  }

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
