import { tool, type ToolSet } from "ai";
import { invoke } from "@tauri-apps/api/core";
import type { AutomationReportDraft } from "@/lib/ai";
import { compactHtmlText, resolveArticlePreview } from "@/lib/article-html";
import { dispatchAutomationSyncEvent } from "@/lib/automation-events";
import { normalizeCitationUrl } from "@/lib/citations";
import { getDb } from "@/lib/db";
import {
    formatGlobalChatShortlistLine,
    type GlobalChatArticleDetail,
    type GlobalChatArticleShortlistItem,
} from "@/lib/global-chat-service";
import { formatUtcDateTime } from "@/lib/time";
import { z } from "zod";

export type AutomationProject = {
    id: number;
    name: string;
    prompt: string;
    cycle_mode: string;
    auto_enabled: boolean;
    auto_interval_minutes: number;
    max_articles_per_report: number;
    min_articles_per_report: number;
    web_search_enabled: boolean;
    last_auto_attempted_at: string | null;
    last_auto_consumed_at: string | null;
    last_auto_generated_at: string | null;
    source_ids: number[];
    unread_report_count: number;
};

export type AutomationReport = {
    id: number;
    project_id: number;
    title: string;
    full_report: string;
    generation_mode: "manual" | "auto";
    used_article_count: number;
    is_read: boolean;
    is_favorite: boolean;
    created_at: string;
};

export type AutomationSourceOption = {
    id: number;
    name: string;
    active: boolean;
    article_count: number;
};

export type AutomationArticleCandidate = {
    id: number;
    source_id: number;
    source_name: string;
    title: string;
    summary: string;
    published_at: string | null;
    inserted_at: string;
    is_consumed: boolean;
};

export type AutomationArticleCandidatePage = {
    items: AutomationArticleCandidate[];
    totalCount: number;
};

export type AutomationReportContextArticle = {
    id: number;
    source_id: number;
    source_name: string;
    title: string;
    summary: string;
    content: string | null;
    published_at: string | null;
    inserted_at: string;
    article_url: string | null;
};

export type AutomationProjectArticleShortlistItem = GlobalChatArticleShortlistItem;
export type AutomationProjectArticleDetail = GlobalChatArticleDetail;

export type SaveAutomationProjectInput = {
    name: string;
    prompt: string;
    auto_enabled: boolean;
    auto_interval_minutes: number;
    max_articles_per_report: number;
    min_articles_per_report: number;
    web_search_enabled: boolean;
    use_all_sources: boolean;
    source_ids: number[];
};

export type AutomationReportPage = {
    reports: AutomationReport[];
    totalCount: number;
};

export type GenerateAutomationReportInput = {
    projectId: number;
    articleIds: number[];
    mode: "manual" | "auto";
    checkedAt?: string;
};

type SaveAutomationProjectCommandInput = {
    projectId: number | null;
    name: string;
    prompt: string;
    autoEnabled: boolean;
    autoIntervalMinutes: number;
    maxArticlesPerReport: number;
    minArticlesPerReport: number;
    webSearchEnabled: boolean;
    sourceIds: number[];
};

type SaveAutomationProjectCommandResult = {
    projectId: number;
};

type PersistAutomationReportCommandInput = {
    projectId: number;
    title: string;
    fullReport: string;
    generationMode: "manual" | "auto";
    usedArticleCount: number;
    articleIds: number[];
    checkedAt: string | null;
};

type PersistAutomationReportCommandResult = {
    reportId: number;
};

type AutomationProjectRow = {
    id: number;
    name: string;
    prompt: string;
    cycle_mode: string;
    auto_enabled: number | boolean;
    auto_interval_minutes: number;
    max_articles_per_report: number;
    min_articles_per_report: number;
    web_search_enabled: number | boolean;
    last_auto_attempted_at: string | null;
    last_auto_consumed_at: string | null;
    last_auto_generated_at: string | null;
    source_ids_csv: string | null;
    unread_report_count: number | null;
};

type AutomationReportRow = {
    id: number;
    project_id: number;
    title: string;
    full_report: string | null;
    generation_mode: string | null;
    used_article_count: number | null;
    is_read: number | boolean | string | null;
    is_favorite: number | boolean | string | null;
    created_at: string;
};

type AutomationSourceRow = {
    id: number;
    name: string;
    active: number | boolean;
    article_count: number | null;
};

type AutomationArticleCandidateRow = {
    id: number;
    source_id: number;
    source_name: string;
    title: string;
    summary: string | null;
    published_at: string | null;
    inserted_at: string;
    is_consumed: number | boolean;
};

type AutomationArticleContextRow = {
    id: number;
    source_id: number;
    source_name: string;
    title: string;
    summary: string | null;
    content: string | null;
    published_at: string | null;
    inserted_at: string;
    article_url: string | null;
};

type AutomationReportGenerationResult = {
    draft: AutomationReportDraft;
    evidenceArticleIds: number[];
};

type AutomationReportUserPromptInput =
    | {
        mode: "inline";
        articles: AutomationArticleContextRow[];
    }
    | {
        mode: "indexed";
        totalArticles: number;
        coverageSummaryLines: string[];
        shortlistLines: string[];
    };

type AutomationArticleToolRecord = {
    article: AutomationArticleContextRow;
    shortlistItem: AutomationProjectArticleShortlistItem;
    detailItem: AutomationProjectArticleDetail;
    searchText: string;
};

