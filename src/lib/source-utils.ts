import { formatUtcDateTime } from "@/lib/time";

const NEVER_FETCHED_LABEL = "Never fetched";

export function normalizeFetchInterval(value: unknown, fallback: number = 60): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatFetchInterval(value: unknown): string {
    const minutes = normalizeFetchInterval(value, 0);
    if (minutes <= 0) return "Manual refresh";
    if (minutes < 60) return `Every ${minutes} min`;
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `Every ${hours} hr${hours === 1 ? "" : "s"}`;
    }

    return `Every ${minutes} min`;
}

export function formatLastFetch(lastFetch: string | null): string {
    return formatUtcDateTime(lastFetch, NEVER_FETCHED_LABEL);
}

export function formatLastFetchSummary(lastFetch: string | null): string {
    const formattedLastFetch = formatLastFetch(lastFetch);
    return formattedLastFetch === NEVER_FETCHED_LABEL
        ? formattedLastFetch
        : `Last fetch ${formattedLastFetch}`;
}
