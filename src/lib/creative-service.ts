import { invoke } from "@tauri-apps/api/core";
import type { CreativeReport } from "@/lib/ai";
import { resolveArticlePreview } from "@/lib/article-html";
import { dispatchCreativeSyncEvent } from "@/lib/creative-events";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/time";

export type CreativeProject = {
    id: number;
    name: string;
    prompt: string;
    cycle_mode: string;
    auto_enabled: boolean;
    auto_interval_minutes: number;
    max_articles_per_card: number;
    last_auto_checked_at: string | null;
    last_auto_generated_at: string | null;
    source_ids: number[];
    unread_card_count: number;
};

export type CreativeCard = {
    id: number;
    project_id: number;
    title: string;
    full_report: string;
    generation_mode: "manual" | "auto";
    used_article_count: number;
    is_read: boolean;
    created_at: string;
};

export type CreativeSourceOption = {
    id: number;
    name: string;
    active: boolean;
    article_count: number;
};

export type CreativeArticleCandidate = {
    id: number;
    source_id: number;
    source_name: string;
    title: string;
    summary: string;
    published_at: string | null;
    inserted_at: string;
    is_consumed: boolean;
};

export type SaveCreativeProjectInput = {
    name: string;
    prompt: string;
    auto_enabled: boolean;
    auto_interval_minutes: number;
    max_articles_per_card: number;
    use_all_sources: boolean;
    source_ids: number[];
};

export type GenerateCreativeCardInput = {
    projectId: number;
    articleIds: number[];
    mode: "manual" | "auto";
    checkedAt?: string;
};

type SaveCreativeProjectCommandInput = {
    projectId: number | null;
    name: string;
    prompt: string;
    autoEnabled: boolean;
    autoIntervalMinutes: number;
    maxArticlesPerCard: number;
    sourceIds: number[];
};

type SaveCreativeProjectCommandResult = {
    projectId: number;
};

type PersistCreativeCardCommandInput = {
    projectId: number;
    title: string;
    fullReport: string;
    generationMode: "manual" | "auto";
    usedArticleCount: number;
    articleIds: number[];
    checkedAt: string | null;
};

type PersistCreativeCardCommandResult = {
    cardId: number;
};

type CreativeProjectRow = {
    id: number;
    name: string;
    prompt: string;
    cycle_mode: string;
    auto_enabled: number | boolean;
    auto_interval_minutes: number;
    max_articles_per_card: number;
    last_auto_checked_at: string | null;
    last_auto_generated_at: string | null;
    source_ids_csv: string | null;
    unread_card_count: number | null;
};

type CreativeCardRow = {
    id: number;
    project_id: number;
    title: string;
    full_report: string | null;
    generation_mode: string | null;
    used_article_count: number | null;
    is_read: number | boolean | string | null;
    created_at: string;
};

type CreativeSourceRow = {
    id: number;
    name: string;
    active: number | boolean;
    article_count: number | null;
};

type CreativeArticleCandidateRow = {
    id: number;
    source_id: number;
    source_name: string;
    title: string;
    summary: string | null;
    published_at: string | null;
    inserted_at: string;
    is_consumed: number | boolean;
};

