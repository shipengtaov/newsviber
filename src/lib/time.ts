import i18n from "@/lib/i18n";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_NO_ZONE_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;
const EXPLICIT_TIME_ZONE_PATTERN = /(Z|[+\-]\d{2}:?\d{2})$/i;

function normalizeIsoSeparator(value: string): string {
    return value.replace(" ", "T");
}

export function parseUtcTimestamp(value: string | null | undefined): Date | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    let normalized = trimmed;

    if (DATE_ONLY_PATTERN.test(trimmed)) {
        normalized = `${trimmed}T00:00:00Z`;
    } else {
        const dateTimeWithoutZone = trimmed.match(DATE_TIME_NO_ZONE_PATTERN);
        if (dateTimeWithoutZone) {
            normalized = `${dateTimeWithoutZone[1]}T${dateTimeWithoutZone[2]}Z`;
        } else if (EXPLICIT_TIME_ZONE_PATTERN.test(trimmed)) {
            normalized = normalizeIsoSeparator(trimmed);
        }
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatUtcDateTime(value: string | null | undefined, fallback = "Unknown"): string {
    const parsed = parseUtcTimestamp(value);
    return parsed ? parsed.toLocaleString(i18n.language) : fallback;
}

export function formatUtcDate(value: string | null | undefined, fallback = "Unknown"): string {
    const parsed = parseUtcTimestamp(value);
    return parsed ? parsed.toLocaleDateString(i18n.language) : fallback;
}
