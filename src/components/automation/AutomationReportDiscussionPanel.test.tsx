import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationReportDiscussionPanel, AutomationReportDiscussionRail } from "@/components/automation/AutomationReportDiscussionPanel";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            discussReport: "Discuss Report",
            discussReportDesc: "Ask follow-up questions or expand the report with AI.",
            expandReport: "Expand on this report with AI.",
            exploreFurther: "Explore further...",
            closeDiscussion: "Close discussion",
            connectingToModel: "Connecting to model...",
            streaming: "Streaming...",
            webSearchReady: "Web search is enabled for this discussion.",
            webSearchUnavailable: "Web search is enabled for this project, but Tavily is not configured right now.",
        }[key] ?? key),
    }),
}));

describe("AutomationReportDiscussionPanel", () => {
    it("renders the inline panel without requiring sheet context", () => {
        const markup = renderToStaticMarkup(
            <AutomationReportDiscussionPanel
                variant="inline"
                chatMessages={[]}
                isChatStreaming={false}
                chatStreamPhase="idle"
                chatInput=""
                onChatInputChange={() => undefined}
                onChatSubmit={(event) => event.preventDefault()}
                scrollRef={{ current: null }}
            />,
        );

        expect(markup).toContain("Discuss Report");
        expect(markup).toContain("Ask follow-up questions or expand the report with AI.");
        expect(markup).toContain("Expand on this report with AI.");
        expect(markup).toContain("Explore further...");
    });

    it("renders the web search notice when live search is available", () => {
        const markup = renderToStaticMarkup(
            <AutomationReportDiscussionPanel
                variant="inline"
                chatMessages={[]}
                isChatStreaming={false}
                chatStreamPhase="idle"
                webSearchStatus="ready"
                chatInput=""
                onChatInputChange={() => undefined}
                onChatSubmit={(event) => event.preventDefault()}
                scrollRef={{ current: null }}
            />,
        );

        expect(markup).toContain("Web search is enabled for this discussion.");
    });

    it("keeps the desktop rail mounted but hidden when closed", () => {
        const markup = renderToStaticMarkup(
            <AutomationReportDiscussionRail open={false}>
                <div>Discussion body</div>
            </AutomationReportDiscussionRail>,
        );

        expect(markup).toContain('data-open="false"');
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('style="width:0px"');
        expect(markup).toContain("inert");
        expect(markup).toContain(">Discussion body<");
    });
});