const DEFAULT_AUTO_INTERVAL_MINUTES = 60;
const DEFAULT_MAX_ARTICLES_PER_REPORT = 200;
const DEFAULT_MIN_ARTICLES_PER_REPORT = 10;
const DEFAULT_CANDIDATE_LIMIT = 200;
const MAX_CANDIDATE_LIMIT = 1000;
const MAX_CONTEXT_CHARS_PER_ARTICLE = 1200;
const SMALL_CONTEXT_MAX_ARTICLES = 40;
const SMALL_CONTEXT_MAX_PROMPT_CHARS = 30_000;
const LARGE_CONTEXT_SHORTLIST_LIMIT = 30;
const LARGE_CONTEXT_SOURCE_SUMMARY_LIMIT = 5;
const LARGE_CONTEXT_TOOL_LIST_LIMIT = 25;
const LARGE_CONTEXT_DETAIL_BATCH_SIZE = 5;
const LARGE_CONTEXT_TARGET_DETAIL_ARTICLES = 12;
const LARGE_CONTEXT_MAX_DETAIL_ARTICLES = 20;
const LARGE_CONTEXT_TOOL_LOOP_STEPS = 12;
const MAX_AUTOMATION_SHORTLIST_PREVIEW_CHARS = 280;
const MAX_AUTOMATION_DETAIL_CONTENT_CHARS = 4000;

const PROJECT_SELECT_BASE_SQL = `
    SELECT
        p.id,
        p.name,
        p.prompt,
        p.cycle_mode,
        p.auto_enabled,
        p.auto_interval_minutes,
        p.max_articles_per_report,
        p.min_articles_per_report,
        p.web_search_enabled,
        p.last_auto_attempted_at,
        p.last_auto_consumed_at,
        p.last_auto_generated_at,
        (
            SELECT COUNT(*)
            FROM automation_reports unread_reports
            WHERE unread_reports.project_id = p.id
              AND unread_reports.is_read = 0
        ) AS unread_report_count,
        GROUP_CONCAT(ps.source_id) AS source_ids_csv
    FROM automation_projects p
    LEFT JOIN automation_project_sources ps ON ps.project_id = p.id
`;

const inFlightProjectGenerations = new Map<number, Promise<AutomationReport>>();
const inFlightAutoChecks = new Map<number, Promise<AutomationReport | null>>();

function normalizeBoolean(value: unknown): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        return value === "1" || value.toLowerCase() === "true";
    }

    return false;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsvNumbers(csv: string | null): number[] {
    if (!csv) {
        return [];
    }

    const seen = new Set<number>();
    for (const rawValue of csv.split(",")) {
        const parsed = Number.parseInt(rawValue, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            seen.add(parsed);
        }
    }

    return Array.from(seen);
}

function normalizeAutomationProject(row: AutomationProjectRow): AutomationProject {
    return {
        id: row.id,
        name: row.name,
        prompt: row.prompt,
        cycle_mode: row.cycle_mode,
        auto_enabled: normalizeBoolean(row.auto_enabled),
        auto_interval_minutes: normalizePositiveInteger(row.auto_interval_minutes, DEFAULT_AUTO_INTERVAL_MINUTES),
        max_articles_per_report: normalizePositiveInteger(row.max_articles_per_report, DEFAULT_MAX_ARTICLES_PER_REPORT),
        min_articles_per_report: normalizePositiveInteger(row.min_articles_per_report, DEFAULT_MIN_ARTICLES_PER_REPORT),
        web_search_enabled: normalizeBoolean(row.web_search_enabled),
        last_auto_attempted_at: row.last_auto_attempted_at ?? null,
        last_auto_consumed_at: row.last_auto_consumed_at ?? null,
        last_auto_generated_at: row.last_auto_generated_at ?? null,
        source_ids: parseCsvNumbers(row.source_ids_csv),
        unread_report_count: Math.max(0, Number(row.unread_report_count) || 0),
    };
}

function normalizeAutomationReport(row: AutomationReportRow): AutomationReport {
    const generationMode = row.generation_mode === "auto" ? "auto" : "manual";

    return {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        full_report: row.full_report ?? "",
        generation_mode: generationMode,
        used_article_count: normalizePositiveInteger(row.used_article_count, 0),
        is_read: normalizeBoolean(row.is_read),
        is_favorite: normalizeBoolean(row.is_favorite),
        created_at: row.created_at,
    };
}

function normalizeAutomationSource(row: AutomationSourceRow): AutomationSourceOption {
    return {
        id: row.id,
        name: row.name,
        active: normalizeBoolean(row.active),
        article_count: Number(row.article_count) || 0,
    };
}

function normalizeAutomationArticleCandidate(row: AutomationArticleCandidateRow): AutomationArticleCandidate {
    return {
        id: row.id,
        source_id: row.source_id,
        source_name: row.source_name,
        title: row.title,
        summary: row.summary ?? "",
        published_at: row.published_at ?? null,
        inserted_at: row.inserted_at,
        is_consumed: normalizeBoolean(row.is_consumed),
    };
}

function pushParam(params: unknown[], value: unknown): string {
    params.push(value);
    return `$${params.length}`;
}

function sanitizeSourceIds(sourceIds: number[]): number[] {
    const uniqueIds = new Set<number>();

    for (const sourceId of sourceIds) {
        const parsed = Number.parseInt(String(sourceId), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            uniqueIds.add(parsed);
        }
    }

    return Array.from(uniqueIds);
}

function sanitizeArticleIds(articleIds: number[]): number[] {
    const uniqueIds = new Set<number>();

    for (const articleId of articleIds) {
        const parsed = Number.parseInt(String(articleId), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            uniqueIds.add(parsed);
        }
    }

    return Array.from(uniqueIds);
}

