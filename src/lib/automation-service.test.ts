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
    buildAutomationPrompt,
    generateAutomationReportForProject,
    listAutomationReports,
    listAutomationProjects,
    markAllAutomationReportsAsRead,
    markAutomationReportAsRead,
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

    it("builds a prompt that leaves report structure up to the user's focus prompt", () => {
        const prompt = buildAutomationPrompt(
            {
                ...baseAutomationProject,
                prompt: "请给我 Key Signals、Ideas 和 Next Actions 三段结构。",
            },
            [{
                id: 9,
                source_id: 2,
                source_name: "HN",
                title: "AI infra costs are dropping",
                summary: "<p>Inference is getting cheaper.</p>",
                content: null,
                published_at: "2026-03-12T10:00:00Z",
                inserted_at: "2026-03-12T10:05:00Z",
            }],
        );

        expect(prompt).toContain("Return a JSON object with:");
        expect(prompt).toContain("- title: a concise title for the report");
        expect(prompt).toContain("- markdown: the report body in markdown only");
        expect(prompt).toContain("If the user explicitly wants sections such as Key Signals, Ideas, Next Actions, or any other structure, use that structure.");
        expect(prompt).toContain("Do not repeat the full report title as a top-level heading in markdown.");
        expect(prompt).not.toContain('Do not default to headings like "Key Signals", "Ideas", or "Next Actions" unless the user\'s prompt explicitly makes that structure the best fit.');
    });

    it("adds web search guidance when the project enables it", () => {
        const prompt = buildAutomationPrompt(
            {
                ...baseAutomationProject,
                web_search_enabled: true,
            },
            [{
                id: 9,
                source_id: 2,
                source_name: "HN",
                title: "AI infra costs are dropping",
                summary: "<p>Inference is getting cheaper.</p>",
                content: null,
                published_at: "2026-03-12T10:00:00Z",
                inserted_at: "2026-03-12T10:05:00Z",
            }],
        );

        expect(prompt).toContain("use external search only when it materially improves accuracy or recency");
        expect(prompt).toContain("cite the source URLs inline");
        expect(prompt).toContain("Do not use web search for facts already well supported");
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

        expect(generateAutomationReportDraftMock).toHaveBeenCalledWith(expect.objectContaining({
            enableWebSearch: false,
            prompt: expect.stringContaining("Return a JSON object with:"),
        }));
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
});
