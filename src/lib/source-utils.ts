import i18n from "@/lib/i18n";
import { formatUtcDateTime } from "@/lib/time";

export function normalizeFetchInterval(value: unknown, fallback: number = 60): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatFetchInterval(value: unknown): string {
    const minutes = normalizeFetchInterval(value, 0);
    if (minutes <= 0) return i18n.t("sources:manualRefresh");
    if (minutes < 60) return i18n.t("sources:everyNMin", { count: minutes });
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return i18n.t("sources:everyNHr", { count: hours });
    }

    return i18n.t("sources:everyNMin", { count: minutes });
}

export function formatLastFetch(lastFetch: string | null): string {
    return formatUtcDateTime(lastFetch, i18n.t("sources:neverFetched"));
}

export function formatLastFetchSummary(lastFetch: string | null): string {
    const neverFetchedLabel = i18n.t("sources:neverFetched");
    const formattedLastFetch = formatUtcDateTime(lastFetch, neverFetchedLabel);
    return formattedLastFetch === neverFetchedLabel
        ? formattedLastFetch
        : i18n.t("sources:lastFetch", { date: formattedLastFetch });
}
