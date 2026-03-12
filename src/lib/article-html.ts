import DOMPurify from "isomorphic-dompurify";

const ARTICLE_HTML_TAGS = [
    "a",
    "abbr",
    "article",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "ins",
    "kbd",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "q",
    "s",
    "samp",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "time",
    "tr",
    "u",
    "ul",
];

const ARTICLE_HTML_ATTRS = [
    "abbr",
    "align",
    "alt",
    "cite",
    "colspan",
    "datetime",
    "height",
    "href",
    "rel",
    "rowspan",
    "scope",
    "src",
    "target",
    "title",
    "width",
];

const COMMON_HTML_TAG_RE = /<(?:!doctype|a|abbr|article|aside|b|blockquote|br|code|div|em|figure|figcaption|h[1-6]|hr|i|img|li|ol|p|pre|section|span|strong|table|tbody|td|th|thead|tr|u|ul)\b[^>]*>|<\/[a-z][^>]*>/i;
const HTML_ENTITY_RE = /&(?:[a-z][a-z0-9]+|#\d+|#x[a-f0-9]+);/i;
const SAFE_EXTERNAL_URI_RE = /^(?:(?:https?|mailto):|\/\/)/i;
const DANGEROUS_BLOCK_TAGS = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "textarea",
    "button",
    "select",
    "option",
    "noscript",
];
const DANGEROUS_VOID_TAGS_RE = /<\s*(?:input|meta|link)\b[^>]*>/gi;
const DANGEROUS_BLOCK_RE = new RegExp(
    `<\\s*(?:${DANGEROUS_BLOCK_TAGS.join("|")})\\b[^>]*>[\\s\\S]*?<\\/\\s*(?:${DANGEROUS_BLOCK_TAGS.join("|")})\\s*>`,
    "gi",
);
const BLOCK_BREAK_RE = /<\s*\/\s*(?:article|blockquote|caption|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\s*>/gi;
const LINE_BREAK_RE = /<\s*br\s*\/?>/gi;
const TAG_RE = /<[^>]+>/g;
let sanitizerHooksConfigured = false;

const NAMED_ENTITY_MAP: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
};

export function isProbablyHtml(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) {
        return false;
    }

    return COMMON_HTML_TAG_RE.test(trimmed);
}

export function sanitizeArticleHtml(html: string): string {
    const trimmed = html.trim();
    if (!trimmed) {
        return "";
    }

    configureSanitizerHooks();

    const withoutDangerousBlocks = trimmed
        .replace(DANGEROUS_BLOCK_RE, "")
        .replace(DANGEROUS_VOID_TAGS_RE, "");

    return DOMPurify.sanitize(withoutDangerousBlocks, {
        ALLOWED_ATTR: ARTICLE_HTML_ATTRS,
        ALLOWED_TAGS: ARTICLE_HTML_TAGS,
        ALLOWED_URI_REGEXP: SAFE_EXTERNAL_URI_RE,
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
        FORBID_ATTR: ["style"],
        RETURN_TRUSTED_TYPE: false,
    });
}

export function stripHtmlToText(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        return "";
    }

    const source = isProbablyHtml(trimmed) ? sanitizeArticleHtml(trimmed) : trimmed;

    return decodeHtmlEntities(
        source
            .replace(LINE_BREAK_RE, "\n")
            .replace(BLOCK_BREAK_RE, "\n")
            .replace(TAG_RE, " "),
    )
        .replace(/\u00a0/g, " ")
        .replace(/[ \t\f\v]+/g, " ")
        .replace(/ +([,.;:!?])/g, "$1")
        .replace(/ *\n */g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

export function compactHtmlText(input: string): string {
    return stripHtmlToText(input).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
    if (!HTML_ENTITY_RE.test(value)) {
        return value;
    }

    if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.innerHTML = value;
        return textarea.value;
    }

    return value
        .replace(/&#(\d+);/g, (_, codePoint) => safeFromCodePoint(Number.parseInt(codePoint, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => safeFromCodePoint(Number.parseInt(codePoint, 16)))
        .replace(/&([a-z][a-z0-9]+);/gi, (_, entity) => NAMED_ENTITY_MAP[entity.toLowerCase()] ?? `&${entity};`);
}

function safeFromCodePoint(codePoint: number): string {
    if (!Number.isFinite(codePoint) || codePoint < 0) {
        return "";
    }

    try {
        return String.fromCodePoint(codePoint);
    } catch {
        return "";
    }
}

function configureSanitizerHooks(): void {
    if (sanitizerHooksConfigured) {
        return;
    }

    DOMPurify.addHook("uponSanitizeAttribute", (_, data) => {
        if ((data.attrName === "href" || data.attrName === "src") && !SAFE_EXTERNAL_URI_RE.test((data.attrValue ?? "").trim())) {
            data.keepAttr = false;
        }
    });

    sanitizerHooksConfigured = true;
}
