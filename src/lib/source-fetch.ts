import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

export type FetchableSource = {
    id: number;
    name: string;
    source_type: string;
    url: string;
    active: number | boolean;
    last_fetch: string | null;
};

export type SchedulableSource = FetchableSource & {
    fetch_interval: number;
};

export type FetchResult = {
    insertedCount: number;
    fetchedCount: number;
    successCount: number;
    failCount: number;
};

type RemoteArticle = {
    title: string;
    link: string;
    content?: string | null;
    description?: string | null;
    pub_date?: string | null;
    author?: string | null;
};

type JinaResponse = {
    title?: string;
    url?: string;
    content?: string;
    description?: string;
};

let db: Database | null = null;
const inFlightSourceFetches = new Map<number, Promise<FetchResult>>();

async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

async function loadRemoteArticles(source: FetchableSource): Promise<RemoteArticle[]> {
    if (source.source_type === "rss") {
        const articles = await invoke<RemoteArticle[]>("fetch_rss_cmd", { url: source.url });
        return Array.isArray(articles) ? articles : [];
    }

    const jinaData = await invoke<JinaResponse | null>("fetch_jina_cmd", { url: source.url, apiKey: null });
    if (!jinaData) {
        return [];
    }

    return [
        {
            title: jinaData.title || "Untitled",
            link: jinaData.url || source.url,
            content: jinaData.content || "",
            description: jinaData.description || "",
            pub_date: new Date().toISOString(),
            author: "",
        },
    ];
}

async function insertArticles(sourceId: number, articles: RemoteArticle[]) {
    const db = await getDb();
    let insertedCount = 0;

    for (const article of articles) {
        try {
            await db.execute(
                "INSERT INTO articles (source_id, guid, title, content, summary, author, published_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                [
                    sourceId,
                    article.link,
                    article.title,
                    article.content || "",
                    article.description || "",
                    article.author || "",
                    article.pub_date || new Date().toISOString(),
                ],
            );
            insertedCount++;
        } catch (error) {
            if (!String(error).includes("UNIQUE constraint")) {
                console.error("Insert error:", error);
            }
        }
    }

    return insertedCount;
}

async function updateSourceLastFetch(sourceId: number, fetchedAt: string) {
    const db = await getDb();
    await db.execute("UPDATE sources SET last_fetch = $1 WHERE id = $2", [fetchedAt, sourceId]);
}

export function isSourceDueForFetch(
    source: Pick<SchedulableSource, "fetch_interval" | "last_fetch">,
    now: Date = new Date(),
): boolean {
    const intervalMinutes = Number(source.fetch_interval);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
        return false;
    }

    if (!source.last_fetch) {
        return true;
    }

    const lastFetchTime = new Date(source.last_fetch).getTime();
    if (!Number.isFinite(lastFetchTime)) {
        return true;
    }

    return now.getTime() >= lastFetchTime + intervalMinutes * 60 * 1000;
}

async function performSourceFetch(source: FetchableSource): Promise<FetchResult> {
    const articles = await loadRemoteArticles(source);
    const insertedCount = await insertArticles(source.id, articles);
    await updateSourceLastFetch(source.id, new Date().toISOString());

    return {
        insertedCount,
        fetchedCount: articles.length,
        successCount: 1,
        failCount: 0,
    };
}

export async function fetchSource(source: FetchableSource): Promise<FetchResult> {
    const existingFetch = inFlightSourceFetches.get(source.id);
    if (existingFetch) {
        return existingFetch;
    }

    const fetchPromise = performSourceFetch(source);
    inFlightSourceFetches.set(source.id, fetchPromise);

    try {
        return await fetchPromise;
    } finally {
        if (inFlightSourceFetches.get(source.id) === fetchPromise) {
            inFlightSourceFetches.delete(source.id);
        }
    }
}

export async function fetchSources(sources: FetchableSource[]): Promise<FetchResult> {
    const aggregate: FetchResult = {
        insertedCount: 0,
        fetchedCount: 0,
        successCount: 0,
        failCount: 0,
    };

    for (const source of sources) {
        try {
            const result = await fetchSource(source);
            aggregate.insertedCount += result.insertedCount;
            aggregate.fetchedCount += result.fetchedCount;
            aggregate.successCount += result.successCount;
        } catch (error) {
            console.error(`Failed to fetch ${source.name}:`, error);
            aggregate.failCount += 1;
        }
    }

    return aggregate;
}
