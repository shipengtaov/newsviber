export const DEFAULT_IMPORTED_SOURCE_ACTIVE = true;
export const DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL = 60;

export type ImportOpmlMode = "skip" | "overwrite";

export type OpmlSourceEntry = {
    name: string;
    url: string;
    active: boolean;
    fetchInterval: number | null;
};

export type ParseOpmlResult = {
    entries: OpmlSourceEntry[];
    skippedDuplicateCount: number;
    skippedInvalidCount: number;
};

export type OpmlExportSource = {
    name: string;
    url: string;
    active: boolean;
    fetchInterval: number;
};

function normalizeOutlineText(value: string | null | undefined): string {
    return value?.trim() ?? "";
}

function parseOutlineBoolean(value: string | null, fallback: boolean): boolean {
    if (value === null) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
        return true;
    }

    if (normalized === "0" || normalized === "false" || normalized === "no") {
        return false;
    }

    return fallback;
}

function parseOutlineFetchInterval(value: string | null): number | null {
    if (value === null) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hasChildOutlines(node: Element): boolean {
    return Array.from(node.children).some((child) => child.tagName === "outline");
}

function resolveEntryName(node: Element, normalizedUrl: string): string {
    const title = normalizeOutlineText(node.getAttribute("title"));
    if (title) {
        return title;
    }

    const text = normalizeOutlineText(node.getAttribute("text"));
    if (text) {
        return text;
    }

    try {
        const hostname = new URL(normalizedUrl).hostname.trim();
        if (hostname) {
            return hostname;
        }
    } catch {
        // Fall through to the normalized URL below.
    }

    return normalizedUrl;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function normalizeSourceUrl(rawUrl: string): string | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const url = new URL(trimmed);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        url.hash = "";

        if (url.pathname !== "/") {
            url.pathname = url.pathname.replace(/\/+$/, "");
            if (!url.pathname) {
                url.pathname = "/";
            }
        }

        return url.toString();
    } catch {
        return null;
    }
}

export function parseOpmlText(text: string): ParseOpmlResult {
    const xml = new DOMParser().parseFromString(text, "text/xml");

    if (xml.getElementsByTagName("parsererror").length > 0) {
        throw new Error("Invalid OPML file.");
    }

    const outlines = Array.from(xml.getElementsByTagName("outline"));
    const entries: OpmlSourceEntry[] = [];
    const seenUrls = new Set<string>();
    let skippedDuplicateCount = 0;
    let skippedInvalidCount = 0;

    for (const outline of outlines) {
        const rawUrl = normalizeOutlineText(outline.getAttribute("xmlUrl"));

        if (!rawUrl) {
            if (!hasChildOutlines(outline)) {
                skippedInvalidCount += 1;
            }
            continue;
        }

        const normalizedUrl = normalizeSourceUrl(rawUrl);
        if (!normalizedUrl) {
            skippedInvalidCount += 1;
            continue;
        }

        if (seenUrls.has(normalizedUrl)) {
            skippedDuplicateCount += 1;
            continue;
        }

        seenUrls.add(normalizedUrl);

        entries.push({
            name: resolveEntryName(outline, normalizedUrl),
            url: normalizedUrl,
            active: parseOutlineBoolean(outline.getAttribute("nvActive"), DEFAULT_IMPORTED_SOURCE_ACTIVE),
            fetchInterval: parseOutlineFetchInterval(outline.getAttribute("nvFetchInterval")),
        });
    }

    return {
        entries,
        skippedDuplicateCount,
        skippedInvalidCount,
    };
}

export function serializeSourcesToOpml(sources: OpmlExportSource[]): string {
    const outlines = sources.map((source) => {
        const normalizedUrl = normalizeSourceUrl(source.url) ?? source.url.trim();
        const normalizedName = source.name.trim() || normalizedUrl;
        const normalizedFetchInterval = Number.isFinite(source.fetchInterval) && source.fetchInterval >= 0
            ? Math.trunc(source.fetchInterval)
            : DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL;

        return `    <outline text="${escapeXml(normalizedName)}" title="${escapeXml(normalizedName)}" type="rss" xmlUrl="${escapeXml(normalizedUrl)}" nvActive="${source.active ? "1" : "0"}" nvFetchInterval="${normalizedFetchInterval}" />`;
    });

    return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<opml version=\"2.0\">",
        "  <head>",
        "    <title>News Viber Sources</title>",
        `    <dateCreated>${escapeXml(new Date().toUTCString())}</dateCreated>`,
        "  </head>",
        "  <body>",
        ...outlines,
        "  </body>",
        "</opml>",
    ].join("\n");
}