type CreativeArticleContextRow = {
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
const DEFAULT_MAX_ARTICLES_PER_CARD = 12;
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
        p.max_articles_per_card,
        p.last_auto_checked_at,
        p.last_auto_generated_at,
        (
            SELECT COUNT(*)
            FROM creative_cards unread_cards
            WHERE unread_cards.project_id = p.id
              AND unread_cards.is_read = 0
        ) AS unread_card_count,
        GROUP_CONCAT(ps.source_id) AS source_ids_csv
    FROM creative_projects p
    LEFT JOIN creative_project_sources ps ON ps.project_id = p.id
`;

const inFlightProjectGenerations = new Map<number, Promise<CreativeCard>>();
const inFlightAutoChecks = new Map<number, Promise<CreativeCard | null>>();

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

function normalizeCreativeProject(row: CreativeProjectRow): CreativeProject {
    return {
        id: row.id,
        name: row.name,
        prompt: row.prompt,
        cycle_mode: row.cycle_mode,
        auto_enabled: normalizeBoolean(row.auto_enabled),
        auto_interval_minutes: normalizePositiveInteger(row.auto_interval_minutes, DEFAULT_AUTO_INTERVAL_MINUTES),
        max_articles_per_card: normalizePositiveInteger(row.max_articles_per_card, DEFAULT_MAX_ARTICLES_PER_CARD),
        last_auto_checked_at: row.last_auto_checked_at ?? null,
        last_auto_generated_at: row.last_auto_generated_at ?? null,
        source_ids: parseCsvNumbers(row.source_ids_csv),
        unread_card_count: Math.max(0, Number(row.unread_card_count) || 0),
    };
}

function normalizeCreativeCard(row: CreativeCardRow): CreativeCard {
    const generationMode = row.generation_mode === "auto" ? "auto" : "manual";

    return {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        full_report: row.full_report ?? "",
        generation_mode: generationMode,
        used_article_count: normalizePositiveInteger(row.used_article_count, 0),
        is_read: normalizeBoolean(row.is_read),
        created_at: row.created_at,
    };
}

function normalizeCreativeSource(row: CreativeSourceRow): CreativeSourceOption {
    return {
        id: row.id,
        name: row.name,
        active: normalizeBoolean(row.active),
        article_count: Number(row.article_count) || 0,
    };
}

function normalizeCreativeArticleCandidate(row: CreativeArticleCandidateRow): CreativeArticleCandidate {
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
            FROM creative_project_sources scope_sources
            WHERE scope_sources.project_id = ${noScopeProjectParam}
        )
        OR ${articleAlias}.source_id IN (
            SELECT scoped_sources.source_id
            FROM creative_project_sources scoped_sources
            WHERE scoped_sources.project_id = ${scopedProjectParam}
        )
    )`;
}

function buildConsumedExistsExpression(projectId: number, params: unknown[], articleAlias = "a"): string {
    const projectParam = pushParam(params, projectId);

    return `EXISTS (
        SELECT 1
        FROM creative_card_articles consumed_articles
        JOIN creative_cards consumed_cards ON consumed_cards.id = consumed_articles.card_id
        WHERE consumed_cards.project_id = ${projectParam}
          AND consumed_articles.article_id = ${articleAlias}.id
    )`;
}

export function summarizeArticleContextText(summary: string | null, content: string | null): string {
    const preview = resolveArticlePreview(summary, content);
    const base = preview.text || "No summary available.";
    return base.slice(0, MAX_CONTEXT_CHARS_PER_ARTICLE);
}

export function buildCreativePrompt(project: CreativeProject, articles: CreativeArticleContextRow[]): string {
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

    return `You are an AI assistant generating a report from curated news context and the user's focus prompt.

Return a JSON object with:
- title: a concise title for the report
- markdown: the report body in markdown only

Guidelines:
- Prioritize satisfying the user's focus prompt, including any requested structure, tone, depth, and output style that can be supported by the supplied evidence.
- If the user explicitly wants sections such as Key Signals, Ideas, Next Actions, or any other structure, use that structure.
- If the user does not specify a structure, choose the clearest markdown structure for the material.
- Ground every major point in the supplied articles.
- If evidence is weak, mixed, or missing, state the uncertainty clearly.
- Keep the language consistent with the user's prompt.
- Do not invent facts outside the supplied articles.
- Do not repeat the prompt verbatim.
- Do not repeat the full report title as a top-level heading in markdown.

User's Focus Prompt:
${project.prompt}

Selected News Context:
${contextLines}`;
}

