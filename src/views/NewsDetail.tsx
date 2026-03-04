import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import Database from "@tauri-apps/plugin-sql";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, Send, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { streamChat, Message } from "@/lib/ai";

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

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

export default function NewsDetail() {
    const { id } = useParams();
    const [article, setArticle] = useState<FullArticle | null>(null);

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) {
            loadArticle(parseInt(id));
            markAsRead(parseInt(id));
        }
    }, [id]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    async function loadArticle(articleId: number) {
        try {
            const db = await getDb();
            const result: FullArticle[] = await db.select(`
        SELECT a.*, s.name as source_name, s.url as source_url
        FROM articles a
        JOIN sources s ON a.source_id = s.id
        WHERE a.id = $1
      `, [articleId]);
            if (result.length > 0) {
                setArticle(result[0]);
            }
        } catch (err) {
            console.error(err);
        }
    }

    async function markAsRead(articleId: number) {
        try {
            const db = await getDb();
            await db.execute("UPDATE articles SET is_read = 1 WHERE id = $1", [articleId]);
        } catch (err) { }
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim() || isTyping || !article) return;

        const userMsg: Message = { role: "user", content: input.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsTyping(true);

        try {
            // Fetch Top N Related Articles via FTS
            const db = await getDb();
            const keywords = article.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).slice(0, 5).join(' OR ');

            let relatedContext = "";
            if (keywords) {
                const relatedUrls: any[] = await db.select(`
          SELECT title, summary, published_at FROM articles_fts 
          WHERE articles_fts MATCH $1 AND rowid != $2
          LIMIT 3
        `, [keywords, article.id]);

                if (relatedUrls.length > 0) {
                    relatedContext = "\\n\\nRelated Articles Context:\\n" + relatedUrls.map(a => `- [${a.published_at}] ${a.title}: ${a.summary}`).join("\\n");
                }
            }

            const systemPrompt = `You are a helpful reading assistant. The user is reading the following article titled "${article.title}" source: ${article.source_name}.
Current Article Content:
${article.content}
${relatedContext}

Answer the user's questions based primarily on the current article. Use related context if asked for broader info. Be concise.`;

            setMessages(prev => [...prev, { role: "assistant", content: "" }]);

            const fullConvo = [
                { role: "system", content: systemPrompt } as Message,
                ...messages,
                userMsg
            ];

            await streamChat(fullConvo, (chunk) => {
                setMessages(prev => {
                    const newM = [...prev];
                    const last = newM[newM.length - 1];
                    if (last.role === "assistant") {
                        last.content += chunk;
                    }
                    return newM;
                });
            });

        } catch (err: any) {
            setMessages(prev => [...prev, { role: "assistant", content: `**Error:** ${err.message}` }]);
        } finally {
            setIsTyping(false);
        }
    }

    if (!article) return <div className="p-8">Loading...</div>;

    return (
        <div className="flex h-full w-full">
            <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto custom-scrollbar">
                <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Link to="/">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Timeline
                    </Link>
                </Button>

                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground leading-tight">{article.title}</h1>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 font-medium rounded-md">{article.source_name}</span>
                        <span>{new Date(article.published_at).toLocaleString()}</span>
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
                        dangerouslySetInnerHTML={{ __html: article.summary }}
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

                <div className="prose prose-neutral dark:prose-invert max-w-none w-full leading-relaxed text-foreground/90">
                    <ReactMarkdown>
                        {article.content || "_No content body available for this article._"}
                    </ReactMarkdown>
                </div>
            </div>

            {/* AI Chat Sidebar Area */}
            <div className="w-[360px] border-l bg-muted/10 flex flex-col hidden lg:flex shadow-[-4px_0_24px_-16px_rgba(0,0,0,0.1)]">
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
                                    <div className="prose prose-sm dark:prose-invert leading-relaxed max-w-none break-words">
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    {isTyping && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-card border">
                                <Bot className="w-4 h-4 text-primary" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl bg-card border shadow-sm flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce"></span>
                                <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                <span className="w-1.5 h-1.5 bg-primary/80 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-card">
                    <form onSubmit={handleSend} className="relative flex items-center">
                        <Input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask anything..."
                            className="pr-12 rounded-full bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-primary/50"
                            disabled={isTyping}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            className="absolute right-1 w-8 h-8 rounded-full"
                            disabled={isTyping || !input.trim()}
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
