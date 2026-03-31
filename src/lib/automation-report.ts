type AutomationReportContentSource = {
  full_report?: string | null;
};

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

export function getAutomationReportBodyMarkdown(report: AutomationReportContentSource): string {
  const fullReport = (report.full_report ?? "").trim();
  return fullReport || "_No content provided._";
}

export function getAutomationReportPreviewExcerpt(
  report: AutomationReportContentSource,
  maxLength = 220,
): string {
  const plainText = markdownToPlainText(getAutomationReportBodyMarkdown(report));
  if (!plainText) {
    return "No content provided.";
  }

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
