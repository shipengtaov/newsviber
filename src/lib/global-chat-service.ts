import { invoke } from "@tauri-apps/api/core";
import type { Message } from "@/lib/ai";
import { compactHtmlText, resolveArticlePreview } from "@/lib/article-html";
import { normalizeCitationUrl } from "@/lib/citations";
import { getDb } from "@/lib/db";
import i18n from "@/lib/i18n";

export type GlobalChatTimeRangeMode = "preset" | "custom";
export type GlobalChatMessageRole = Exclude<Message["role"], "system">;

export type GlobalChatThread = {
    id: number;
    title: string;
    time_range_mode: GlobalChatTimeRangeMode;
    preset_days: number | null;
    custom_start_date: string | null;
    custom_end_date: string | null;
    source_ids: number[];
    created_at: string;
    updated_at: string;
};

export type GlobalChatMessage = {
    id: number;
    thread_id: number;
    role: GlobalChatMessageRole;
    content: string;
    created_at: string;
};

export type GlobalChatSourceOption = {
    id: number;
    name: string;
    active: boolean;
    article_count: number;
    matching_article_count: number;
};

export type GlobalChatScopeInput = {
    title?: string;
    time_range_mode: GlobalChatTimeRangeMode;
    preset_days: number | null;
    custom_start_date: string | null;
    custom_end_date: string | null;
    source_ids: number[];
};

export type GlobalChatArticleContextRow = {
    id?: number;
    source_name: string;
    title: string;
    summary: string;
    published_at: string | null;
    inserted_at: string;
    article_url: string | null;
};

export type GlobalChatArticleShortlistItem = {
    id: number;
    source_name: string;
    title: string;
    preview: string;
    published_at: string | null;
    inserted_at: string;
    article_url: string | null;
};

export type GlobalChatArticleDetail = GlobalChatArticleShortlistItem & {
    summary: string;
    content: string;
};

type SaveChatThreadScopeCommandInput = {
    threadId: number | null;
    title?: string;
    timeRangeMode: GlobalChatTimeRangeMode;
    presetDays: number | null;
    customStartDate: string | null;
    customEndDate: string | null;
    sourceIds: number[];
};

type SaveChatThreadScopeCommandResult = {
    threadId: number;
};

type PersistChatMessageCommandInput = {
    threadId: number;
    role: GlobalChatMessageRole;
    content: string;
};

type PersistChatMessageCommandResult = {
    messageId: number;
};

type GlobalChatThreadRow = {
    id: number;
    title: string;
    time_range_mode: string | null;
    preset_days: number | null;
    custom_start_date: string | null;
    custom_end_date: string | null;
    source_ids_csv: string | null;
    created_at: string;
    updated_at: string;
};

type GlobalChatMessageRow = {
    id: number;
    thread_id: number;
    role: string | null;
    content: string;
    created_at: string;
};

type GlobalChatSourceRow = {
    id: number;
    name: string;
    active: number | boolean;
    article_count: number | null;
    matching_article_count: number | null;
};

type GlobalChatArticleRecordRow = {
    id: number;
    source_name: string;
    title: string;
    summary: string | null;
    content: string | null;
    published_at: string | null;
    inserted_at: string;
    article_url: string | null;
};

type GlobalChatContextQueryParts = {
    conditions: string[];
    params: Array<number | string>;
    event_timestamp_expression: string;
};

const GLOBAL_CHAT_PRESET_DAY_SET = new Set([1, 3, 7, 30]);
const DEFAULT_GLOBAL_CHAT_PRESET_DAYS = 7;
const DEFAULT_GLOBAL_CHAT_TITLE_MAX_LENGTH = 60;
const DEFAULT_GLOBAL_CHAT_CONTEXT_LIMIT = 50;
const DEFAULT_GLOBAL_CHAT_SHORTLIST_LIMIT = 12;
const DEFAULT_GLOBAL_CHAT_SEARCH_LIMIT = 6;
const MAX_GLOBAL_CHAT_SHORTLIST_PREVIEW_CHARS = 280;
const MAX_GLOBAL_CHAT_DETAIL_CONTENT_CHARS = 4000;
const GLOBAL_CHAT_THREAD_SELECT_BASE_SQL = `
    SELECT
        t.id,
        t.title,
        t.time_range_mode,
        t.preset_days,
        t.custom_start_date,
        t.custom_end_date,
        t.created_at,
        t.updated_at,
        GROUP_CONCAT(ts.source_id) AS source_ids_csv
    FROM chat_threads t
    LEFT JOIN chat_thread_sources ts ON ts.thread_id = t.id
`;

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

