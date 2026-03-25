import { getDb } from "@/lib/db";
import { dispatchNewsSyncEvent } from "@/lib/news-events";
import type { FetchableSource } from "@/lib/source-fetch";
import { normalizeFetchInterval } from "@/lib/source-utils";

export type NewsSource = FetchableSource & {
    active: boolean;
    fetch_interval: number;
    article_count: number;
    unread_count: number;
};

type NewsSourceRow = {
    id: number;
    name: string;
    source_type: string;
    url: string;
    active: number | boolean;
    fetch_interval: number | null;
    last_fetch: string | null;
    article_count: number | null;
    unread_count: number | null;
};

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

function normalizeCount(value: unknown): number {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function listNewsSources(): Promise<NewsSource[]> {
    const db = await getDb();
    const rows: NewsSourceRow[] = await db.select(`
        SELECT
            s.id,
            s.name,
            s.source_type,
            s.url,
            s.active,
            s.fetch_interval,
            s.last_fetch,
            COUNT(a.id) AS article_count,
            COALESCE(SUM(CASE WHEN a.is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_count
        FROM sources s
        LEFT JOIN articles a ON a.source_id = s.id
        WHERE s.active = 1
        GROUP BY s.id, s.name, s.source_type, s.url, s.active, s.fetch_interval, s.last_fetch
        ORDER BY LOWER(s.name) ASC
    `);

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        source_type: row.source_type,
        url: row.url,
        active: normalizeBoolean(row.active),
        fetch_interval: normalizeFetchInterval(row.fetch_interval),
        last_fetch: row.last_fetch ?? null,
        article_count: normalizeCount(row.article_count),
        unread_count: normalizeCount(row.unread_count),
    }));
}

export async function markNewsArticleAsRead(articleId: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE articles SET is_read = 1 WHERE id = $1", [articleId]);
    dispatchNewsSyncEvent();
}

export async function markScopedNewsArticlesAsRead(sourceId: number | null): Promise<void> {
    const db = await getDb();

    if (sourceId === null) {
        await db.execute(
            "UPDATE articles SET is_read = 1 WHERE is_read = 0 AND source_id IN (SELECT id FROM sources WHERE active = 1)",
            [],
        );
        dispatchNewsSyncEvent();
        return;
    }

    await db.execute("UPDATE articles SET is_read = 1 WHERE source_id = $1 AND is_read = 0", [sourceId]);
    dispatchNewsSyncEvent();
}