function sanitizeLimit(limit: number | undefined): number {
    if (limit === undefined) {
        return DEFAULT_CANDIDATE_LIMIT;
    }

    return Math.max(1, Math.min(MAX_CANDIDATE_LIMIT, normalizePositiveInteger(limit, DEFAULT_CANDIDATE_LIMIT)));
}

function buildProjectScopeCondition(projectId: number, params: unknown[], articleAlias = "a"): string {
    const noScopeProjectParam = pushParam(params, projectId);
    const scopedProjectParam = pushParam(params, projectId);

    return `(
        NOT EXISTS (
            SELECT 1
            FROM automation_project_sources scope_sources
            WHERE scope_sources.project_id = ${noScopeProjectParam}
        )
        OR ${articleAlias}.source_id IN (
            SELECT scoped_sources.source_id
            FROM automation_project_sources scoped_sources
            WHERE scoped_sources.project_id = ${scopedProjectParam}
        )
    )`;
}

function buildConsumedExistsExpression(projectId: number, params: unknown[], articleAlias = "a"): string {
    const projectParam = pushParam(params, projectId);

    return `EXISTS (
        SELECT 1
        FROM automation_report_articles consumed_articles
        JOIN automation_reports consumed_reports ON consumed_reports.id = consumed_articles.report_id
        WHERE consumed_reports.project_id = ${projectParam}
          AND consumed_articles.article_id = ${articleAlias}.id
    )`;
}

function buildProjectCandidateArticleQuery(
    projectId: number,
    options: {
        includeConsumed: boolean;
        sourceId: number | null;
        search: string;
        insertedAfter: string | null;
    },
): {
    fromSql: string;
    params: unknown[];
} {
    const params: unknown[] = [];
    const consumedExistsExpression = buildConsumedExistsExpression(projectId, params);
    const innerConditions = [buildProjectScopeCondition(projectId, params)];

    if (options.sourceId && options.sourceId > 0) {
        innerConditions.push(`a.source_id = ${pushParam(params, options.sourceId)}`);
    }

    if (options.search) {
        const searchParam = pushParam(params, `%${options.search}%`);
        innerConditions.push(`(
            LOWER(a.title) LIKE ${searchParam}
            OR LOWER(COALESCE(a.summary, '')) LIKE ${searchParam}
        )`);
    }

    if (options.insertedAfter) {
        innerConditions.push(`a.created_at > ${pushParam(params, options.insertedAfter)}`);
    }

    return {
        params,
        fromSql: `
            FROM (
                SELECT
                    a.id,
                    a.source_id,
                    s.name AS source_name,
                    a.title,
                    a.summary,
                    a.published_at,
                    a.created_at AS inserted_at,
                    ${consumedExistsExpression} AS is_consumed
                FROM articles a
                JOIN sources s ON s.id = a.source_id
                WHERE ${innerConditions.join(" AND ")}
            ) candidate_articles
            ${options.includeConsumed ? "" : "WHERE is_consumed = 0"}
        `,
    };
}

export function summarizeArticleContextText(summary: string | null, content: string | null): string {
    const preview = resolveArticlePreview(summary, content);
    const base = preview.text || "No summary available.";
    return base.slice(0, MAX_CONTEXT_CHARS_PER_ARTICLE);
}

export function formatAutomationReportSupportingContextLine(
    article: Pick<AutomationReportContextArticle, "source_name" | "title" | "summary" | "content" | "published_at" | "inserted_at" | "article_url">,
): string {
    const contextText = summarizeArticleContextText(article.summary, article.content);
    const articleUrl = normalizeCitationUrl(article.article_url);

    return `- [${formatUtcDateTime(article.published_at, article.inserted_at)}] ${article.source_name}: ${article.title}${articleUrl ? ` (Article URL: ${articleUrl})` : ""}${contextText ? ` - ${contextText}` : ""}`;
}

