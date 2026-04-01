import { afterEach, describe, expect, it, vi } from "vitest";

const {
    dispatchAutomationSyncEventMock,
    generateAutomationReportDraftMock,
    getDbMock,
    invokeMock,
} = vi.hoisted(() => ({
    dispatchAutomationSyncEventMock: vi.fn(),
    generateAutomationReportDraftMock: vi.fn(),
    getDbMock: vi.fn(),
    invokeMock: vi.fn(),
}));

vi.mock("@/lib/automation-events", () => ({
    dispatchAutomationSyncEvent: dispatchAutomationSyncEventMock,
}));

vi.mock("@/lib/db", () => ({
    getDb: getDbMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
    invoke: invokeMock,
}));

vi.mock("@/lib/ai", async () => {
    const actual = await vi.importActual<typeof import("@/lib/ai")>("@/lib/ai");

    return {
        ...actual,
        generateAutomationReportDraft: generateAutomationReportDraftMock,
    };
});

import {
    buildAutomationReportSystemPrompt,
    buildAutomationReportUserPrompt,
    formatAutomationReportSupportingContextLine,
    generateAutomationReportForProject,
    listProjectCandidateArticlePage,
    listProjectCandidateArticles,
    listAutomationReports,
    listAutomationProjects,
    markAllAutomationReportsAsRead,
    markAutomationReportAsRead,
    saveAutomationProject,
    setAutomationReportFavorite,
    summarizeArticleContextText,
} from "@/lib/automation-service";

const baseAutomationProject = {
    id: 1,
    name: "Founder ideas",
    prompt: "Please find startup patterns.",
    cycle_mode: "manual",
    auto_enabled: false,
    auto_interval_minutes: 60,
    max_articles_per_report: 12,
    min_articles_per_report: 1,
    web_search_enabled: false,
    last_auto_checked_at: null,
    last_auto_generated_at: null,
    source_ids: [],
    unread_report_count: 0,
};

function createArticle(id: number, overrides: Partial<{
    source_id: number;
    source_name: string;
    title: string;
    summary: string | null;
    content: string | null;
    published_at: string | null;
    inserted_at: string;
    article_url: string | null;
}> = {}) {
    return {
        id,
        source_id: overrides.source_id ?? 2,
        source_name: overrides.source_name ?? "HN",
        title: overrides.title ?? `Article ${id}`,
        summary: overrides.summary ?? "<p>Inference is getting cheaper.</p>",
        content: overrides.content ?? "Cheaper inference stack details.",
        published_at: overrides.published_at ?? "2026-03-12T10:00:00Z",
        inserted_at: overrides.inserted_at ?? "2026-03-12T10:05:00Z",
        article_url: overrides.article_url ?? `https://example.com/article-${id}`,
    };
}

afterEach(() => {
    dispatchAutomationSyncEventMock.mockReset();
    generateAutomationReportDraftMock.mockReset();
    getDbMock.mockReset();
    invokeMock.mockReset();
});

