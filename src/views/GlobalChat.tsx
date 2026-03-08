import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Bot, User, Trash2 } from "lucide-react";
import { type Message } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/time";
import { useStreamingConversation } from "@/hooks/use-streaming-conversation";
import ReactMarkdown from "react-markdown";

export default function GlobalChat() {
    const [input, setInput] = useState("");
    const [timeRange, setTimeRange] = useState("7");
    const scrollRef = useRef<HTMLDivElement>(null);
    const { messages, isStreaming, send, clear } = useStreamingConversation();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;

        const inputValue = input.trim();
        setInput("");

        await send({
            content: inputValue,
            buildConversation: async (history, userMessage) => {
                const db = await getDb();
                const articles: {
                    title: string;
                    summary: string | null;
                    published_at: string | null;
                }[] = await db.select(
                    `SELECT title, summary, published_at FROM articles WHERE published_at >= datetime('now', '-${timeRange} days') ORDER BY published_at DESC LIMIT 50`
                );

                const contextStr = articles
                    .map((article) => `- [${formatUtcDateTime(article.published_at, "Unknown")}] ${article.title}: ${article.summary ?? ""}`)
                    .join("\n");
                const systemPrompt = `You are an AI assistant in a News Aggregation app. The user wants to discuss recent news.

Here is the recent news context:
${contextStr}

Answer the user's questions based primarily on this context. Be concise and helpful.`;

                return [
                    { role: "system", content: systemPrompt } as Message,
                    ...history,
                    userMessage,
                ];
            },
        });
    }

    function clearChat() {
        clear();
        setInput("");
    }

    return (
        <div className="flex h-full w-full">
            {/* Sidebar config for chat scope */}
            <div className="w-64 border-r bg-muted/10 p-4 flex flex-col space-y-6">
                <div>
                    <h2 className="font-semibold mb-4">Chat Context</h2>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Time Range</label>
                            <Select value={timeRange} onValueChange={setTimeRange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Last 24 Hours</SelectItem>
                                    <SelectItem value="3">Last 3 Days</SelectItem>
                                    <SelectItem value="7">Last 7 Days</SelectItem>
                                    <SelectItem value="30">Last 30 Days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="mt-auto">
                    <Button variant="outline" className="w-full text-destructive" onClick={clearChat}>
                        <Trash2 className="w-4 h-4 mr-2" /> Clear History
                    </Button>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative max-w-4xl mx-auto w-full border-x bg-card/30">
                <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                    <div className="space-y-6 pb-20">
                        {messages.length === 0 && (
                            <div className="text-center mt-20 text-muted-foreground max-w-sm mx-auto p-8 border rounded-lg bg-background">
                                <Bot className="w-12 h-12 mx-auto mb-4 text-primary/50" />
                                <h3 className="font-semibold text-lg mb-2 text-foreground">Global AI Chat</h3>
                                <p className="text-sm">Ask me to summarize recent news, identify trends, or compare viewpoints from your feeds.</p>
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                    {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                </div>
                                <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-sm ${m.role === "user" ? "bg-primary/10" : "bg-muted/30 border"}`}>
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isStreaming && (
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted">
                                    <Bot className="w-4 h-4" />
                                </div>
                                <div className="px-4 py-3 rounded-2xl bg-muted/30 border flex items-center space-x-1">
                                    <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-2 h-2 bg-primary/80 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="absolute bottom-0 w-full p-4 bg-background/80 backdrop-blur-md border-t">
                    <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-2">
                        <Input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask about recent news..."
                            className="flex-1 rounded-full px-6 bg-muted/50 focus-visible:ring-1"
                            autoFocus
                        />
                        <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={isStreaming || !input.trim()}>
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