function sanitizeSourceIds(sourceIds: number[]): number[] {
    const seen = new Set<number>();

    for (const sourceId of sourceIds) {
        const parsed = Number.parseInt(String(sourceId), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            seen.add(parsed);
        }
    }

    return Array.from(seen);
}

function sanitizeArticleIds(articleIds: number[]): number[] {
    const seen = new Set<number>();

    for (const articleId of articleIds) {
        const parsed = Number.parseInt(String(articleId), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            seen.add(parsed);
        }
    }

    return Array.from(seen);
}

function normalizePresetDays(value: unknown): number {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return GLOBAL_CHAT_PRESET_DAY_SET.has(parsed) ? parsed : DEFAULT_GLOBAL_CHAT_PRESET_DAYS;
}

function padDatePart(value: number): string {
    return String(value).padStart(2, "0");
}

export function formatLocalDateInputValue(date: Date): string {
    return [
        date.getFullYear(),
        padDatePart(date.getMonth() + 1),
        padDatePart(date.getDate()),
    ].join("-");
}

function parseLocalDateInputValue(value: string): Date | null {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return null;
    }

    const [year, month, day] = trimmed.split("-").map((part) => Number.parseInt(part, 10));
    const parsed = new Date(year, month - 1, day);
    if (
        parsed.getFullYear() !== year
        || parsed.getMonth() !== month - 1
        || parsed.getDate() !== day
    ) {
        return null;
    }

    return parsed;
}

function isValidLocalDateInputValue(value: string | null | undefined): value is string {
    return typeof value === "string" && parseLocalDateInputValue(value) !== null;
}

function shiftLocalDate(date: Date, deltaDays: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + deltaDays);
}

export function createGlobalChatCustomRangeFromPresetDays(presetDays: number, now: Date = new Date()): Pick<GlobalChatScopeInput, "custom_start_date" | "custom_end_date"> {
    const normalizedPresetDays = normalizePresetDays(presetDays);
    const endDate = formatLocalDateInputValue(now);
    const startDate = formatLocalDateInputValue(shiftLocalDate(now, -(normalizedPresetDays - 1)));

    return {
        custom_start_date: startDate,
        custom_end_date: endDate,
    };
}

export function createDefaultGlobalChatScopeInput(): GlobalChatScopeInput {
    return {
        time_range_mode: "preset",
        preset_days: DEFAULT_GLOBAL_CHAT_PRESET_DAYS,
        custom_start_date: null,
        custom_end_date: null,
        source_ids: [],
    };
}

export function normalizeGlobalChatScopeInput(input: Partial<GlobalChatScopeInput>): GlobalChatScopeInput {
    const timeRangeMode = input.time_range_mode === "custom" ? "custom" : "preset";
    const sourceIds = sanitizeSourceIds(input.source_ids ?? []);

    if (timeRangeMode === "custom") {
        const today = formatLocalDateInputValue(new Date());
        const parsedStart = isValidLocalDateInputValue(input.custom_start_date) ? input.custom_start_date : today;
        const parsedEnd = isValidLocalDateInputValue(input.custom_end_date) ? input.custom_end_date : parsedStart;
        const [customStartDate, customEndDate] = parsedStart <= parsedEnd
            ? [parsedStart, parsedEnd]
            : [parsedEnd, parsedStart];

        return {
            title: input.title?.trim() || undefined,
            time_range_mode: "custom",
            preset_days: null,
            custom_start_date: customStartDate,
            custom_end_date: customEndDate,
            source_ids: sourceIds,
        };
    }

    return {
        title: input.title?.trim() || undefined,
        time_range_mode: "preset",
        preset_days: normalizePresetDays(input.preset_days),
        custom_start_date: null,
        custom_end_date: null,
        source_ids: sourceIds,
    };
}

