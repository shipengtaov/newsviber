export const DEFAULT_SOURCE_RETURN_TO = "/sources";

export function resolveSourceReturnTo(rawValue: string | null | undefined): string {
    if (typeof rawValue !== "string") {
        return DEFAULT_SOURCE_RETURN_TO;
    }

    const trimmedValue = rawValue.trim();
    if (!trimmedValue.startsWith("/") || trimmedValue.startsWith("//")) {
        return DEFAULT_SOURCE_RETURN_TO;
    }

    return trimmedValue;
}

export function isNewsReturnToPath(returnTo: string): boolean {
    const pathname = returnTo.split(/[?#]/, 1)[0] ?? "";
    return pathname === "/" || pathname.startsWith("/news/");
}
