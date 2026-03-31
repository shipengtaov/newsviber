import type { FormEvent, ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { X, Send } from "lucide-react";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type Message } from "@/lib/ai";
import { type StreamPhase } from "@/hooks/use-streaming-conversation";
import { cn } from "@/lib/utils";

type AutomationReportDiscussionPanelProps = {
    variant?: "inline" | "sheet";
    chatMessages: Message[];
    isChatStreaming: boolean;
    chatStreamPhase: StreamPhase;
    webSearchStatus?: "disabled" | "ready" | "unavailable";
    chatInput: string;
    onChatInputChange: (value: string) => void;
    onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose?: () => void;
    showCloseButton?: boolean;
    scrollRef: RefObject<HTMLDivElement | null>;
    className?: string;
};

type AutomationReportDiscussionRailProps = {
    open: boolean;
    children: ReactNode;
    className?: string;
};

function AutomationReportDiscussionHeader({
    variant,
    webSearchStatus = "disabled",
    onClose,
    showCloseButton,
}: Pick<AutomationReportDiscussionPanelProps, "variant" | "webSearchStatus" | "onClose" | "showCloseButton">) {
    const { t } = useTranslation("automation");
    const webSearchNotice = webSearchStatus === "ready"
        ? t("webSearchReady")
        : webSearchStatus === "unavailable"
            ? t("webSearchUnavailable")
            : null;

    if (variant === "sheet") {
        return (
            <SheetHeader className="shrink-0 border-b border-border px-4 pb-3 pt-3 text-left">
                <SheetTitle>{t("discussReport")}</SheetTitle>
                <SheetDescription>{t("discussReportDesc")}</SheetDescription>
                {webSearchNotice ? (
                    <p
                        className={cn(
                            "mt-2 text-xs",
                            webSearchStatus === "unavailable" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                        )}
                    >
                        {webSearchNotice}
                    </p>
                ) : null}
            </SheetHeader>
        );
    }

    return (
        <div className="shrink-0 border-b border-border px-4 pb-3 pt-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">{t("discussReport")}</h2>
                    <p className="text-sm text-muted-foreground">{t("discussReportDesc")}</p>
                    {webSearchNotice ? (
                        <p
                            className={cn(
                                "text-xs",
                                webSearchStatus === "unavailable" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                            )}
                        >
                            {webSearchNotice}
                        </p>
                    ) : null}
                </div>
                {showCloseButton && onClose ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-full"
                        onClick={onClose}
                        aria-label={t("closeDiscussion")}
                        title={t("closeDiscussion")}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

export function AutomationReportDiscussionPanel({
    variant = "inline",
    chatMessages,
    isChatStreaming,
    chatStreamPhase,
    webSearchStatus = "disabled",
    chatInput,
    onChatInputChange,
    onChatSubmit,
    onClose,
    showCloseButton = false,
    scrollRef,
    className,
}: AutomationReportDiscussionPanelProps) {
    const { t } = useTranslation("automation");

    return (
        <div className={cn("flex h-full min-h-0 flex-col", className)}>
            <AutomationReportDiscussionHeader
                variant={variant}
                webSearchStatus={webSearchStatus}
                onClose={onClose}
                showCloseButton={showCloseButton}
            />

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm" ref={scrollRef}>
                {chatMessages.length === 0 && (
                    <p className="mt-10 text-center text-muted-foreground">{t("expandReport")}</p>
                )}
                {chatMessages.map((message, index) => (
                    <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] rounded-xl px-3 py-2 ${message.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card shadow-sm"}`}>
                            {(() => {
                                const isLiveAssistantMessage = message.role === "assistant"
                                    && isChatStreaming
                                    && index === chatMessages.length - 1;
                                const isPreparingMessage = isLiveAssistantMessage
                                    && chatStreamPhase === "preparing"
                                    && message.content.trim().length === 0;
                                const shouldRenderPlainStreamingText = isLiveAssistantMessage
                                    && chatStreamPhase === "streaming";

                                if (isPreparingMessage) {
                                    return (
                                        <div className="flex items-center gap-3 text-muted-foreground">
                                            <span>{t("connectingToModel")}</span>
                                            <div className="flex items-center space-x-1">
                                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40" />
                                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0.2s]" />
                                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/80 [animation-delay:0.4s]" />
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-2">
                                        {shouldRenderPlainStreamingText && message.role === "assistant" ? (
                                            <div className="whitespace-pre-wrap break-words leading-6 text-foreground">
                                                {message.content}
                                            </div>
                                        ) : (
                                            <ChatMarkdown
                                                content={message.content}
                                                tone={message.role === "user" ? "inverse" : "default"}
                                            />
                                        )}
                                        {isLiveAssistantMessage && chatStreamPhase === "streaming" && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="h-2 w-2 rounded-full bg-primary/80 animate-pulse" />
                                                <span>{t("streaming")}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                ))}
            </div>

            <div className="shrink-0 border-t border-border bg-background px-4 py-3">
                <form onSubmit={onChatSubmit} className="flex items-center gap-2">
                    <Input
                        value={chatInput}
                        onChange={(event) => onChatInputChange(event.target.value)}
                        placeholder={t("exploreFurther")}
                        disabled={isChatStreaming}
                        className="h-9 text-sm"
                    />
                    <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={isChatStreaming || !chatInput.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </div>
    );
}

export function AutomationReportDiscussionRail({
    open,
    children,
    className,
}: AutomationReportDiscussionRailProps) {
    return (
        <div
            className={cn(
                "hidden min-h-0 shrink-0 overflow-x-hidden overflow-y-visible lg:block lg:transition-[width,margin] lg:duration-300 lg:ease-out motion-reduce:transition-none",
                open ? "lg:ml-4" : "lg:ml-0",
                className,
            )}
            style={{ width: open ? "26rem" : "0px" }}
            aria-hidden={open ? undefined : true}
            data-open={open ? "true" : "false"}
        >
            <div
                inert={!open}
                className="h-full w-[26rem]"
            >
                <div className="surface-panel flex h-full min-h-0 w-full overflow-hidden">
                    <div
                        className={cn(
                            "flex h-full min-h-0 w-full flex-col transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none",
                            open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0 motion-reduce:translate-x-0",
                        )}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