function truncateText(value: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    return `${trimmed.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function buildAutomationInlineContextBlock(articles: AutomationArticleContextRow[]): string {
    return articles.map((article, index) => {
        const publishedAt = formatUtcDateTime(article.published_at, "Unknown");
        const contextText = summarizeArticleContextText(article.summary, article.content);
        const articleUrl = normalizeCitationUrl(article.article_url);

        return [
            `Article ${index + 1}`,
            `Source: ${article.source_name}`,
            `Title: ${article.title}`,
            `Published: ${publishedAt}`,
            ...(articleUrl ? [`Article URL: ${articleUrl}`] : []),
            `Context: ${contextText}`,
        ].join("\n");
    }).join("\n\n");
}

function normalizeAutomationProjectArticleShortlistItem(article: AutomationArticleContextRow): AutomationProjectArticleShortlistItem {
    const preview = resolveArticlePreview(article.summary, article.content).text || "No summary available.";

    return {
        id: article.id,
        source_name: article.source_name,
        title: article.title,
        preview: truncateText(preview, MAX_AUTOMATION_SHORTLIST_PREVIEW_CHARS),
        published_at: article.published_at,
        inserted_at: article.inserted_at,
        article_url: normalizeCitationUrl(article.article_url),
    };
}

function normalizeAutomationProjectArticleDetail(article: AutomationArticleContextRow): AutomationProjectArticleDetail {
    const shortlistItem = normalizeAutomationProjectArticleShortlistItem(article);

    return {
        ...shortlistItem,
        summary: compactHtmlText(article.summary ?? ""),
        content: truncateText(compactHtmlText(article.content ?? ""), MAX_AUTOMATION_DETAIL_CONTENT_CHARS),
    };
}

function buildAutomationArticleToolRecords(articles: AutomationArticleContextRow[]): AutomationArticleToolRecord[] {
    return articles.map((article) => {
        const detailItem = normalizeAutomationProjectArticleDetail(article);

        return {
            article,
            shortlistItem: {
                id: detailItem.id,
                source_name: detailItem.source_name,
                title: detailItem.title,
                preview: detailItem.preview,
                published_at: detailItem.published_at,
                inserted_at: detailItem.inserted_at,
                article_url: detailItem.article_url,
            },
            detailItem,
            searchText: [
                article.title,
                compactHtmlText(article.summary ?? ""),
                compactHtmlText(article.content ?? ""),
            ].join("\n").toLowerCase(),
        };
    });
}

function buildAutomationCoverageSummaryLines(articles: AutomationArticleContextRow[]): string[] {
    const sourceCounts = new Map<string, number>();
    let earliestTimestampMs = Number.POSITIVE_INFINITY;
    let latestTimestampMs = Number.NEGATIVE_INFINITY;
    let earliestTimestamp: string | null = null;
    let latestTimestamp: string | null = null;

    for (const article of articles) {
        sourceCounts.set(article.source_name, (sourceCounts.get(article.source_name) ?? 0) + 1);

        const timestamp = article.published_at ?? article.inserted_at;
        const timestampMs = new Date(timestamp).getTime();
        if (!Number.isFinite(timestampMs)) {
            continue;
        }

        if (timestampMs < earliestTimestampMs) {
            earliestTimestampMs = timestampMs;
            earliestTimestamp = timestamp;
        }

        if (timestampMs > latestTimestampMs) {
            latestTimestampMs = timestampMs;
            latestTimestamp = timestamp;
        }
    }

    const topSources = Array.from(sourceCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, LARGE_CONTEXT_SOURCE_SUMMARY_LIMIT)
        .map(([sourceName, count]) => `${sourceName} (${count})`)
        .join(", ");

    return [
        `- Source coverage: ${sourceCounts.size} sources${topSources ? ` - ${topSources}` : ""}`,
        `- Date coverage: ${earliestTimestamp ? formatUtcDateTime(earliestTimestamp, earliestTimestamp) : "Unknown"} to ${latestTimestamp ? formatUtcDateTime(latestTimestamp, latestTimestamp) : "Unknown"}`,
    ];
}

export function buildAutomationReportSystemPrompt(options: {
    enableWebSearch: boolean;
    usesArticleTools?: boolean;
}): string {
    const evidenceInstructions = options.enableWebSearch
        ? `- Ground every major point primarily in the supplied project articles.
- If the supplied project articles are not enough for a point that clearly needs fresher or broader context, you may use web search sparingly to verify or supplement the missing fact.
- Clearly distinguish external web findings from the supplied project articles, and cite the source URLs inline when using external web findings.
- If evidence is weak, mixed, or missing even after checking, state the uncertainty clearly.
- Do not use web search for facts already well supported by the supplied project articles.
- Do not invent facts beyond the supplied project articles and any explicitly cited web findings.`
        : `- Ground every major point in the supplied project articles.
- If evidence is weak, mixed, or missing, state the uncertainty clearly.
- Do not invent facts outside the supplied project articles.`;
    const articleToolInstructions = options.usesArticleTools
        ? `
Article tools:
- The user prompt contains only a compact article index, not full article bodies.
- Before finalizing the report, inspect the most relevant article IDs with \`get_project_articles\`; do not rely on shortlist metadata alone for detailed factual claims.
- Use \`list_project_articles\` to browse or search the scoped article set when the initial shortlist is insufficient.
- Retrieve around ${LARGE_CONTEXT_TARGET_DETAIL_ARTICLES} detailed articles by default.
- If the retrieved bodies are short, sparse, or duplicate-heavy, expand gradually up to ${LARGE_CONTEXT_MAX_DETAIL_ARTICLES} detailed articles total.
- Retrieve no more than ${LARGE_CONTEXT_DETAIL_BATCH_SIZE} article IDs per \`get_project_articles\` call.`
        : "";

    return `You are an AI assistant generating an automation report from curated news context and the user's focus prompt.

Return a JSON object with:
- title: a concise title for the report
- markdown: the report body in markdown only

Guidelines:
- Prioritize satisfying the user's focus prompt, including any requested structure, tone, depth, and output style that can be supported by the supplied evidence.
- If the user explicitly wants sections such as Key Signals, Ideas, Next Actions, or any other structure, use that structure.
- If the user does not specify a structure, choose the clearest markdown structure for the material.
- Cite non-obvious factual claims inline using numeric markdown links such as [1](https://example.com/article).
- Use only numeric markdown links for citations; do not use named links such as [Reuters](https://example.com/article).
- When citing the supplied project articles, use the matching Article URL when it is provided in the context.
- ${options.enableWebSearch ? "When citing external web findings, use the exact source URLs returned by web search." : "Do not invent or guess URLs when a supplied article has no usable Article URL."}
- Place citations at the end of the sentence or bullet they support.
- Do not output a references section, footnotes list, named-link bibliography, or bare URLs.
${evidenceInstructions}${articleToolInstructions}
- Keep the language consistent with the user's prompt.
- Do not repeat the prompt verbatim.
- Do not repeat the full report title as a top-level heading in markdown.`;
}

export function buildAutomationReportUserPrompt(
    project: Pick<AutomationProject, "prompt">,
    input: AutomationReportUserPromptInput,
): string {
    if (input.mode === "inline") {
        return `User's Focus Prompt:
${project.prompt}

Selected News Context:
${buildAutomationInlineContextBlock(input.articles)}`;
    }

    return `User's Focus Prompt:
${project.prompt}

Scoped Article Index:
- Total selected articles: ${input.totalArticles}
${input.coverageSummaryLines.join("\n")}

Recent shortlist:
${input.shortlistLines.length > 0 ? input.shortlistLines.join("\n") : "- No scoped articles are available."}

Use the article tools when the shortlist alone is not sufficient for exact factual claims.`;
}