describe("automation service context helpers", () => {
    it("strips HTML from article context before sending it to the model", () => {
        expect(summarizeArticleContextText(
            "<p>Strong <strong>signal</strong> with <a href=\"https://example.com\">evidence</a>.</p>",
            "<div>Fallback body</div>",
        )).toBe("Strong signal with evidence.");
    });

    it("falls back to sanitized body content when summary is empty", () => {
        expect(summarizeArticleContextText(
            "",
            "<h2>Deep dive</h2><p>Second line</p>",
        )).toBe("Deep dive Second line");
    });

    it("keeps invariant citation and formatting rules in the system prompt", () => {
        const prompt = buildAutomationReportSystemPrompt({
            enableWebSearch: false,
        });

        expect(prompt).toContain("Return a JSON object with:");
        expect(prompt).toContain("- title: a concise title for the report");
        expect(prompt).toContain("- markdown: the report body in markdown only");
        expect(prompt).toContain("Use only numeric markdown links for citations");
        expect(prompt).toContain("Do not output a references section, footnotes list, named-link bibliography, or bare URLs.");
        expect(prompt).toContain("If the user explicitly wants sections such as Key Signals, Ideas, Next Actions, or any other structure, use that structure.");
        expect(prompt).toContain("Do not repeat the full report title as a top-level heading in markdown.");
    });

    it("keeps report-specific context in the user prompt without duplicating citation rules", () => {
        const prompt = buildAutomationReportUserPrompt(
            {
                ...baseAutomationProject,
                prompt: "请给我 Key Signals、Ideas 和 Next Actions 三段结构。",
            },
            {
                mode: "inline",
                articles: [createArticle(9, {
                    title: "AI infra costs are dropping",
                    article_url: "https://example.com/infra-costs",
                })],
            },
        );

        expect(prompt).toContain("User's Focus Prompt:");
        expect(prompt).toContain("请给我 Key Signals、Ideas 和 Next Actions 三段结构。");
        expect(prompt).toContain("Article URL: https://example.com/infra-costs");
        expect(prompt).not.toContain("numeric markdown links such as [1](https://example.com/article)");
    });

    it("adds web search and article-tool guidance to the system prompt when enabled", () => {
        const prompt = buildAutomationReportSystemPrompt({
            enableWebSearch: true,
            usesArticleTools: true,
        });

        expect(prompt).toContain("use web search sparingly to verify or supplement the missing fact");
        expect(prompt).toContain("Use `list_project_articles` to browse or search the scoped article set");
        expect(prompt).toContain("Retrieve around 12 detailed articles by default.");
        expect(prompt).toContain("up to 20 detailed articles total");
    });

    it("formats supporting report context lines with safe article URLs only", () => {
        expect(formatAutomationReportSupportingContextLine({
            source_name: "HN",
            title: "AI infra costs are dropping",
            summary: "<p>Inference is getting cheaper.</p>",
            content: null,
            published_at: "2026-03-12T10:00:00Z",
            inserted_at: "2026-03-12T10:05:00Z",
            article_url: "https://example.com/infra-costs",
        })).toContain("Article URL: https://example.com/infra-costs");

        expect(formatAutomationReportSupportingContextLine({
            source_name: "HN",
            title: "AI infra costs are dropping",
            summary: "<p>Inference is getting cheaper.</p>",
            content: null,
            published_at: "2026-03-12T10:00:00Z",
            inserted_at: "2026-03-12T10:05:00Z",
            article_url: "file:///tmp/example.txt",
        })).not.toContain("Article URL:");
    });

    it("persists the generated markdown body directly into full_report", async () => {
        const selectMock = vi.fn(async (query: string) => {
            if (query.includes("FROM automation_projects p")) {
                return [{
                    id: 7,
                    name: "Founder ideas",
                    prompt: "Give me Key Signals and Next Actions.",
                    cycle_mode: "manual",
                    auto_enabled: 0,
                    auto_interval_minutes: 60,
                    max_articles_per_report: 12,
                    min_articles_per_report: 1,
                    web_search_enabled: 0,
                    last_auto_checked_at: null,
                    last_auto_generated_at: null,
                    source_ids_csv: null,
                    unread_report_count: 0,
                }];
            }

            if (query.includes("FROM articles a")) {
                return [{
                    id: 11,
                    source_id: 3,
                    source_name: "HN",
                    title: "LLM infra is cheaper",
                    summary: "Faster inference is landing.",
                    content: "Cheaper inference stack details.",
                    published_at: "2026-03-12T08:00:00Z",
                    inserted_at: "2026-03-12T08:05:00Z",
                    article_url: "https://example.com/llm-infra",
                }];
            }

            if (query.includes("FROM automation_reports")) {
                return [{
                    id: 44,
                    project_id: 7,
                    title: "Signals for builders",
                    full_report: "## Key Signals\n- Faster inference",
                    generation_mode: "manual",
                    used_article_count: 1,
                    is_read: 0,
                    is_favorite: 0,
                    created_at: "2026-03-13T00:00:00Z",
                }];
            }

            throw new Error(`Unexpected select query: ${query}`);
        });

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });
        generateAutomationReportDraftMock.mockResolvedValue({
            title: "Signals for builders",
            markdown: "## Key Signals\n- Faster inference\n",
        });
        invokeMock.mockResolvedValue({ reportId: 44 });

        const card = await generateAutomationReportForProject({
            projectId: 7,
            articleIds: [11],
            mode: "manual",
        });

        const generationInput = generateAutomationReportDraftMock.mock.calls[0]?.[0];
        expect(generationInput).toEqual(expect.objectContaining({
            enableWebSearch: false,
            systemPrompt: expect.stringContaining("Use only numeric markdown links for citations"),
            prompt: expect.stringContaining("Selected News Context:"),
        }));
        expect(generationInput?.tools).toBeUndefined();
        expect(invokeMock).toHaveBeenCalledTimes(1);

        const [commandName, payload] = invokeMock.mock.calls[0];
        expect(commandName).toBe("persist_automation_report_cmd");
        expect(payload.input).toMatchObject({
            projectId: 7,
            title: "Signals for builders",
            fullReport: "## Key Signals\n- Faster inference",
            generationMode: "manual",
            usedArticleCount: 1,
            articleIds: [11],
            checkedAt: null,
        });
        expect("signals" in payload.input).toBe(false);
        expect(card).toMatchObject({
            id: 44,
            project_id: 7,
            title: "Signals for builders",
            full_report: "## Key Signals\n- Faster inference",
        });
        expect(dispatchAutomationSyncEventMock).toHaveBeenCalledTimes(1);
    });

    it("switches to indexed generation for large contexts and persists only fetched evidence article ids", async () => {
        const articles = Array.from({ length: 41 }, (_, index) => createArticle(index + 1, {
            source_id: (index % 3) + 1,
            source_name: `Source ${(index % 3) + 1}`,
            title: `Important article ${index + 1}`,
            summary: `<p>Signal ${index + 1}</p>`,
            content: `Body ${index + 1} `.repeat(200),
            article_url: index === 0 ? "file:///tmp/not-safe" : `https://example.com/article-${index + 1}`,
        }));
        const selectMock = vi.fn(async (query: string) => {
            if (query.includes("FROM automation_projects p")) {
                return [{
                    id: 8,
                    name: "Large context",
                    prompt: "Summarize the most important developments.",
                    cycle_mode: "manual",
                    auto_enabled: 0,
                    auto_interval_minutes: 60,
                    max_articles_per_report: 200,
                    min_articles_per_report: 1,
                    web_search_enabled: 1,
                    last_auto_checked_at: null,
                    last_auto_generated_at: null,
                    source_ids_csv: null,
                    unread_report_count: 0,
                }];
            }

            if (query.includes("FROM articles a")) {
                return articles;
            }

            if (query.includes("FROM automation_reports")) {
                return [{
                    id: 55,
                    project_id: 8,
                    title: "Large context summary",
                    full_report: "## Summary\n- Key development [1](https://example.com/article-2)",
                    generation_mode: "manual",
                    used_article_count: 41,
                    is_read: 0,
                    is_favorite: 0,
                    created_at: "2026-03-13T00:00:00Z",
                }];
            }

            throw new Error(`Unexpected select query: ${query}`);
        });

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });
        generateAutomationReportDraftMock.mockImplementation(async (input: {
            systemPrompt: string;
            prompt: string;
            tools?: Record<string, { execute: (args: unknown) => Promise<unknown> }>;
            activeTools?: string[];
            maxToolSteps?: number;
        }) => {
            expect(input.systemPrompt).toContain("The user prompt contains only a compact article index");
            expect(input.prompt).toContain("Scoped Article Index:");
            expect(input.prompt).toContain("- Total selected articles: 41");
            expect(input.prompt).toContain("[ID 1]");
            expect(input.maxToolSteps).toBe(12);
            expect(input.activeTools).toEqual(["list_project_articles", "get_project_articles", "web_search"]);

            const tools = input.tools!;
            const shortlistResult = await tools.list_project_articles.execute({
                offset: 0,
                limit: 3,
                search: "important",
            }) as { totalCount: number; items: Array<{ id: number; article_url: string | null }> };
            expect(shortlistResult.totalCount).toBe(41);
            expect(shortlistResult.items).toHaveLength(3);
            expect(shortlistResult.items[0]?.article_url).toBeNull();

            const detailResult = await tools.get_project_articles.execute({
                ids: [2, 3],
            }) as { items: Array<{ id: number; summary: string; content: string; article_url: string | null }> };
            expect(detailResult.items).toHaveLength(2);
            expect(detailResult.items[0]?.id).toBe(2);
            expect(detailResult.items[0]?.summary).toBe("Signal 2");
            expect(detailResult.items[0]?.content.length).toBeLessThanOrEqual(4000);
            expect(detailResult.items[0]?.article_url).toBe("https://example.com/article-2");

            return {
                title: "Large context summary",
                markdown: "## Summary\n- Key development [1](https://example.com/article-2)\n",
            };
        });
        invokeMock.mockResolvedValue({ reportId: 55 });

        const card = await generateAutomationReportForProject({
            projectId: 8,
            articleIds: articles.map((article) => article.id),
            mode: "manual",
        });

        expect(invokeMock).toHaveBeenCalledTimes(1);
        expect(invokeMock).toHaveBeenCalledWith("persist_automation_report_cmd", {
            input: expect.objectContaining({
                projectId: 8,
                usedArticleCount: 41,
                articleIds: [2, 3],
            }),
        });
        expect(card).toMatchObject({
            id: 55,
            used_article_count: 41,
        });
    });
});

