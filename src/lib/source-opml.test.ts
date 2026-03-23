// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_IMPORTED_SOURCE_ACTIVE,
    DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL,
    normalizeSourceUrl,
    parseOpmlText,
    serializeSourcesToOpml,
} from "@/lib/source-opml";

describe("source OPML utilities", () => {
    it("parses nested outlines and preserves News Viber metadata", () => {
        const result = parseOpmlText(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Example Feed" title="Preferred Title" type="rss" xmlUrl="https://example.com/feed.xml" nvActive="0" nvFetchInterval="15" />
    </outline>
  </body>
</opml>`);

        expect(result).toEqual({
            entries: [{
                name: "Preferred Title",
                url: "https://example.com/feed.xml",
                active: false,
                fetchInterval: 15,
            }],
            skippedDuplicateCount: 0,
            skippedInvalidCount: 0,
        });
    });

    it("returns null when the OPML entry does not specify a fetch interval", () => {
        const result = parseOpmlText(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="First" xmlUrl="https://example.com/feed/" />
    <outline text="Second" xmlUrl="https://example.com/feed#top" />
  </body>
</opml>`);

        expect(result).toEqual({
            entries: [{
                name: "First",
                url: "https://example.com/feed",
                active: DEFAULT_IMPORTED_SOURCE_ACTIVE,
                fetchInterval: null,
            }],
            skippedDuplicateCount: 1,
            skippedInvalidCount: 0,
        });
    });

    it("treats invalid fetch interval metadata as missing", () => {
        const result = parseOpmlText(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Broken Interval" xmlUrl="https://example.com/feed.xml" nvFetchInterval="later" />
  </body>
</opml>`);

        expect(result.entries).toEqual([{
            name: "Broken Interval",
            url: "https://example.com/feed.xml",
            active: DEFAULT_IMPORTED_SOURCE_ACTIVE,
            fetchInterval: null,
        }]);
    });

    it("counts leaf outlines without xmlUrl as invalid", () => {
        const result = parseOpmlText(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Broken feed" />
    <outline text="Folder">
      <outline text="Nested feed" xmlUrl="https://nested.example.com/rss.xml" />
    </outline>
  </body>
</opml>`);

        expect(result.entries).toEqual([{
            name: "Nested feed",
            url: "https://nested.example.com/rss.xml",
            active: true,
            fetchInterval: null,
        }]);
        expect(result.skippedInvalidCount).toBe(1);
    });

    it("rejects malformed XML", () => {
        expect(() => parseOpmlText("<opml><body><outline")).toThrow("Invalid OPML file.");
    });

    it("normalizes feed URLs for matching", () => {
        expect(normalizeSourceUrl(" https://Example.com/feed/#latest ")).toBe("https://example.com/feed");
        expect(normalizeSourceUrl("ftp://example.com/feed")).toBeNull();
    });

    it("serializes RSS sources as standard OPML with escaped attributes", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-23T09:10:11Z"));

        const xml = serializeSourcesToOpml([{
            name: `Tom & Jerry's <Feed>`,
            url: "https://example.com/feed/",
            active: false,
            fetchInterval: 0,
        }]);

        expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        expect(xml).toContain("<opml version=\"2.0\">");
        expect(xml).toContain("<title>News Viber Sources</title>");
        expect(xml).toContain("text=\"Tom &amp; Jerry&apos;s &lt;Feed&gt;\"");
        expect(xml).toContain("title=\"Tom &amp; Jerry&apos;s &lt;Feed&gt;\"");
        expect(xml).toContain("type=\"rss\"");
        expect(xml).toContain("xmlUrl=\"https://example.com/feed\"");
        expect(xml).toContain("nvActive=\"0\"");
        expect(xml).toContain("nvFetchInterval=\"0\"");
        expect(xml).toContain("<dateCreated>Mon, 23 Mar 2026 09:10:11 GMT</dateCreated>");

        vi.useRealTimers();
    });

    it("falls back to the default export interval when serializing invalid values", () => {
        const xml = serializeSourcesToOpml([{
            name: "Default Interval",
            url: "https://example.com/feed.xml",
            active: true,
            fetchInterval: Number.NaN,
        }]);

        expect(xml).toContain(`nvFetchInterval="${DEFAULT_IMPORTED_SOURCE_FETCH_INTERVAL}"`);
    });
});