function shouldUseInlineAutomationPrompt(
    project: Pick<AutomationProject, "prompt">,
    articles: AutomationArticleContextRow[],
): boolean {
    if (articles.length > SMALL_CONTEXT_MAX_ARTICLES) {
        return false;
    }

    return buildAutomationReportUserPrompt(project, {
        mode: "inline",
        articles,
    }).length <= SMALL_CONTEXT_MAX_PROMPT_CHARS;
}

const listProjectArticlesToolInputSchema = z.object({
    offset: z.number().int().min(0).optional().describe("Zero-based offset into the scoped article set."),
    limit: z.number().int().min(1).max(LARGE_CONTEXT_TOOL_LIST_LIMIT).optional().describe("Maximum number of shortlist rows to return."),
    search: z.string().optional().describe("Optional case-insensitive search query for title, summary, or content."),
    sourceId: z.number().int().positive().optional().describe("Optional source ID filter."),
});

const getProjectArticlesToolInputSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1).max(LARGE_CONTEXT_DETAIL_BATCH_SIZE).describe("The article IDs to inspect in detail."),
});

function createAutomationReportArticleToolContext(articles: AutomationArticleContextRow[]): {
    tools: ToolSet;
    activeTools: string[];
    getFetchedEvidenceArticleIds: () => number[];
} {
    const records = buildAutomationArticleToolRecords(articles);
    const recordsById = new Map(records.map((record) => [record.article.id, record]));
    const fetchedEvidenceArticleIds = new Set<number>();

    function filterRecords(options: { search?: string; sourceId?: number | null }): AutomationArticleToolRecord[] {
        const search = options.search?.trim().toLowerCase() ?? "";
        const sourceId = options.sourceId ? Number.parseInt(String(options.sourceId), 10) : null;

        return records.filter((record) => {
            if (sourceId && record.article.source_id !== sourceId) {
                return false;
            }

            if (search && !record.searchText.includes(search)) {
                return false;
            }

            return true;
        });
    }

    return {
        tools: {
            list_project_articles: tool({
                description: "Browse or search the scoped project articles by article ID before deciding which detailed article bodies to inspect.",
                inputSchema: listProjectArticlesToolInputSchema,
                execute: async ({ offset = 0, limit = LARGE_CONTEXT_TOOL_LIST_LIMIT, search, sourceId }) => {
                    const filteredRecords = filterRecords({ search, sourceId });
                    const safeOffset = Math.max(0, offset);
                    const safeLimit = Math.max(1, Math.min(LARGE_CONTEXT_TOOL_LIST_LIMIT, normalizePositiveInteger(limit, LARGE_CONTEXT_TOOL_LIST_LIMIT)));

                    return {
                        totalCount: filteredRecords.length,
                        items: filteredRecords
                            .slice(safeOffset, safeOffset + safeLimit)
                            .map((record) => record.shortlistItem),
                    };
                },
            }),
            get_project_articles: tool({
                description: "Fetch sanitized summaries and truncated bodies for specific scoped project article IDs. Use this before making detailed factual claims.",
                inputSchema: getProjectArticlesToolInputSchema,
                execute: async ({ ids }) => {
                    const requestedIds = sanitizeArticleIds(ids).slice(0, LARGE_CONTEXT_DETAIL_BATCH_SIZE);
                    const remainingSlots = Math.max(0, LARGE_CONTEXT_MAX_DETAIL_ARTICLES - fetchedEvidenceArticleIds.size);

                    if (remainingSlots === 0) {
                        return { items: [] as AutomationProjectArticleDetail[] };
                    }

                    const allowedIds = requestedIds
                        .filter((articleId) => recordsById.has(articleId))
                        .slice(0, remainingSlots);

                    const items = allowedIds
                        .map((articleId) => recordsById.get(articleId))
                        .filter((record): record is AutomationArticleToolRecord => !!record)
                        .map((record) => {
                            fetchedEvidenceArticleIds.add(record.article.id);
                            return record.detailItem;
                        });

                    return { items };
                },
            }),
        },
        activeTools: ["list_project_articles", "get_project_articles"],
        getFetchedEvidenceArticleIds: () => Array.from(fetchedEvidenceArticleIds),
    };
}

async function getAutomationProject(projectId: number): Promise<AutomationProject | null> {
    const db = await getDb();
    const rows = await db.select<AutomationProjectRow[]>(
        `
            ${PROJECT_SELECT_BASE_SQL}
            WHERE p.id = $1
            GROUP BY p.id
            LIMIT 1
        `,
        [projectId],
    );

    if (rows.length === 0) {
        return null;
    }

    return normalizeAutomationProject(rows[0]);
}

async function getAutomationReport(reportId: number): Promise<AutomationReport | null> {
    const db = await getDb();
    const rows = await db.select<AutomationReportRow[]>(
        `
            SELECT
                id,
                project_id,
                title,
                full_report,
                generation_mode,
                used_article_count,
                is_read,
                is_favorite,
                created_at
            FROM automation_reports
            WHERE id = $1
            LIMIT 1
        `,
        [reportId],
    );

    if (rows.length === 0) {
        return null;
    }

    return normalizeAutomationReport(rows[0]);
}