describe("automation candidate article listing", () => {
    it("returns paginated candidate articles with total count, filters, and stable ordering", async () => {
        const selectMock = vi.fn()
            .mockResolvedValueOnce([{ cnt: 3 }])
            .mockResolvedValueOnce([{
                id: 32,
                source_id: 5,
                source_name: "Example Source",
                title: "Signal B",
                summary: "Second summary",
                published_at: "2026-03-15T00:00:00Z",
                inserted_at: "2026-03-16T00:00:00Z",
                is_consumed: 0,
            }, {
                id: 31,
                source_id: 5,
                source_name: "Example Source",
                title: "Signal A",
                summary: null,
                published_at: null,
                inserted_at: "2026-03-15T00:00:00Z",
                is_consumed: 1,
            }]);

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });

        await expect(listProjectCandidateArticlePage(7, {
            sourceId: 5,
            search: " Signal ",
            includeConsumed: false,
            insertedAfter: "2026-03-01T00:00:00Z",
            limit: 2,
            offset: 4,
        })).resolves.toEqual({
            totalCount: 3,
            items: [{
                id: 32,
                source_id: 5,
                source_name: "Example Source",
                title: "Signal B",
                summary: "Second summary",
                published_at: "2026-03-15T00:00:00Z",
                inserted_at: "2026-03-16T00:00:00Z",
                is_consumed: false,
            }, {
                id: 31,
                source_id: 5,
                source_name: "Example Source",
                title: "Signal A",
                summary: "",
                published_at: null,
                inserted_at: "2026-03-15T00:00:00Z",
                is_consumed: true,
            }],
        });

        const [countSql, countParams] = selectMock.mock.calls[0] ?? [];
        expect(countSql).toContain("SELECT COUNT(*) AS cnt");
        expect(countSql).toContain("WHERE is_consumed = 0");
        expect(countSql).toContain("LOWER(a.title) LIKE $5");
        expect(countSql).toContain("LOWER(COALESCE(a.summary, '')) LIKE $5");
        expect(countSql).toContain("a.source_id = $4");
        expect(countSql).toContain("a.created_at > $6");
        expect(countParams).toEqual([7, 7, 7, 5, "%signal%", "2026-03-01T00:00:00Z"]);

        const [pageSql, pageParams] = selectMock.mock.calls[1] ?? [];
        expect(pageSql).toContain("ORDER BY inserted_at DESC, id DESC");
        expect(pageSql).toContain("LIMIT $7");
        expect(pageSql).toContain("OFFSET $8");
        expect(pageParams).toEqual([7, 7, 7, 5, "%signal%", "2026-03-01T00:00:00Z", 2, 4]);
    });

    it("keeps the array helper behavior and can include previously consumed articles", async () => {
        const selectMock = vi.fn()
            .mockResolvedValueOnce([{ cnt: 1 }])
            .mockResolvedValueOnce([{
                id: 55,
                source_id: 2,
                source_name: "HN",
                title: "Reusable article",
                summary: "Useful summary",
                published_at: null,
                inserted_at: "2026-03-20T00:00:00Z",
                is_consumed: 1,
            }]);

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });

        await expect(listProjectCandidateArticles(9, {
            includeConsumed: true,
            limit: 1,
        })).resolves.toEqual([{
            id: 55,
            source_id: 2,
            source_name: "HN",
            title: "Reusable article",
            summary: "Useful summary",
            published_at: null,
            inserted_at: "2026-03-20T00:00:00Z",
            is_consumed: true,
        }]);

        const [countSql, countParams] = selectMock.mock.calls[0] ?? [];
        expect(countSql).toContain("SELECT COUNT(*) AS cnt");
        expect(countSql).not.toContain("WHERE is_consumed = 0");
        expect(countParams).toEqual([9, 9, 9]);

        const [pageSql, pageParams] = selectMock.mock.calls[1] ?? [];
        expect(pageSql).toContain("LIMIT $4");
        expect(pageSql).not.toContain("OFFSET");
        expect(pageParams).toEqual([9, 9, 9, 1]);
    });
});

