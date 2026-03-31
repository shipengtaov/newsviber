import { invoke } from "@tauri-apps/api/core";
import type { AutomationReportDraft } from "@/lib/ai";
import { resolveArticlePreview } from "@/lib/article-html";
import { dispatchAutomationSyncEvent } from "@/lib/automation-events";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/time";

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
    last_auto_checked_at: string | null;
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
    last_auto_checked_at: string | null;
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
};

const DEFAULT_AUTO_INTERVAL_MINUTES = 60;
const DEFAULT_MAX_ARTICLES_PER_REPORT = 200;
const DEFAULT_MIN_ARTICLES_PER_REPORT = 10;
const DEFAULT_CANDIDATE_LIMIT = 200;
const MAX_CONTEXT_CHARS_PER_ARTICLE = 1200;

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
        p.last_auto_checked_at,
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
        last_auto_checked_at: row.last_auto_checked_at ?? null,
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

    return Math.max(1, Math.min(500, normalizePositiveInteger(limit, DEFAULT_CANDIDATE_LIMIT)));
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

export function summarizeArticleContextText(summary: string | null, content: string | null): string {
    const preview = resolveArticlePreview(summary, content);
    const base = preview.text || "No summary available.";
    return base.slice(0, MAX_CONTEXT_CHARS_PER_ARTICLE);
}

export function buildAutomationPrompt(project: AutomationProject, articles: AutomationArticleContextRow[]): string {
    const contextLines = articles.map((article, index) => {
        const publishedAt = formatUtcDateTime(article.published_at, "Unknown");
        const contextText = summarizeArticleContextText(article.summary, article.content);

        return [
            `Article ${index + 1}`,
            `Source: ${article.source_name}`,
            `Title: ${article.title}`,
            `Published: ${publishedAt}`,
            `Context: ${contextText}`,
        ].join("\n");
    }).join("\n\n");

    const evidenceInstructions = project.web_search_enabled
        ? `- Ground every major point primarily in the supplied articles.
- If the supplied articles are not enough for a point that clearly needs fresher or broader context, you may use web search sparingly to verify or supplement the missing fact.
- Clearly distinguish external web findings from the supplied project articles, and cite the source URLs inline when using external web findings.
- If evidence is weak, mixed, or missing even after checking, state the uncertainty clearly.
- Do not use web search for facts already well supported by the supplied articles.
- Do not invent facts beyond the supplied articles and any explicitly cited web findings.`
        : `- Ground every major point in the supplied articles.
- If evidence is weak, mixed, or missing, state the uncertainty clearly.
- Do not invent facts outside the supplied articles.`;

    return `You are an AI assistant generating a report from curated news context and the user's focus prompt.

Return a JSON object with:
- title: a concise title for the report
- markdown: the report body in markdown only

Guidelines:
- Prioritize satisfying the user's focus prompt, including any requested structure, tone, depth, and output style that can be supported by the supplied evidence.
- If the user explicitly wants sections such as Key Signals, Ideas, Next Actions, or any other structure, use that structure.
- If the user does not specify a structure, choose the clearest markdown structure for the material.
- ${project.web_search_enabled ? "Prefer the supplied project articles first; use external search only when it materially improves accuracy or recency." : "Use only the supplied project articles as evidence."}
${evidenceInstructions}
- Keep the language consistent with the user's prompt.
- Do not repeat the prompt verbatim.
- Do not repeat the full report title as a top-level heading in markdown.

User's Focus Prompt:
${project.prompt}

Selected News Context:
${contextLines}`;
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
    const articleIdPlaceholders = sanitizedArticleIds.map((articleId) => pushParam(params, articleId)).join(", ");
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
                a.created_at AS inserted_at
            FROM articles a
            JOIN sources s ON s.id = a.source_id
            WHERE a.id IN (${articleIdPlaceholders})
              AND ${scopeCondition}
            ORDER BY a.created_at DESC, a.id DESC
        `,
        params,
    );

    return rows;
}

async function requestAutomationReport(
    project: AutomationProject,
    articles: AutomationArticleContextRow[],
): Promise<AutomationReportDraft> {
    const { generateAutomationReportDraft } = await import("@/lib/ai");
    return generateAutomationReportDraft({
        prompt: buildAutomationPrompt(project, articles),
        enableWebSearch: project.web_search_enabled,
    });
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
        title: generatedReport.title.trim() || "Untitled Insight",
        fullReport: generatedReport.markdown.trim(),
        generationMode: mode,
        usedArticleCount: articles.length,
        articleIds: articles.map((article) => article.id),
        checkedAt: checkedAt ?? null,
    });

    const savedReport = await getAutomationReport(reportId);
    if (!savedReport) {
        throw new Error("Failed to load the generated report.");
    }

    dispatchAutomationSyncEvent();
    return savedReport;
}

async function updateAutoCheckTimestamp(projectId: number, checkedAt: string) {
    const db = await getDb();
    await db.execute(
        "UPDATE automation_projects SET last_auto_checked_at = $1 WHERE id = $2",
        [checkedAt, projectId],
    );
    dispatchAutomationSyncEvent();
}

function isProjectGenerationInFlight(projectId: number): boolean {
    return inFlightProjectGenerations.has(projectId);
}

export function isAutomationProjectDueForAutoRun(project: Pick<AutomationProject, "auto_enabled" | "auto_interval_minutes" | "last_auto_checked_at">, now: Date = new Date()): boolean {
    if (!project.auto_enabled) {
        return false;
    }

    if (!project.last_auto_checked_at) {
        return true;
    }

    const lastCheckedAt = new Date(project.last_auto_checked_at).getTime();
    if (!Number.isFinite(lastCheckedAt)) {
        return true;
    }

    const intervalMinutes = normalizePositiveInteger(project.auto_interval_minutes, DEFAULT_AUTO_INTERVAL_MINUTES);
    return now.getTime() >= lastCheckedAt + intervalMinutes * 60 * 1000;
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
    } = {},
): Promise<AutomationArticleCandidate[]> {
    const includeConsumed = Boolean(options.includeConsumed);
    const normalizedSourceId = options.sourceId ? Number.parseInt(String(options.sourceId), 10) : null;
    const search = options.search?.trim().toLowerCase() ?? "";
    const limit = sanitizeLimit(options.limit);
    const params: unknown[] = [];
    const consumedExistsExpression = buildConsumedExistsExpression(projectId, params);
    const innerConditions = [buildProjectScopeCondition(projectId, params)];

    if (normalizedSourceId && normalizedSourceId > 0) {
        innerConditions.push(`a.source_id = ${pushParam(params, normalizedSourceId)}`);
    }

    if (search) {
        const searchParam = pushParam(params, `%${search}%`);
        innerConditions.push(`(
            LOWER(a.title) LIKE ${searchParam}
            OR LOWER(COALESCE(a.summary, '')) LIKE ${searchParam}
        )`);
    }

    const db = await getDb();
    const rows = await db.select<AutomationArticleCandidateRow[]>(
        `
            SELECT *
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
            ${includeConsumed ? "" : "WHERE is_consumed = 0"}
            ORDER BY inserted_at DESC, id DESC
            LIMIT ${limit}
        `,
        params,
    );

    return rows.map(normalizeAutomationArticleCandidate);
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
    });

    if (candidates.length === 0) {
        await updateAutoCheckTimestamp(project.id, checkedAt);
        return null;
    }

    if (candidates.length < project.min_articles_per_report) {
        await updateAutoCheckTimestamp(project.id, checkedAt);
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
                await updateAutoCheckTimestamp(project.id, checkedAt);
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