async function loadArticlesForGeneration(projectId: number, articleIds: number[]): Promise<AutomationArticleContextRow[]> {
    const sanitizedArticleIds = sanitizeArticleIds(articleIds);
    if (sanitizedArticleIds.length === 0) {
        return [];
    }

    const params: unknown[] = [];
    const articleIdList = sanitizedArticleIds.join(", ");
    const scopeCondition = buildProjectScopeCondition(projectId, params);
    const db = await getDb();

    const rows = await db.select<AutomationArticleContextRow[]>(
        `
            SELECT
                a.id,
                a.source_id,
                s.name AS source_name,
                a.title,
                a.summary,
                a.content,
                a.published_at,
                a.created_at AS inserted_at,
                a.guid AS article_url
            FROM articles a
            JOIN sources s ON s.id = a.source_id
            WHERE a.id IN (${articleIdList})
              AND ${scopeCondition}
            ORDER BY a.created_at DESC, a.id DESC
        `,
        params,
    );

    return rows.map((row) => ({
        ...row,
        article_url: normalizeCitationUrl(row.article_url),
    }));
}

async function requestAutomationReport(
    project: AutomationProject,
    articles: AutomationArticleContextRow[],
): Promise<AutomationReportGenerationResult> {
    const { generateAutomationReportDraft } = await import("@/lib/ai");
    if (shouldUseInlineAutomationPrompt(project, articles)) {
        const draft = await generateAutomationReportDraft({
            systemPrompt: buildAutomationReportSystemPrompt({
                enableWebSearch: project.web_search_enabled,
            }),
            prompt: buildAutomationReportUserPrompt(project, {
                mode: "inline",
                articles,
            }),
            enableWebSearch: project.web_search_enabled,
        });

        return {
            draft,
            evidenceArticleIds: articles.map((article) => article.id),
        };
    }

    const shortlist = buildAutomationArticleToolRecords(articles)
        .slice(0, LARGE_CONTEXT_SHORTLIST_LIMIT)
        .map((record) => record.shortlistItem);
    const articleToolContext = createAutomationReportArticleToolContext(articles);
    const draft = await generateAutomationReportDraft({
        systemPrompt: buildAutomationReportSystemPrompt({
            enableWebSearch: project.web_search_enabled,
            usesArticleTools: true,
        }),
        prompt: buildAutomationReportUserPrompt(project, {
            mode: "indexed",
            totalArticles: articles.length,
            coverageSummaryLines: buildAutomationCoverageSummaryLines(articles),
            shortlistLines: shortlist.map((article) => formatGlobalChatShortlistLine(article)),
        }),
        enableWebSearch: project.web_search_enabled,
        tools: articleToolContext.tools,
        activeTools: [
            ...articleToolContext.activeTools,
            ...(project.web_search_enabled ? ["web_search"] : []),
        ],
        maxToolSteps: LARGE_CONTEXT_TOOL_LOOP_STEPS,
    });

    const evidenceArticleIds = articleToolContext.getFetchedEvidenceArticleIds();
    if (evidenceArticleIds.length === 0) {
        throw new Error("The report generator did not inspect any article details.");
    }

    return {
        draft,
        evidenceArticleIds,
    };
}

async function persistAutomationReport(input: PersistAutomationReportCommandInput): Promise<number> {
    const result = await invoke<PersistAutomationReportCommandResult>("persist_automation_report_cmd", { input });
    return result.reportId;
}

async function performReportGeneration(
    project: AutomationProject,
    articleIds: number[],
    mode: "manual" | "auto",
    checkedAt?: string,
): Promise<AutomationReport> {
    const articles = await loadArticlesForGeneration(project.id, articleIds);
    const sanitizedArticleIds = sanitizeArticleIds(articleIds);

    if (articles.length === 0) {
        throw new Error("No eligible news articles were found for this project.");
    }

    if (articles.length !== sanitizedArticleIds.length) {
        throw new Error("Some selected articles are no longer available for this project.");
    }

    const generatedReport = await requestAutomationReport(project, articles);

    const reportId = await persistAutomationReport({
        projectId: project.id,
        title: generatedReport.draft.title.trim() || "Untitled Insight",
        fullReport: generatedReport.draft.markdown.trim(),
        generationMode: mode,
        usedArticleCount: sanitizedArticleIds.length,
        articleIds: generatedReport.evidenceArticleIds,
        checkedAt: checkedAt ?? null,
    });

    const savedReport = await getAutomationReport(reportId);
    if (!savedReport) {
        throw new Error("Failed to load the generated report.");
    }

    dispatchAutomationSyncEvent();
    return savedReport;
}

async function updateAutoAttemptTimestamp(projectId: number, attemptedAt: string) {
    const db = await getDb();
    await db.execute(
        "UPDATE automation_projects SET last_auto_attempted_at = $1 WHERE id = $2",
        [attemptedAt, projectId],
    );
    dispatchAutomationSyncEvent();
}

async function updateAutoAttemptAndConsumedTimestamps(projectId: number, attemptedAt: string) {
    const db = await getDb();
    await db.execute(
        `
            UPDATE automation_projects
            SET
                last_auto_attempted_at = $1,
                last_auto_consumed_at = $1
            WHERE id = $2
        `,
        [attemptedAt, projectId],
    );
    dispatchAutomationSyncEvent();
}

function isProjectGenerationInFlight(projectId: number): boolean {
    return inFlightProjectGenerations.has(projectId);
}

