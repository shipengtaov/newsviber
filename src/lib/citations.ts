export function isSafeExternalUrl(value: string | null | undefined): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return false;
  }

  try {
    const url = new URL(trimmedValue);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeCitationUrl(value: string | null | undefined): string | null {
  if (!isSafeExternalUrl(value)) {
    return null;
  }

  return value.trim();
}

export function getCitationHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "") || value;
  } catch {
    return value;
  }
}

export function isNumericCitationLabel(value: string): boolean {
  return /^\d+$/.test(value.trim());
}