async function getCreativeProject(projectId: number): Promise<CreativeProject | null> {
    const db = await getDb();
    const rows = await db.select<CreativeProjectRow[]>(
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

    return normalizeCreativeProject(rows[0]);
}

async function getCreativeCard(cardId: number): Promise<CreativeCard | null> {
    const db = await getDb();
    const rows = await db.select<CreativeCardRow[]>(
        `
            SELECT
                id,
                project_id,
                title,
                full_report,
                generation_mode,
                used_article_count,
                is_read,
                created_at
            FROM creative_cards
            WHERE id = $1
            LIMIT 1
        `,
        [cardId],
    );

    if (rows.length === 0) {
        return null;
    }

    return normalizeCreativeCard(rows[0]);
}

async function loadArticlesForGeneration(projectId: number, articleIds: number[]): Promise<CreativeArticleContextRow[]> {
    const sanitizedArticleIds = sanitizeArticleIds(articleIds);
    if (sanitizedArticleIds.length === 0) {
        return [];
    }

    const params: unknown[] = [];
    const articleIdPlaceholders = sanitizedArticleIds.map((articleId) => pushParam(params, articleId)).join(", ");
    const scopeCondition = buildProjectScopeCondition(projectId, params);
    const db = await getDb();

    const rows = await db.select<CreativeArticleContextRow[]>(
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

async function requestCreativeReport(
    project: CreativeProject,
    articles: CreativeArticleContextRow[],
): Promise<CreativeReport> {
    const { generateCreativeReport } = await import("@/lib/ai");
    return generateCreativeReport(buildCreativePrompt(project, articles));
}

async function persistCreativeCard(input: PersistCreativeCardCommandInput): Promise<number> {
    const result = await invoke<PersistCreativeCardCommandResult>("persist_creative_card_cmd", { input });
    return result.cardId;
}

async function performCardGeneration(
    project: CreativeProject,
    articleIds: number[],
    mode: "manual" | "auto",
    checkedAt?: string,
): Promise<CreativeCard> {
    const articles = await loadArticlesForGeneration(project.id, articleIds);
    const sanitizedArticleIds = sanitizeArticleIds(articleIds);

    if (articles.length === 0) {
        throw new Error("No eligible news articles were found for this project.");
    }

    if (articles.length !== sanitizedArticleIds.length) {
        throw new Error("Some selected articles are no longer available for this project.");
    }

    const generatedReport = await requestCreativeReport(project, articles);

    const cardId = await persistCreativeCard({
        projectId: project.id,
        title: generatedReport.title.trim() || "Untitled Insight",
        fullReport: generatedReport.markdown.trim(),
        generationMode: mode,
        usedArticleCount: articles.length,
        articleIds: articles.map((article) => article.id),
        checkedAt: checkedAt ?? null,
    });

    const savedCard = await getCreativeCard(cardId);
    if (!savedCard) {
        throw new Error("Failed to load the generated creative card.");
    }

    dispatchCreativeSyncEvent();
    return savedCard;
}

async function updateAutoCheckTimestamp(projectId: number, checkedAt: string) {
    const db = await getDb();
    await db.execute(
        "UPDATE creative_projects SET last_auto_checked_at = $1 WHERE id = $2",
        [checkedAt, projectId],
    );
    dispatchCreativeSyncEvent();
}

function isProjectGenerationInFlight(projectId: number): boolean {
    return inFlightProjectGenerations.has(projectId);
}

export function isProjectDueForAutoRun(project: Pick<CreativeProject, "auto_enabled" | "auto_interval_minutes" | "last_auto_checked_at">, now: Date = new Date()): boolean {
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

export async function listCreativeProjects(): Promise<CreativeProject[]> {
    const db = await getDb();
    const rows = await db.select<CreativeProjectRow[]>(
        `
            ${PROJECT_SELECT_BASE_SQL}
            GROUP BY p.id
            ORDER BY p.id DESC
        `,
    );
    return rows.map(normalizeCreativeProject);
}

export async function listCreativeCards(projectId: number): Promise<CreativeCard[]> {
    const db = await getDb();
    const rows = await db.select<CreativeCardRow[]>(
        `
            SELECT
                id,
                project_id,
                title,
                full_report,
                generation_mode,
                used_article_count,
                is_read,
                created_at
            FROM creative_cards
            WHERE project_id = $1
            ORDER BY id DESC
        `,
        [projectId],
    );

    return rows.map(normalizeCreativeCard);
}

export async function listCreativeSources(): Promise<CreativeSourceOption[]> {
    const db = await getDb();
    const rows = await db.select<CreativeSourceRow[]>(
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

    return rows.map(normalizeCreativeSource);
}

export async function saveCreativeProject(input: SaveCreativeProjectInput, projectId?: number): Promise<CreativeProject> {
    const name = input.name.trim();
    const prompt = input.prompt.trim();
    if (!name || !prompt) {
        throw new Error("Project name and prompt are required.");
    }

    const autoIntervalMinutes = normalizePositiveInteger(input.auto_interval_minutes, DEFAULT_AUTO_INTERVAL_MINUTES);
    const maxArticlesPerCard = normalizePositiveInteger(input.max_articles_per_card, DEFAULT_MAX_ARTICLES_PER_CARD);
    const selectedSourceIds = input.use_all_sources ? [] : sanitizeSourceIds(input.source_ids);

    if (!input.use_all_sources && selectedSourceIds.length === 0) {
        throw new Error("Select at least one source or choose all sources.");
    }

    const commandInput: SaveCreativeProjectCommandInput = {
        projectId: projectId ?? null,
        name,
        prompt,
        autoEnabled: input.auto_enabled,
        autoIntervalMinutes,
        maxArticlesPerCard,
        sourceIds: selectedSourceIds,
    };
    const result = await invoke<SaveCreativeProjectCommandResult>("save_creative_project_cmd", { input: commandInput });

    const savedProject = await getCreativeProject(result.projectId);
    if (!savedProject) {
        throw new Error("Failed to load the saved project.");
    }

    dispatchCreativeSyncEvent();
    return savedProject;
}

export async function deleteCreativeProject(projectId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM creative_projects WHERE id = $1", [projectId]);
    dispatchCreativeSyncEvent();
}

export async function markCreativeCardAsRead(cardId: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE creative_cards SET is_read = 1 WHERE id = $1", [cardId]);
    dispatchCreativeSyncEvent();
}

export async function markAllCreativeCardsAsRead(projectId: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE creative_cards SET is_read = 1 WHERE project_id = $1 AND is_read = 0", [projectId]);
    dispatchCreativeSyncEvent();
}

export async function listProjectCandidateArticles(
    projectId: number,
    options: {
        includeConsumed?: boolean;
        search?: string;
        sourceId?: number | null;
        limit?: number;
    } = {},
): Promise<CreativeArticleCandidate[]> {
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
    const rows = await db.select<CreativeArticleCandidateRow[]>(
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

    return rows.map(normalizeCreativeArticleCandidate);
}

export async function generateCreativeCardForProject(input: GenerateCreativeCardInput): Promise<CreativeCard> {
    const project = await getCreativeProject(input.projectId);
    if (!project) {
        throw new Error("Creative project not found.");
    }

    if (isProjectGenerationInFlight(project.id)) {
        throw new Error("A card is already being generated for this project.");
    }

    const promise = performCardGeneration(
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

async function runAutoGenerationForProject(project: CreativeProject, checkedAt: string): Promise<CreativeCard | null> {
    if (!project.auto_enabled || !isProjectDueForAutoRun(project, new Date(checkedAt))) {
        return null;
    }

    if (isProjectGenerationInFlight(project.id)) {
        return null;
    }

    const candidates = await listProjectCandidateArticles(project.id, {
        limit: project.max_articles_per_card,
    });

    if (candidates.length === 0) {
        await updateAutoCheckTimestamp(project.id, checkedAt);
        return null;
    }

    return generateCreativeCardForProject({
        projectId: project.id,
        articleIds: candidates.map((candidate) => candidate.id),
        mode: "auto",
        checkedAt,
    });
}

export async function runDueAutoCreativeProjects(now: Date = new Date()): Promise<number> {
    const projects = await listCreativeProjects();
    let generatedCount = 0;

    for (const project of projects) {
        if (!project.auto_enabled || !isProjectDueForAutoRun(project, now)) {
            continue;
        }

        const existingAutoCheck = inFlightAutoChecks.get(project.id);
        if (existingAutoCheck) {
            try {
                await existingAutoCheck;
            } catch (error) {
                console.error(`Creative auto check failed for project ${project.id}`, error);
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
            const generatedCard = await autoCheckPromise;
            if (generatedCard) {
                generatedCount += 1;
            }
        } catch (error) {
            console.error(`Creative auto generation failed for project ${project.id}`, error);
        } finally {
            if (inFlightAutoChecks.get(project.id) === autoCheckPromise) {
                inFlightAutoChecks.delete(project.id);
            }
        }
    }

    return generatedCount;
}