export function isAutomationProjectDueForAutoRun(project: Pick<AutomationProject, "auto_enabled" | "auto_interval_minutes" | "last_auto_attempted_at">, now: Date = new Date()): boolean {
    if (!project.auto_enabled) {
        return false;
    }

    if (!project.last_auto_attempted_at) {
        return true;
    }

    const lastAttemptedAt = new Date(project.last_auto_attempted_at).getTime();
    if (!Number.isFinite(lastAttemptedAt)) {
        return true;
    }

    const intervalMinutes = normalizePositiveInteger(project.auto_interval_minutes, DEFAULT_AUTO_INTERVAL_MINUTES);
    return now.getTime() >= lastAttemptedAt + intervalMinutes * 60 * 1000;
}

export async function listAutomationProjects(): Promise<AutomationProject[]> {
    const db = await getDb();
    const rows = await db.select<AutomationProjectRow[]>(
        `
            ${PROJECT_SELECT_BASE_SQL}
            GROUP BY p.id
            ORDER BY p.id DESC
        `,
    );
    return rows.map(normalizeAutomationProject);
}

export async function listAutomationReports(
    projectId: number,
    options: { offset?: number; limit?: number; favoritesOnly?: boolean } = {},
): Promise<AutomationReportPage> {
    const db = await getDb();
    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit != null ? Math.max(1, Math.min(200, options.limit)) : undefined;
    const favoritesOnly = Boolean(options.favoritesOnly);
    const whereClause = favoritesOnly
        ? "project_id = $1 AND is_favorite = 1"
        : "project_id = $1";

    const countRows = await db.select<{ cnt: number }[]>(
        `SELECT COUNT(*) AS cnt FROM automation_reports WHERE ${whereClause}`,
        [projectId],
    );
    const totalCount = Number(countRows[0]?.cnt) || 0;

    const params: unknown[] = [projectId];
    let sql = `
        SELECT
            id,
            project_id,
            title,
            full_report,
            generation_mode,
            used_article_count,
            is_read,
            is_favorite,
            created_at
        FROM automation_reports
        WHERE ${whereClause}
        ORDER BY id DESC
    `;

    if (limit != null) {
        sql += ` LIMIT ${pushParam(params, limit)}`;
        if (offset > 0) {
            sql += ` OFFSET ${pushParam(params, offset)}`;
        }
    }

    const rows = await db.select<AutomationReportRow[]>(sql, params);
    return { reports: rows.map(normalizeAutomationReport), totalCount };
}

export async function listAutomationSources(): Promise<AutomationSourceOption[]> {
    const db = await getDb();
    const rows = await db.select<AutomationSourceRow[]>(
        `
            SELECT
                s.id,
                s.name,
                s.active,
                COUNT(a.id) AS article_count
            FROM sources s
            LEFT JOIN articles a ON a.source_id = s.id
            GROUP BY s.id
            ORDER BY s.active DESC, s.name COLLATE NOCASE ASC
        `,
    );

    return rows.map(normalizeAutomationSource);
}

export async function saveAutomationProject(input: SaveAutomationProjectInput, projectId?: number): Promise<AutomationProject> {
    const name = input.name.trim();
    const prompt = input.prompt.trim();
    if (!name || !prompt) {
        throw new Error("Project name and prompt are required.");
    }

    const autoIntervalMinutes = normalizePositiveInteger(input.auto_interval_minutes, DEFAULT_AUTO_INTERVAL_MINUTES);
    const maxArticlesPerReport = normalizePositiveInteger(input.max_articles_per_report, DEFAULT_MAX_ARTICLES_PER_REPORT);
    const minArticlesPerReport = normalizePositiveInteger(input.min_articles_per_report, DEFAULT_MIN_ARTICLES_PER_REPORT);
    const selectedSourceIds = input.use_all_sources ? [] : sanitizeSourceIds(input.source_ids);

    if (!input.use_all_sources && selectedSourceIds.length === 0) {
        throw new Error("Select at least one source or choose all sources.");
    }

    const commandInput: SaveAutomationProjectCommandInput = {
        projectId: projectId ?? null,
        name,
        prompt,
        autoEnabled: input.auto_enabled,
        autoIntervalMinutes,
        maxArticlesPerReport,
        minArticlesPerReport,
        webSearchEnabled: input.web_search_enabled,
        sourceIds: selectedSourceIds,
    };
    const result = await invoke<SaveAutomationProjectCommandResult>("save_automation_project_cmd", { input: commandInput });

    const savedProject = await getAutomationProject(result.projectId);
    if (!savedProject) {
        throw new Error("Failed to load the saved project.");
    }

    dispatchAutomationSyncEvent();
    return savedProject;
}

export async function deleteAutomationProject(projectId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM automation_projects WHERE id = $1", [projectId]);
    dispatchAutomationSyncEvent();
}

export async function markAutomationReportAsRead(reportId: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE automation_reports SET is_read = 1 WHERE id = $1", [reportId]);
    dispatchAutomationSyncEvent();
}

export async function setAutomationReportFavorite(reportId: number, isFavorite: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
        "UPDATE automation_reports SET is_favorite = $1 WHERE id = $2",
        [isFavorite ? 1 : 0, reportId],
    );
    dispatchAutomationSyncEvent();
}

export async function markAllAutomationReportsAsRead(projectId: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE automation_reports SET is_read = 1 WHERE project_id = $1 AND is_read = 0", [projectId]);
    dispatchAutomationSyncEvent();
}

export async function listProjectCandidateArticles(
    projectId: number,
    options: {
        includeConsumed?: boolean;
        search?: string;
        sourceId?: number | null;
        limit?: number;
        insertedAfter?: string | null;
    } = {},
): Promise<AutomationArticleCandidate[]> {
    const page = await listProjectCandidateArticlePage(projectId, options);
    return page.items;
}