describe("automation service unread state", () => {
    it("maps unread project counts from project queries", async () => {
        getDbMock.mockResolvedValue({
            select: vi.fn().mockResolvedValue([{
                id: 3,
                name: "Signals",
                prompt: "Find startup patterns",
                cycle_mode: "manual",
                auto_enabled: 1,
                auto_interval_minutes: 30,
                max_articles_per_report: 9,
                min_articles_per_report: 1,
                web_search_enabled: 1,
                last_auto_checked_at: "2026-03-13T00:00:00Z",
                last_auto_generated_at: "2026-03-13T01:00:00Z",
                source_ids_csv: "1,2",
                unread_report_count: 4,
            }]),
            execute: vi.fn(),
        });

        await expect(listAutomationProjects()).resolves.toEqual([expect.objectContaining({
            id: 3,
            source_ids: [1, 2],
            unread_report_count: 4,
        })]);
    });

    it("maps report read state from report queries", async () => {
        const selectMock = vi.fn()
            .mockResolvedValueOnce([{ cnt: 1 }])
            .mockResolvedValueOnce([{
                id: 18,
                project_id: 3,
                title: "Builder memo",
                full_report: "## Memo",
                generation_mode: "auto",
                used_article_count: 2,
                is_read: 1,
                is_favorite: 1,
                created_at: "2026-03-13T02:00:00Z",
            }]);

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });

        await expect(listAutomationReports(3)).resolves.toEqual({
            reports: [expect.objectContaining({
                id: 18,
                generation_mode: "auto",
                is_read: true,
                is_favorite: true,
            })],
            totalCount: 1,
        });
    });

    it("applies favorites-only filtering to both count and list queries", async () => {
        const selectMock = vi.fn()
            .mockResolvedValueOnce([{ cnt: 1 }])
            .mockResolvedValueOnce([{
                id: 18,
                project_id: 3,
                title: "Builder memo",
                full_report: "## Memo",
                generation_mode: "auto",
                used_article_count: 2,
                is_read: 1,
                is_favorite: 1,
                created_at: "2026-03-13T02:00:00Z",
            }]);

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });

        await expect(listAutomationReports(3, { favoritesOnly: true })).resolves.toEqual({
            reports: [expect.objectContaining({
                id: 18,
                is_favorite: true,
            })],
            totalCount: 1,
        });

        expect(selectMock).toHaveBeenNthCalledWith(
            1,
            "SELECT COUNT(*) AS cnt FROM automation_reports WHERE project_id = $1 AND is_favorite = 1",
            [3],
        );
        expect(selectMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining("WHERE project_id = $1 AND is_favorite = 1"),
            [3],
        );
    });

    it("marks a single report as read and dispatches sync", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn(),
            execute: executeMock,
        });

        await markAutomationReportAsRead(18);

        expect(executeMock).toHaveBeenCalledWith(
            "UPDATE automation_reports SET is_read = 1 WHERE id = $1",
            [18],
        );
        expect(dispatchAutomationSyncEventMock).toHaveBeenCalledTimes(1);
    });

    it("marks all reports in a project as read and dispatches sync", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn(),
            execute: executeMock,
        });

        await markAllAutomationReportsAsRead(7);

        expect(executeMock).toHaveBeenCalledWith(
            "UPDATE automation_reports SET is_read = 1 WHERE project_id = $1 AND is_read = 0",
            [7],
        );
        expect(dispatchAutomationSyncEventMock).toHaveBeenCalledTimes(1);
    });

    it("updates a report favorite state and dispatches sync", async () => {
        const executeMock = vi.fn().mockResolvedValue(undefined);
        getDbMock.mockResolvedValue({
            select: vi.fn(),
            execute: executeMock,
        });

        await setAutomationReportFavorite(18, true);

        expect(executeMock).toHaveBeenCalledWith(
            "UPDATE automation_reports SET is_favorite = $1 WHERE id = $2",
            [1, 18],
        );
        expect(dispatchAutomationSyncEventMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to the new project article defaults when saving invalid values", async () => {
        const selectMock = vi.fn(async (query: string) => {
            if (query.includes("FROM automation_projects p")) {
                return [{
                    id: 9,
                    name: "Signals",
                    prompt: "Summarize",
                    cycle_mode: "manual",
                    auto_enabled: 0,
                    auto_interval_minutes: 60,
                    max_articles_per_report: 200,
                    min_articles_per_report: 10,
                    web_search_enabled: 0,
                    last_auto_checked_at: null,
                    last_auto_generated_at: null,
                    source_ids_csv: null,
                    unread_report_count: 0,
                }];
            }

            throw new Error(`Unexpected select query: ${query}`);
        });

        getDbMock.mockResolvedValue({
            select: selectMock,
            execute: vi.fn(),
        });
        invokeMock.mockResolvedValue({ projectId: 9 });

        await expect(saveAutomationProject({
            name: " Signals ",
            prompt: " Summarize ",
            auto_enabled: false,
            auto_interval_minutes: 0,
            max_articles_per_report: 0,
            min_articles_per_report: 0,
            web_search_enabled: false,
            use_all_sources: true,
            source_ids: [],
        })).resolves.toEqual(expect.objectContaining({
            id: 9,
            max_articles_per_report: 200,
            min_articles_per_report: 10,
        }));

        expect(invokeMock).toHaveBeenCalledWith("save_automation_project_cmd", {
            input: expect.objectContaining({
                autoIntervalMinutes: 60,
                maxArticlesPerReport: 200,
                minArticlesPerReport: 10,
            }),
        });
        expect(dispatchAutomationSyncEventMock).toHaveBeenCalledTimes(1);
    });
});
