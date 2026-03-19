import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreativeCardDiscussionPanel, CreativeCardDiscussionRail } from "@/components/creative/CreativeCardDiscussionPanel";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            discussCard: "Discuss Card",
            discussCardDesc: "Ask follow-up questions or expand the report with AI.",
            expandReport: "Expand on this report with AI.",
            exploreFurther: "Explore further...",
            closeDiscussion: "Close discussion",
            connectingToModel: "Connecting to model...",
            streaming: "Streaming...",
        }[key] ?? key),
    }),
}));

describe("CreativeCardDiscussionPanel", () => {
    it("renders the inline panel without requiring sheet context", () => {
        const markup = renderToStaticMarkup(
            <CreativeCardDiscussionPanel
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

        expect(markup).toContain("Discuss Card");
        expect(markup).toContain("Ask follow-up questions or expand the report with AI.");
        expect(markup).toContain("Expand on this report with AI.");
        expect(markup).toContain("Explore further...");
    });

    it("keeps the desktop rail mounted but hidden when closed", () => {
        const markup = renderToStaticMarkup(
            <CreativeCardDiscussionRail open={false}>
                <div>Discussion body</div>
            </CreativeCardDiscussionRail>,
        );

        expect(markup).toContain('data-open="false"');
        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('style="width:0px"');
        expect(markup).toContain("inert");
        expect(markup).toContain(">Discussion body<");
    });
});