export async function listProjectCandidateArticlePage(
    projectId: number,
    options: {
        includeConsumed?: boolean;
        search?: string;
        sourceId?: number | null;
        offset?: number;
        limit?: number;
        insertedAfter?: string | null;
    } = {},
): Promise<AutomationArticleCandidatePage> {
    const includeConsumed = Boolean(options.includeConsumed);
    const normalizedSourceId = options.sourceId ? Number.parseInt(String(options.sourceId), 10) : null;
    const search = options.search?.trim().toLowerCase() ?? "";
    const insertedAfter = options.insertedAfter?.trim() || null;
    const offset = Math.max(0, options.offset ?? 0);
    const limit = sanitizeLimit(options.limit);
    const { fromSql, params } = buildProjectCandidateArticleQuery(projectId, {
        includeConsumed,
        sourceId: normalizedSourceId,
        search,
        insertedAfter,
    });

    const db = await getDb();
    const countRows = await db.select<{ cnt: number }[]>(
        `SELECT COUNT(*) AS cnt ${fromSql}`,
        params,
    );
    const totalCount = Number(countRows[0]?.cnt) || 0;

    const pageParams = [...params];
    let sql = `
        SELECT *
        ${fromSql}
        ORDER BY inserted_at DESC, id DESC
        LIMIT ${pushParam(pageParams, limit)}
    `;

    if (offset > 0) {
        sql += ` OFFSET ${pushParam(pageParams, offset)}`;
    }

    const rows = await db.select<AutomationArticleCandidateRow[]>(
        sql,
        pageParams,
    );

    return {
        items: rows.map(normalizeAutomationArticleCandidate),
        totalCount,
    };
}

export async function listAutomationReportSourceArticles(reportId: number): Promise<AutomationReportContextArticle[]> {
    const db = await getDb();
    const rows = await db.select<AutomationArticleContextRow[]>(
        `
            SELECT
                a.id,
                a.source_id,
                s.name AS source_name,
                a.title,
                COALESCE(a.summary, '') AS summary,
                a.content,
                a.published_at,
                a.created_at AS inserted_at,
                a.guid AS article_url
            FROM automation_report_articles report_articles
            JOIN articles a ON a.id = report_articles.article_id
            JOIN sources s ON s.id = a.source_id
            WHERE report_articles.report_id = $1
            ORDER BY a.created_at DESC, a.id DESC
        `,
        [reportId],
    );

    return rows.map((row) => ({
        ...row,
        summary: row.summary ?? "",
        article_url: normalizeCitationUrl(row.article_url),
    }));
}

export async function generateAutomationReportForProject(input: GenerateAutomationReportInput): Promise<AutomationReport> {
    const project = await getAutomationProject(input.projectId);
    if (!project) {
        throw new Error("Project not found.");
    }

    if (isProjectGenerationInFlight(project.id)) {
        throw new Error("A report is already being generated for this project.");
    }

    const promise = performReportGeneration(
        project,
        input.articleIds,
        input.mode,
        input.mode === "auto" ? input.checkedAt : undefined,
    );

    inFlightProjectGenerations.set(project.id, promise);
    try {
        return await promise;
    } finally {
        if (inFlightProjectGenerations.get(project.id) === promise) {
            inFlightProjectGenerations.delete(project.id);
        }
    }
}

async function runAutoGenerationForProject(project: AutomationProject, checkedAt: string): Promise<AutomationReport | null> {
    if (!project.auto_enabled || !isAutomationProjectDueForAutoRun(project, new Date(checkedAt))) {
        return null;
    }

    if (isProjectGenerationInFlight(project.id)) {
        return null;
    }

    const candidates = await listProjectCandidateArticles(project.id, {
        limit: project.max_articles_per_report,
        insertedAfter: project.last_auto_consumed_at,
    });

    if (candidates.length === 0) {
        await updateAutoAttemptAndConsumedTimestamps(project.id, checkedAt);
        return null;
    }

    if (candidates.length < project.min_articles_per_report) {
        // Keep the current auto-check cursor so the next run can accumulate
        // this partial batch instead of dropping it.
        await updateAutoAttemptTimestamp(project.id, checkedAt);
        return null;
    }

    return generateAutomationReportForProject({
        projectId: project.id,
        articleIds: candidates.map((candidate) => candidate.id),
        mode: "auto",
        checkedAt,
    });
}

export async function runDueAutomations(now: Date = new Date()): Promise<number> {
    const projects = await listAutomationProjects();
    let generatedCount = 0;

    for (const project of projects) {
        if (!project.auto_enabled || !isAutomationProjectDueForAutoRun(project, now)) {
            continue;
        }

        const existingAutoCheck = inFlightAutoChecks.get(project.id);
        if (existingAutoCheck) {
            try {
                await existingAutoCheck;
            } catch (error) {
                console.error(`Automation auto check failed for project ${project.id}`, error);
            }
            continue;
        }

        const checkedAt = now.toISOString();
        const autoCheckPromise = (async () => {
            try {
                return await runAutoGenerationForProject(project, checkedAt);
            } catch (error) {
                await updateAutoAttemptTimestamp(project.id, checkedAt);
                throw error;
            }
        })();

        inFlightAutoChecks.set(project.id, autoCheckPromise);
        try {
            const generatedReport = await autoCheckPromise;
            if (generatedReport) {
                generatedCount += 1;
            }
        } catch (error) {
            console.error(`Automation auto generation failed for project ${project.id}`, error);
        } finally {
            if (inFlightAutoChecks.get(project.id) === autoCheckPromise) {
                inFlightAutoChecks.delete(project.id);
            }
        }
    }

    return generatedCount;
}
