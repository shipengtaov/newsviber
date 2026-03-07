import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, Plus, Trash2, Zap, ArrowLeft, Send } from "lucide-react";
import { streamChat, Message } from "@/lib/ai";
import ReactMarkdown from "react-markdown";
import { PageShell } from "@/components/layout/PageShell";

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

type Project = {
    id: number;
    name: string;
    prompt: string;
    cycle_mode: string;
};

type CreativeCard = {
    id: number;
    project_id: number;
    title: string;
    signals: string;
    interpretation: string;
    ideas: string;
    counterpoints: string;
    next_actions: string;
    full_report: string;
    created_at: string;
};

export default function CreativeSpace() {
    const { toast } = useToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [cards, setCards] = useState<CreativeCard[]>([]);

    const [activeProject, setActiveProject] = useState<Project | null>(null);
    const [activeCard, setActiveCard] = useState<CreativeCard | null>(null);

    const [newName, setNewName] = useState("");
    const [newPrompt, setNewPrompt] = useState("");

    const [isGenerating, setIsGenerating] = useState(false);

    // Chat state for Active Card
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);

    useEffect(() => {
        loadProjects();
    }, []);

    async function loadProjects() {
        try {
            const db = await getDb();
            const result: Project[] = await db.select("SELECT * FROM creative_projects ORDER BY id DESC");
            setProjects(result);
        } catch (err) { }
    }

    async function loadCards(projectId: number) {
        try {
            const db = await getDb();
            const result: CreativeCard[] = await db.select("SELECT * FROM creative_cards WHERE project_id = $1 ORDER BY id DESC", [projectId]);
            setCards(result);
        } catch (err) { }
    }

    async function addProject(e: React.FormEvent) {
        e.preventDefault();
        if (!newName || !newPrompt) return;
        try {
            const db = await getDb();
            await db.execute(
                "INSERT INTO creative_projects (name, prompt, cycle_mode) VALUES ($1, $2, 'manual')",
                [newName, newPrompt]
            );
            // Fetch the newly created project to get its ID
            const newProjects: Project[] = await db.select(
                "SELECT * FROM creative_projects WHERE name = $1 AND prompt = $2 ORDER BY id DESC LIMIT 1",
                [newName, newPrompt]
            );
            setNewName("");
            setNewPrompt("");
            toast({ title: "Project created" });
            if (newProjects.length > 0) {
                // Navigate directly into the new project
                setActiveProject(newProjects[0]);
                setCards([]);
            }
            loadProjects();
        } catch (err: any) {
            toast({ title: "Error", description: String(err), variant: "destructive" });
        }
    }

    async function deleteProject(id: number) {
        try {
            const db = await getDb();
            await db.execute("DELETE FROM creative_projects WHERE id = $1", [id]);
            toast({ title: "Project deleted" });
            if (activeProject?.id === id) {
                setActiveProject(null);
            }
            loadProjects();
        } catch (err: any) { }
    }

    async function generateCard(project: Project) {
        setIsGenerating(true);
        toast({ title: "Generating Idea Card...", description: "Analyzing recent news context." });
        try {
            const db = await getDb();
            const articles: any[] = await db.select(
                "SELECT title, summary FROM articles WHERE published_at >= datetime('now', '-3 days') ORDER BY published_at DESC LIMIT 60"
            );

            const contextStr = articles.map(a => `- ${a.title}: ${a.summary}`).join("\\n");
            const sysPrompt = `You are a visionary strategist. Analyze the following recent news context and combine it with the user's focus prompt to generate a structured creative report.
      
      Your response MUST be wrapped in a markdown JSON code block. Format EXACTLY like this:
      \`\`\`json
      {
        "title": "A catchy title for the insight",
        "signals": "Key signals and trends identified (markdown supported)",
        "interpretation": "What this means and why it matters (markdown supported)",
        "ideas": "Creative ideas or hypotheses (markdown supported)",
        "counterpoints": "Risks, challenges, or opposite views (markdown supported)",
        "next_actions": "Recommended actionable next steps (markdown supported)"
      }
      \`\`\`
      
      User's Focus Prompt: ${project.prompt}
      
      Recent News Context:
      ${contextStr}`;

            let rawResponse = "";
            await streamChat([{ role: "user", content: sysPrompt }], (chunk) => {
                rawResponse += chunk;
            });

            // Extract JSON
            const jsonMatch = rawResponse.match(/```json\\s*([\\s\\S]*?)\\s*```/);
            let parsed;
            if (jsonMatch && jsonMatch[1]) {
                parsed = JSON.parse(jsonMatch[1]);
            } else {
                // Fallback attempt
                const start = rawResponse.indexOf('{');
                const end = rawResponse.lastIndexOf('}');
                if (start !== -1 && end !== -1) {
                    parsed = JSON.parse(rawResponse.substring(start, end + 1));
                } else {
                    throw new Error("Failed to parse AI structured response.");
                }
            }

            await db.execute(
                `INSERT INTO creative_cards 
        (project_id, title, signals, interpretation, ideas, counterpoints, next_actions, full_report) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [project.id, parsed.title || "Untitled Insight", parsed.signals || "", parsed.interpretation || "", parsed.ideas || "", parsed.counterpoints || "", parsed.next_actions || "", rawResponse]
            );

            toast({ title: "Success! Card Generated." });
            loadCards(project.id);
        } catch (err: any) {
            toast({ title: "Generation failed", description: String(err), variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    }

    async function handleChat(e: React.FormEvent) {
        e.preventDefault();
        if (!chatInput.trim() || isTyping || !activeCard) return;

        const userMsg: Message = { role: "user", content: chatInput.trim() };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput("");
        setIsTyping(true);

        try {
            const sysPrompt = `You are discussing a creative report you generated.
Report Data:
Title: ${activeCard.title}
Signals: ${activeCard.signals}
Ideas: ${activeCard.ideas}

Be concise and explore the user's questions further.`;

            setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);
            const fullConvo = [{ role: "system", content: sysPrompt } as Message, ...chatMessages, userMsg];

            await streamChat(fullConvo, (chunk) => {
                setChatMessages(prev => {
                    const newM = [...prev];
                    const last = newM[newM.length - 1];
                    last.content += chunk;
                    return newM;
                });
            });
        } catch (err) { } finally {
            setIsTyping(false);
        }
    }

    function openCard(card: CreativeCard) {
        setActiveCard(card);
        setChatMessages([]);
    }

    // View 3: Card Detail Overlay
    if (activeCard) {
        return (
            <div className="flex flex-col h-full bg-background relative">
                <div className="flex items-center p-4 border-b">
                    <Button variant="ghost" size="sm" onClick={() => setActiveCard(null)}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <div className="ml-4 font-semibold text-lg">{activeCard.title}</div>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
                        <section>
                            <h3 className="text-xl font-bold mb-3 text-primary">Key Signals</h3>
                            <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{activeCard.signals}</ReactMarkdown></div>
                        </section>
                        <section>
                            <h3 className="text-xl font-bold mb-3 text-amber-500">Interpretation</h3>
                            <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{activeCard.interpretation}</ReactMarkdown></div>
                        </section>
                        <section>
                            <h3 className="text-xl font-bold mb-3 text-green-500">Creative Ideas</h3>
                            <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{activeCard.ideas}</ReactMarkdown></div>
                        </section>
                        <section>
                            <h3 className="text-xl font-bold mb-3 text-red-500">Counterpoints</h3>
                            <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{activeCard.counterpoints}</ReactMarkdown></div>
                        </section>
                        <section>
                            <h3 className="text-xl font-bold mb-3 text-indigo-500">Next Actions</h3>
                            <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{activeCard.next_actions}</ReactMarkdown></div>
                        </section>
                    </div>
                    {/* Chat Sidebar */}
                    <div className="w-96 border-l flex flex-col bg-muted/10">
                        <div className="p-4 border-b font-medium">Discuss Note</div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                            {chatMessages.length === 0 && <p className="text-muted-foreground text-center mt-10">Expand on these ideas with AI.</p>}
                            {chatMessages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`px-3 py-2 rounded-xl max-w-[85%] ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border shadow-sm"}`}>
                                        <div className="prose prose-sm dark:prose-invert max-w-none break-words"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-3 bg-card border-t">
                            <form onSubmit={handleChat} className="flex items-center gap-2">
                                <Input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Explore further..." disabled={isTyping} className="h-8 text-sm" />
                                <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={isTyping || !chatInput.trim()}><Send className="w-3.5 h-3.5" /></Button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // View 2: Project Detail (Cards List)
    if (activeProject) {
        return (
            <PageShell size="wide">
                <Button variant="ghost" size="sm" onClick={() => setActiveProject(null)} className="mb-4 -ml-2 text-muted-foreground">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
                </Button>
                <div className="flex items-center justify-between mb-8 pb-4 border-b">
                    <div>
                        <h1 className="text-3xl font-bold">{activeProject.name}</h1>
                        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{activeProject.prompt}</p>
                    </div>
                    <Button onClick={() => generateCard(activeProject)} disabled={isGenerating} size="lg" className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-purple-500/20">
                        <Zap className="mr-2 h-4 w-4" /> {isGenerating ? "Analyzing..." : "Generate Card"}
                    </Button>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {cards.map(c => (
                        <Card key={c.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all flex flex-col h-64" onClick={() => openCard(c)}>
                            <CardHeader className="pb-2 flex-none">
                                <div className="text-xs text-muted-foreground mb-1">{new Date(c.created_at).toLocaleDateString()}</div>
                                <CardTitle className="text-lg leading-tight line-clamp-2">{c.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2 flex-1 overflow-hidden relative">
                                <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert line-clamp-4">
                                    <ReactMarkdown>{c.signals}</ReactMarkdown>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent"></div>
                            </CardContent>
                        </Card>
                    ))}
                    {cards.length === 0 && (
                        <div className="col-span-full border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                            <Lightbulb className="w-12 h-12 text-muted-foreground/30 mb-4" />
                            <p>No creative cards generated yet.</p>
                            <p className="text-sm">Click "Generate Card" to analyze recent news against your prompt.</p>
                        </div>
                    )}
                </div>
            </PageShell>
        );
    }

    // View 1: Projects List
    return (
        <PageShell className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Creative Space</h1>
                <p className="text-muted-foreground mt-2">Connect the dots across recent news using AI to generate fresh insights.</p>
            </div>

            <Dialog>
                <DialogTrigger asChild>
                    <Button><Plus className="w-4 h-4 mr-2" /> New Project</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Creative Project</DialogTitle>
                        <DialogDescription>Define a persona or focus area for AI to analyze daily news.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={addProject} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label>Project Name</Label>
                            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. AI Startup Ideas" required />
                        </div>
                        <div className="space-y-2">
                            <Label>Focus Prompt</Label>
                            <Textarea
                                value={newPrompt}
                                onChange={e => setNewPrompt(e.target.value)}
                                placeholder="Act as a tech entrepreneur. Look for gaps in the market based on recent AI launches..."
                                className="h-32 resize-none"
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full">Create Project</Button>
                    </form>
                </DialogContent>
            </Dialog>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map(p => (
                    <Card key={p.id} className="hover:border-primary/30 transition-colors flex flex-col">
                        <CardHeader className="pb-3 flex-1">
                            <CardTitle className="flex justify-between items-start text-xl">
                                <span className="truncate pr-2 cursor-pointer hover:underline" onClick={() => { setActiveProject(p); loadCards(p.id); }}>{p.name}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground shrink-0" onClick={() => deleteProject(p.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </CardTitle>
                            <CardDescription className="line-clamp-3 text-sm mt-2">{p.prompt}</CardDescription>
                        </CardHeader>
                        <CardFooter className="pt-0 border-t mt-4 border-dashed pt-4 opacity-70 flex justify-between">
                            <span className="text-xs uppercase font-medium">Mode: {p.cycle_mode}</span>
                            <Button size="sm" variant="secondary" onClick={() => { setActiveProject(p); loadCards(p.id); }}>Enter</Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </PageShell>
    );
}
