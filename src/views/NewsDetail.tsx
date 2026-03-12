import { useState, useEffect, useEffectEvent, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { ArticleContent } from "@/components/article/ArticleContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, Send, Bot, User } from "lucide-react";
import { type Message } from "@/lib/ai";
import { buildArticleDiscussionSystemPrompt } from "@/lib/chat-prompts";
import { compactHtmlText, sanitizeArticleHtml } from "@/lib/article-html";
import { cn } from "@/lib/utils";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/time";
import { useStreamingConversation } from "@/hooks/use-streaming-conversation";

type FullArticle = {
    id: number;
    source_id: number;
    source_name: string;
    source_url: string;
    guid: string;
    title: string;
    summary: string;
    content: string;
    published_at: string;
};

type ArticleDetailViewProps = {
    articleId: number;
    className?: string;
    onBack?: () => void;
    onMarkAsRead?: (articleId: number) => void;
    showAssistant?: boolean;
};

export function ArticleDetailView({
    articleId,
    className,
    onBack,
    onMarkAsRead,
    showAssistant = true,
}: ArticleDetailViewProps) {
    const navigate = useNavigate();
    const [article, setArticle] = useState<FullArticle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const notifyMarkedRead = useEffectEvent((id: number) => {
        onMarkAsRead?.(id);
    });
    const { messages, isStreaming, streamPhase, send, replaceMessages } = useStreamingConversation();

    useEffect(() => {
        let isDisposed = false;

        async function loadCurrentArticle() {
            setIsLoading(true);
            setLoadError(null);

            try {
                const db = await getDb();
                const result: FullArticle[] = await db.select(`
                    SELECT a.*, s.name as source_name, s.url as source_url
                    FROM articles a
                    JOIN sources s ON a.source_id = s.id
                    WHERE a.id = $1
                `, [articleId]);

                if (isDisposed) {
                    return;
                }

                setArticle(result[0] ?? null);
                if (!result[0]) {
                    setLoadError("Article not found.");
                }
            } catch (err) {
                console.error(err);
                if (!isDisposed) {
                    setArticle(null);
                    setLoadError("Failed to load article.");
                }
            } finally {
                if (!isDisposed) {
                    setIsLoading(false);
                }
            }
        }

        replaceMessages([]);
        setInput("");
        void loadCurrentArticle();
        void markAsRead(articleId);
        notifyMarkedRead(articleId);

        return () => {
            isDisposed = true;
        };
    }, [articleId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, streamPhase]);

    async function markAsRead(articleId: number) {
        try {
            const db = await getDb();
            await db.execute("UPDATE articles SET is_read = 1 WHERE id = $1", [articleId]);
        } catch (err) { }
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim() || isStreaming || !article) return;

        const inputValue = input.trim();
        setInput("");

        await send({
            content: inputValue,
            buildConversation: async (history, userMessage) => {
                const db = await getDb();
                const keywords = article.title
                    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, " ")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 5)
                    .join(" OR ");

                let relatedContext = "";
                if (keywords) {
                    const relatedArticles: {
                        title: string;
                        summary: string | null;
                        published_at: string | null;
                    }[] = await db.select(
                        `
                            SELECT title, summary, published_at
                            FROM articles_fts
                            WHERE articles_fts MATCH $1 AND rowid != $2
                            LIMIT 3
                        `,
                        [keywords, article.id],
                    );

                    if (relatedArticles.length > 0) {
                        relatedContext = `\n\nRelated Articles Context:\n${relatedArticles
                            .map((relatedArticle) => `- [${formatUtcDateTime(relatedArticle.published_at, "Unknown")}] ${relatedArticle.title}: ${compactHtmlText(relatedArticle.summary ?? "")}`)
                            .join("\n")}`;
                    }
                }

                const systemPrompt = buildArticleDiscussionSystemPrompt({
                    articleTitle: article.title,
                    sourceName: article.source_name,
                    articleContent: article.content,
                    relatedContext,
                });

                return [
                    { role: "system", content: systemPrompt } as Message,
                    ...history,
                    userMessage,
                ];
            },
        });
    }

    function handleBack() {
        if (onBack) {
            onBack();
            return;
        }

        if (window.history.length > 1) {
            navigate(-1);
            return;
        }

        navigate("/");
    }

    if (isLoading && !article) {
        return (
            <div className={cn("flex h-full w-full items-center justify-center p-8", className)}>
                <div className="text-sm text-muted-foreground">Loading article...</div>
            </div>
        );
    }

    if (!article) {
        return (
            <div className={cn("flex h-full w-full flex-col items-center justify-center gap-4 p-8", className)}>
                <div className="text-sm text-muted-foreground">{loadError ?? "Article not found."}</div>
                <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Timeline
                </Button>
            </div>
        );
    }

    return (
        <div className={cn("flex h-full w-full min-h-0", className)}>
            <div className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">
                <div className={cn("mx-auto w-full p-6 md:p-8", showAssistant ? "max-w-4xl" : "max-w-5xl")}>
                    <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground hover:bg-muted/50 transition-colors" onClick={handleBack}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Timeline
                    </Button>

                    <div className="mb-8">
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground leading-tight">{article.title}</h1>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span className="bg-primary/10 text-primary px-2 py-0.5 font-medium rounded-md">{article.source_name}</span>
                            <span>{formatUtcDateTime(article.published_at)}</span>
                            <a
                                href={article.guid}
                                className="flex items-center hover:text-primary transition-colors hover:underline cursor-pointer"
                                onClick={(e) => { e.preventDefault(); openUrl(article.guid); }}
                            >
                                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Original Source
                            </a>
                        </div>
                    </div>

                    {article.summary && (
                        <div
                            className="mb-6 text-sm text-muted-foreground"
                            dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.summary) }}
                            onClick={(e) => {
                                const target = e.target as HTMLElement;
                                const anchor = target.closest('a');
                                if (anchor && anchor.href) {
                                    e.preventDefault();
                                    openUrl(anchor.href);
                                }
                            }}
                        />
                    )}

                    <ArticleContent
                        content={article.content}
                        className="prose prose-neutral dark:prose-invert max-w-none w-full leading-relaxed text-foreground/90"
                        onClick={(e) => {
                            const target = e.target as HTMLElement;
                            const anchor = target.closest('a');
                            if (anchor && anchor.href) {
                                e.preventDefault();
                                openUrl(anchor.href);
                            }
                        }}
                    />
                </div>
            </div>

            {showAssistant && (
                <div className="hidden w-[360px] shrink-0 border-l bg-muted/10 shadow-[-4px_0_24px_-16px_rgba(0,0,0,0.1)] lg:flex lg:flex-col">
                    <div className="p-4 border-b font-semibold flex items-center bg-card">
                        <Bot className="w-5 h-5 mr-2 text-primary" /> AI Discussion
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm" ref={scrollRef}>
                        {messages.length === 0 ? (
                            <div className="text-center mt-10 text-muted-foreground">
                                <p>Ask a question about this article!</p>
                                <div className="mt-4 flex flex-col gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setInput("Can you summarize this article?")}>Summarize</Button>
                                    <Button variant="outline" size="sm" onClick={() => setInput("What are the main key points?")}>Key Points</Button>
                                    <Button variant="outline" size="sm" onClick={() => setInput("Any counterarguments to this?")}>Counterarguments</Button>
                                </div>
                            </div>
                        ) : (
                            messages.map((m, i) => (
                                <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                                        {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-primary" />}
                                    </div>
                                    <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border shadow-sm rounded-tl-sm"}`}>
                                        {(() => {
                                            const isLiveAssistantMessage = m.role === "assistant"
                                                && isStreaming
                                                && i === messages.length - 1;
                                            const isPreparingMessage = isLiveAssistantMessage
                                                && streamPhase === "preparing"
                                                && m.content.trim().length === 0;

                                            if (isPreparingMessage) {
                                                return (
                                                    <div className="flex items-center gap-3 text-muted-foreground">
                                                        <span>Connecting to the model...</span>
                                                        <div className="flex items-center space-x-1">
                                                            <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                                                            <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                                                            <span className="w-1.5 h-1.5 bg-primary/80 rounded-full animate-bounce [animation-delay:0.4s]" />
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="space-y-2">
                                                    <ChatMarkdown
                                                        content={m.content}
                                                        tone={m.role === "user" ? "inverse" : "default"}
                                                    />
                                                    {isLiveAssistantMessage && streamPhase === "streaming" && (
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <span className="w-2 h-2 rounded-full bg-primary/80 animate-pulse" />
                                                            <span>Streaming...</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 border-t bg-card">
                        <form onSubmit={handleSend} className="relative flex items-center">
                            <Input
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder="Ask anything..."
                                className="pr-12 rounded-full bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-primary/50"
                                disabled={isStreaming}
                            />
                            <Button
                                type="submit"
                                size="icon"
                                className="absolute right-1 w-8 h-8 rounded-full"
                                disabled={isStreaming || !input.trim()}
                            >
                                <Send className="w-4 h-4" />
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function NewsDetail() {
    const { id } = useParams();
    const parsedArticleId = Number.parseInt(id ?? "", 10);

    if (!Number.isFinite(parsedArticleId) || parsedArticleId <= 0) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8">
                <div className="text-sm text-muted-foreground">Article not found.</div>
            </div>
        );
    }

    return <ArticleDetailView articleId={parsedArticleId} />;
}
