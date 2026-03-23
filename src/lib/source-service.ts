import type { FetchableSource } from "@/lib/source-fetch";
import { getDb } from "@/lib/db";
import { normalizeFetchInterval } from "@/lib/source-utils";
import {
    DEFAULT_IMPORTED_SOURCE_ACTIVE,
    DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL,
    normalizeSourceUrl,
    type ImportOpmlMode,
    type OpmlSourceEntry,
} from "@/lib/source-opml";

export type ManagedSource = FetchableSource & {
    active: boolean;
    config: string | null;
    fetch_interval: number;
    created_at: string | null;
};

export type SaveSourceInput = {
    name: string;
    sourceType: string;
    url: string;
    fetchInterval: number;
    active?: boolean;
    config?: string | null;
};

export type ImportOpmlResult = {
    insertedCount: number;
    updatedCount: number;
    skippedDuplicateCount: number;
    skippedInvalidCount: number;
};

type SourceRow = {
    id: number;
    name: string;
    source_type: string;
    url: string;
    active: number | boolean | string | null;
    config: string | null;
    fetch_interval: number | null;
    last_fetch: string | null;
    created_at: string | null;
};

function normalizeBoolean(value: unknown): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "1" || normalized === "true";
    }

    return false;
}

function normalizeSourceRow(row: SourceRow): ManagedSource {
    return {
        id: row.id,
        name: row.name,
        source_type: row.source_type,
        url: row.url,
        active: normalizeBoolean(row.active),
        config: row.config ?? null,
        fetch_interval: row.fetch_interval === null
            ? DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL
            : normalizeFetchInterval(row.fetch_interval, DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL),
        last_fetch: row.last_fetch ?? null,
        created_at: row.created_at ?? null,
    };
}

function normalizeAndValidateUrl(url: string): string {
    const normalized = normalizeSourceUrl(url);
    if (!normalized) {
        throw new Error("Invalid source URL.");
    }

    return normalized;
}

function normalizeName(name: string, normalizedUrl: string): string {
    const trimmed = name.trim();
    if (trimmed) {
        return trimmed;
    }

    try {
        const hostname = new URL(normalizedUrl).hostname.trim();
        return hostname || normalizedUrl;
    } catch {
        return normalizedUrl;
    }
}

function serializeActiveValue(active: boolean | undefined): number {
    return (active ?? DEFAULT_IMPORTED_SOURCE_ACTIVE) ? 1 : 0;
}

function resolveImportedFetchInterval(
    entryFetchInterval: number | null,
    missingFetchIntervalFallback: number | null,
): number {
    const candidate = entryFetchInterval ?? missingFetchIntervalFallback;

    if (candidate === null) {
        throw new Error("Missing fetch interval for imported source.");
    }

    const normalized = Number(candidate);
    if (!Number.isFinite(normalized) || normalized < 0) {
        throw new Error("Invalid fetch interval for imported source.");
    }

    return Math.trunc(normalized);
}

export async function listSources(): Promise<ManagedSource[]> {
    const db = await getDb();
    const rows: SourceRow[] = await db.select("SELECT * FROM sources ORDER BY id DESC");
    return rows.map(normalizeSourceRow);
}

export async function listRssSourcesForExport(): Promise<ManagedSource[]> {
    const db = await getDb();
    const rows: SourceRow[] = await db.select(
        "SELECT * FROM sources WHERE source_type = $1 ORDER BY LOWER(name) ASC, id ASC",
        ["rss"],
    );
    return rows.map(normalizeSourceRow);
}

export async function getSource(sourceId: number): Promise<ManagedSource | null> {
    const db = await getDb();
    const rows: SourceRow[] = await db.select("SELECT * FROM sources WHERE id = $1", [sourceId]);
    return rows.length > 0 ? normalizeSourceRow(rows[0]) : null;
}