export function buildGlobalChatTitle(content: string, maxLength = DEFAULT_GLOBAL_CHAT_TITLE_MAX_LENGTH): string {
    const normalized = content.replace(/\s+/g, " ").trim() || i18n.t("chat:newChatTitle");
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export function buildGlobalChatCustomRangeBounds(startDate: string, endDate: string): { startUtcIso: string; endExclusiveUtcIso: string } {
    const parsedStart = parseLocalDateInputValue(startDate);
    const parsedEnd = parseLocalDateInputValue(endDate);
    if (!parsedStart || !parsedEnd) {
        throw new Error("Custom date range must use valid YYYY-MM-DD dates.");
    }

    const normalizedStart = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
    const normalizedEnd = parsedStart <= parsedEnd ? parsedEnd : parsedStart;
    const endExclusive = shiftLocalDate(normalizedEnd, 1);

    return {
        startUtcIso: normalizedStart.toISOString(),
        endExclusiveUtcIso: endExclusive.toISOString(),
    };
}

function pushParam(params: Array<number | string>, value: number | string): string {
    params.push(value);
    return `$${params.length}`;
}

export function buildGlobalChatEventTimestampExpression(articleAlias: string): string {
    return `COALESCE(
        CASE
            WHEN ${articleAlias}.published_at IS NOT NULL
             AND julianday(${articleAlias}.published_at) IS NOT NULL
            THEN ${articleAlias}.published_at
        END,
        ${articleAlias}.created_at
    )`;
}

export function buildGlobalChatArticleQueryParts(input: Partial<GlobalChatScopeInput>): GlobalChatContextQueryParts {
    const scope = normalizeGlobalChatScopeInput(input);
    const params: Array<number | string> = [];
    const eventTimestampExpression = buildGlobalChatEventTimestampExpression("a");
    const conditions = ["s.active = 1", buildGlobalChatTimeRangeCondition(scope, params, "a")];

    const sourceIds = sanitizeSourceIds(scope.source_ids);
    if (sourceIds.length > 0) {
        const sourcePlaceholders = sourceIds.map((sourceId) => pushParam(params, sourceId)).join(", ");
        const activeSelectedSourceSubquery = `
            SELECT selected_sources.id
            FROM sources selected_sources
            WHERE selected_sources.active = 1
              AND selected_sources.id IN (${sourcePlaceholders})
        `;

        conditions.push(`(
            NOT EXISTS (${activeSelectedSourceSubquery})
            OR a.source_id IN (${activeSelectedSourceSubquery})
        )`);
    }

    return {
        conditions,
        params,
        event_timestamp_expression: eventTimestampExpression,
    };
}

function buildGlobalChatTimeRangeCondition(
    scope: GlobalChatScopeInput,
    params: Array<number | string>,
    articleAlias: string,
): string {
    const eventTimestampExpression = buildGlobalChatEventTimestampExpression(articleAlias);

    if (scope.time_range_mode === "custom") {
        const { startUtcIso, endExclusiveUtcIso } = buildGlobalChatCustomRangeBounds(
            scope.custom_start_date ?? formatLocalDateInputValue(new Date()),
            scope.custom_end_date ?? formatLocalDateInputValue(new Date()),
        );

        return `(
            julianday(${eventTimestampExpression}) >= julianday(${pushParam(params, startUtcIso)})
            AND julianday(${eventTimestampExpression}) < julianday(${pushParam(params, endExclusiveUtcIso)})
        )`;
    }

    return `julianday(${eventTimestampExpression}) >= julianday('now', '-${normalizePresetDays(scope.preset_days)} days')`;
}

export function normalizeGlobalChatThread(row: GlobalChatThreadRow): GlobalChatThread {
    return {
        id: row.id,
        title: row.title.trim() || i18n.t("chat:untitledChat"),
        time_range_mode: row.time_range_mode === "custom" ? "custom" : "preset",
        preset_days: row.time_range_mode === "custom" ? null : normalizePresetDays(row.preset_days),
        custom_start_date: row.time_range_mode === "custom" && isValidLocalDateInputValue(row.custom_start_date) ? row.custom_start_date : null,
        custom_end_date: row.time_range_mode === "custom" && isValidLocalDateInputValue(row.custom_end_date) ? row.custom_end_date : null,
        source_ids: sanitizeSourceIds(parseCsvNumbers(row.source_ids_csv)),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export function normalizeGlobalChatMessage(row: GlobalChatMessageRow): GlobalChatMessage {
    return {
        id: row.id,
        thread_id: row.thread_id,
        role: row.role === "assistant" ? "assistant" : "user",
        content: row.content,
        created_at: row.created_at,
    };
}

function normalizeGlobalChatSource(row: GlobalChatSourceRow): GlobalChatSourceOption {
    return {
        id: row.id,
        name: row.name,
        active: normalizeBoolean(row.active),
        article_count: Number(row.article_count) || 0,
        matching_article_count: Number(row.matching_article_count) || 0,
    };
}

function truncateText(value: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    return `${trimmed.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function buildGlobalChatArticlePreview(summary: string | null | undefined, content: string | null | undefined): string {
    const preview = resolveArticlePreview(summary, content).text || "No summary available.";
    return truncateText(preview, MAX_GLOBAL_CHAT_SHORTLIST_PREVIEW_CHARS);
}

function normalizeGlobalChatArticleShortlistRow(row: GlobalChatArticleRecordRow): GlobalChatArticleShortlistItem {
    return {
        id: row.id,
        source_name: row.source_name,
        title: row.title,
        preview: buildGlobalChatArticlePreview(row.summary, row.content),
        published_at: row.published_at ?? null,
        inserted_at: row.inserted_at,
        article_url: normalizeCitationUrl(row.article_url),
    };
}

function normalizeGlobalChatArticleDetailRow(row: GlobalChatArticleRecordRow): GlobalChatArticleDetail {
    const shortlistItem = normalizeGlobalChatArticleShortlistRow(row);

    return {
        ...shortlistItem,
        summary: compactHtmlText(row.summary ?? ""),
        content: truncateText(compactHtmlText(row.content ?? ""), MAX_GLOBAL_CHAT_DETAIL_CONTENT_CHARS),
    };
}

function toSaveChatThreadScopeCommandInput(input: GlobalChatScopeInput, threadId?: number): SaveChatThreadScopeCommandInput {
    const normalized = normalizeGlobalChatScopeInput(input);
    return {
        threadId: threadId ?? null,
        title: normalized.title,
        timeRangeMode: normalized.time_range_mode,
        presetDays: normalized.preset_days,
        customStartDate: normalized.custom_start_date,
        customEndDate: normalized.custom_end_date,
        sourceIds: normalized.source_ids,
    };
}

export async function listGlobalChatThreads(): Promise<GlobalChatThread[]> {
    const db = await getDb();
    const rows = await db.select<GlobalChatThreadRow[]>(
        `
            ${GLOBAL_CHAT_THREAD_SELECT_BASE_SQL}
            GROUP BY t.id
            ORDER BY t.updated_at DESC, t.id DESC
        `,
    );

    return rows.map(normalizeGlobalChatThread);
}

export async function getGlobalChatThread(threadId: number): Promise<GlobalChatThread | null> {
    const db = await getDb();
    const rows = await db.select<GlobalChatThreadRow[]>(
        `
            ${GLOBAL_CHAT_THREAD_SELECT_BASE_SQL}
            WHERE t.id = $1
            GROUP BY t.id
            LIMIT 1
        `,
        [threadId],
    );

    return rows.length > 0 ? normalizeGlobalChatThread(rows[0]) : null;
}

export async function listGlobalChatMessages(threadId: number): Promise<GlobalChatMessage[]> {
    const db = await getDb();
    const rows = await db.select<GlobalChatMessageRow[]>(
        `
            SELECT id, thread_id, role, content, created_at
            FROM chat_messages
            WHERE thread_id = $1
            ORDER BY created_at ASC, id ASC
        `,
        [threadId],
    );

    return rows.map(normalizeGlobalChatMessage);
}

export async function listGlobalChatSources(scopeInput: Partial<GlobalChatScopeInput> = createDefaultGlobalChatScopeInput()): Promise<GlobalChatSourceOption[]> {
    const db = await getDb();
    const scope = normalizeGlobalChatScopeInput(scopeInput);
    const params: Array<number | string> = [];
    const matchingTimeRangeCondition = buildGlobalChatTimeRangeCondition(scope, params, "a");
    const rows = await db.select<GlobalChatSourceRow[]>(
        `
            SELECT
                s.id,
                s.name,
                s.active,
                COUNT(a.id) AS article_count,
                SUM(CASE WHEN ${matchingTimeRangeCondition} THEN 1 ELSE 0 END) AS matching_article_count
            FROM sources s
            LEFT JOIN articles a ON a.source_id = s.id
            WHERE s.active = 1
            GROUP BY s.id
            ORDER BY s.name COLLATE NOCASE ASC
        `,
        params,
    );

    return rows.map(normalizeGlobalChatSource);
}

export async function saveGlobalChatThreadScope(input: GlobalChatScopeInput, threadId?: number): Promise<GlobalChatThread> {
    const commandInput = toSaveChatThreadScopeCommandInput(input, threadId);
    const result = await invoke<SaveChatThreadScopeCommandResult>("save_chat_thread_scope_cmd", { input: commandInput });
    const savedThread = await getGlobalChatThread(result.threadId);

    if (!savedThread) {
        throw new Error("Failed to load the saved chat thread.");
    }

    return savedThread;
}

export async function persistGlobalChatMessage(input: PersistChatMessageCommandInput): Promise<number> {
    const content = input.content.trim();
    if (!content) {
        throw new Error("Chat message content is required.");
    }

    const result = await invoke<PersistChatMessageCommandResult>("persist_chat_message_cmd", {
        input: {
            threadId: input.threadId,
            role: input.role,
            content,
        },
    });

    return result.messageId;
}

export async function deleteGlobalChatThread(threadId: number): Promise<void> {
    await invoke("delete_chat_thread_cmd", {
        input: { threadId },
    });
}

export async function listGlobalChatContextArticles(input: Partial<GlobalChatScopeInput>, limit = DEFAULT_GLOBAL_CHAT_CONTEXT_LIMIT): Promise<GlobalChatArticleContextRow[]> {
    const sanitizedLimit = Math.max(1, Math.min(200, Number.parseInt(String(limit), 10) || DEFAULT_GLOBAL_CHAT_CONTEXT_LIMIT));
    const db = await getDb();
    const queryParts = buildGlobalChatArticleQueryParts(input);
    const rows = await db.select<GlobalChatArticleContextRow[]>(
        `
            SELECT
                s.name AS source_name,
                a.title,
                COALESCE(a.summary, '') AS summary,
                a.published_at,
                a.created_at AS inserted_at,
                a.guid AS article_url
            FROM articles a
            JOIN sources s ON s.id = a.source_id
            WHERE ${queryParts.conditions.join(" AND ")}
            ORDER BY julianday(${queryParts.event_timestamp_expression}) DESC, a.id DESC
            LIMIT ${sanitizedLimit}
        `,
        queryParts.params,
    );

    return rows.map((row) => ({
        source_name: row.source_name,
        title: row.title,
        summary: compactHtmlText(row.summary ?? ""),
        published_at: row.published_at ?? null,
        inserted_at: row.inserted_at,
        article_url: normalizeCitationUrl(row.article_url),
    }));
}

export async function listGlobalChatShortlistArticles(input: Partial<GlobalChatScopeInput>, limit = DEFAULT_GLOBAL_CHAT_SHORTLIST_LIMIT): Promise<GlobalChatArticleShortlistItem[]> {
    const sanitizedLimit = Math.max(1, Math.min(50, Number.parseInt(String(limit), 10) || DEFAULT_GLOBAL_CHAT_SHORTLIST_LIMIT));
    const db = await getDb();
    const queryParts = buildGlobalChatArticleQueryParts(input);
    const rows = await db.select<GlobalChatArticleRecordRow[]>(
        `
            SELECT
                a.id,
                s.name AS source_name,
                a.title,
                a.summary,
                a.content,
                a.published_at,
                a.created_at AS inserted_at,
                a.guid AS article_url
            FROM articles a
            JOIN sources s ON s.id = a.source_id
            WHERE ${queryParts.conditions.join(" AND ")}
            ORDER BY julianday(${queryParts.event_timestamp_expression}) DESC, a.id DESC
            LIMIT ${sanitizedLimit}
        `,
        queryParts.params,
    );

    return rows.map(normalizeGlobalChatArticleShortlistRow);
}

export async function getGlobalChatArticlesByIds(
    input: Partial<GlobalChatScopeInput>,
    articleIds: number[],
): Promise<GlobalChatArticleDetail[]> {
    const sanitizedArticleIds = sanitizeArticleIds(articleIds);
    if (sanitizedArticleIds.length === 0) {
        return [];
    }

    const db = await getDb();
    const queryParts = buildGlobalChatArticleQueryParts(input);
    const idPlaceholders = sanitizedArticleIds.map((articleId) => pushParam(queryParts.params, articleId)).join(", ");
    const rows = await db.select<GlobalChatArticleRecordRow[]>(
        `
            SELECT
                a.id,
                s.name AS source_name,
                a.title,
                a.summary,
                a.content,
                a.published_at,
                a.created_at AS inserted_at,
                a.guid AS article_url
            FROM articles a
            JOIN sources s ON s.id = a.source_id
            WHERE ${queryParts.conditions.join(" AND ")}
              AND a.id IN (${idPlaceholders})
            ORDER BY julianday(${queryParts.event_timestamp_expression}) DESC, a.id DESC
        `,
        queryParts.params,
    );

    const rowsById = new Map(rows.map((row) => [row.id, normalizeGlobalChatArticleDetailRow(row)]));
    return sanitizedArticleIds
        .map((articleId) => rowsById.get(articleId))
        .filter((article): article is GlobalChatArticleDetail => !!article);
}

export async function searchGlobalChatArticlesInScope(
    input: Partial<GlobalChatScopeInput>,
    query: string,
    limit = DEFAULT_GLOBAL_CHAT_SEARCH_LIMIT,
): Promise<GlobalChatArticleShortlistItem[]> {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
        return [];
    }

    const sanitizedLimit = Math.max(1, Math.min(25, Number.parseInt(String(limit), 10) || DEFAULT_GLOBAL_CHAT_SEARCH_LIMIT));
    const db = await getDb();
    const queryParts = buildGlobalChatArticleQueryParts(input);
    const searchParam = pushParam(queryParts.params, `%${trimmedQuery}%`);
    const rows = await db.select<GlobalChatArticleRecordRow[]>(
        `
            SELECT
                a.id,
                s.name AS source_name,
                a.title,
                a.summary,
                a.content,
                a.published_at,
                a.created_at AS inserted_at,
                a.guid AS article_url
            FROM articles a
            JOIN sources s ON s.id = a.source_id
            WHERE ${queryParts.conditions.join(" AND ")}
              AND (
                  LOWER(a.title) LIKE ${searchParam}
                  OR LOWER(COALESCE(a.summary, '')) LIKE ${searchParam}
                  OR LOWER(COALESCE(a.content, '')) LIKE ${searchParam}
              )
            ORDER BY julianday(${queryParts.event_timestamp_expression}) DESC, a.id DESC
            LIMIT ${sanitizedLimit}
        `,
        queryParts.params,
    );

    return rows.map(normalizeGlobalChatArticleShortlistRow);
}

export function formatGlobalChatContextLine(article: Pick<GlobalChatArticleContextRow, "source_name" | "title" | "summary" | "published_at" | "inserted_at" | "article_url">): string {
    const summary = compactHtmlText(article.summary);
    const articleUrl = normalizeCitationUrl(article.article_url);
    return `- [${article.published_at ?? article.inserted_at ?? "Unknown"}] ${article.source_name}: ${article.title}${articleUrl ? ` (Article URL: ${articleUrl})` : ""}${summary ? ` - ${summary}` : ""}`;
}

export function formatGlobalChatShortlistLine(article: Pick<GlobalChatArticleShortlistItem, "id" | "source_name" | "title" | "preview" | "published_at" | "inserted_at" | "article_url">): string {
    const articleUrl = normalizeCitationUrl(article.article_url);
    return `- [ID ${article.id}] [${article.published_at ?? article.inserted_at ?? "Unknown"}] ${article.source_name}: ${article.title}${articleUrl ? ` (Article URL: ${articleUrl})` : ""}${article.preview ? ` - ${article.preview}` : ""}`;
}