export async function createSource(input: SaveSourceInput): Promise<void> {
    const db = await getDb();
    const normalizedUrl = normalizeAndValidateUrl(input.url);
    const fetchInterval = normalizeFetchInterval(input.fetchInterval, DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL);

    await db.execute(
        "INSERT INTO sources (name, source_type, url, fetch_interval, active, config) VALUES ($1, $2, $3, $4, $5, $6)",
        [
            normalizeName(input.name, normalizedUrl),
            input.sourceType,
            normalizedUrl,
            fetchInterval,
            serializeActiveValue(input.active),
            input.config ?? null,
        ],
    );
}

export async function updateSource(sourceId: number, input: SaveSourceInput): Promise<void> {
    const db = await getDb();
    const normalizedUrl = normalizeAndValidateUrl(input.url);
    const fetchInterval = normalizeFetchInterval(input.fetchInterval, DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL);

    await db.execute(
        "UPDATE sources SET name = $1, source_type = $2, url = $3, fetch_interval = $4, active = $5, config = $6 WHERE id = $7",
        [
            normalizeName(input.name, normalizedUrl),
            input.sourceType,
            normalizedUrl,
            fetchInterval,
            serializeActiveValue(input.active),
            input.config ?? null,
            sourceId,
        ],
    );
}

export async function setSourceActive(sourceId: number, active: boolean): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE sources SET active = $1 WHERE id = $2", [active ? 1 : 0, sourceId]);
}

export async function deleteSource(sourceId: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM sources WHERE id = $1", [sourceId]);
}

export async function importOpmlSources(
    entries: OpmlSourceEntry[],
    mode: ImportOpmlMode,
    missingFetchIntervalFallback: number | null = null,
): Promise<ImportOpmlResult> {
    const db = await getDb();
    const existingRows: SourceRow[] = await db.select("SELECT * FROM sources");
    const existingByNormalizedUrl = new Map<string, ManagedSource>();

    for (const row of existingRows) {
        const normalizedUrl = normalizeSourceUrl(row.url);
        if (!normalizedUrl || existingByNormalizedUrl.has(normalizedUrl)) {
            continue;
        }

        existingByNormalizedUrl.set(normalizedUrl, normalizeSourceRow(row));
    }

    const result: ImportOpmlResult = {
        insertedCount: 0,
        updatedCount: 0,
        skippedDuplicateCount: 0,
        skippedInvalidCount: 0,
    };

    for (const entry of entries) {
        const normalizedUrl = normalizeSourceUrl(entry.url);
        if (!normalizedUrl) {
            result.skippedInvalidCount += 1;
            continue;
        }

        const matchedSource = existingByNormalizedUrl.get(normalizedUrl);
        const normalizedNameValue = normalizeName(entry.name, normalizedUrl);
        const normalizedFetchInterval = resolveImportedFetchInterval(
            entry.fetchInterval,
            missingFetchIntervalFallback,
        );

        if (!matchedSource) {
            await db.execute(
                "INSERT INTO sources (name, source_type, url, fetch_interval, active, config) VALUES ($1, $2, $3, $4, $5, $6)",
                [
                    normalizedNameValue,
                    "rss",
                    normalizedUrl,
                    normalizedFetchInterval,
                    entry.active ? 1 : 0,
                    null,
                ],
            );

            existingByNormalizedUrl.set(normalizedUrl, {
                id: -1,
                name: normalizedNameValue,
                source_type: "rss",
                url: normalizedUrl,
                active: entry.active,
                config: null,
                fetch_interval: normalizedFetchInterval,
                last_fetch: null,
                created_at: null,
            });
            result.insertedCount += 1;
            continue;
        }

        if (mode === "skip") {
            result.skippedDuplicateCount += 1;
            continue;
        }

        await db.execute(
            "UPDATE sources SET name = $1, active = $2, fetch_interval = $3 WHERE id = $4",
            [normalizedNameValue, entry.active ? 1 : 0, normalizedFetchInterval, matchedSource.id],
        );

        existingByNormalizedUrl.set(normalizedUrl, {
            ...matchedSource,
            name: normalizedNameValue,
            active: entry.active,
            fetch_interval: normalizedFetchInterval,
        });
        result.updatedCount += 1;
    }

    return result;
}
