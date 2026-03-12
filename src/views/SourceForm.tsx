import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { DEFAULT_SOURCE_RETURN_TO, isNewsReturnToPath, resolveSourceReturnTo } from "@/lib/source-navigation";

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

function parseFetchInterval(value: string): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 60;
}

export default function SourceForm() {
    const { toast } = useToast();
    const navigate = useNavigate();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const isEditing = !!id;
    const resolvedReturnTo = resolveSourceReturnTo(searchParams.get("returnTo"));
    const returnButtonLabel = isNewsReturnToPath(resolvedReturnTo) ? "Back to News" : "Back to Sources";
    const shouldReplaceOnReturn = searchParams.has("returnTo") && resolvedReturnTo !== DEFAULT_SOURCE_RETURN_TO;

    const [name, setName] = useState("");
    const [type, setType] = useState("rss");
    const [url, setUrl] = useState("");
    const [interval, setInterval] = useState("60");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isEditing) {
            loadSource(id);
        }
    }, [id]);

    function navigateBack() {
        navigate(resolvedReturnTo, { replace: shouldReplaceOnReturn });
    }

    async function loadSource(sourceId: string) {
        try {
            const db = await getDb();
            const result: any[] = await db.select("SELECT * FROM sources WHERE id = $1", [parseInt(sourceId)]);
            if (result.length > 0) {
                const s = result[0];
                setName(s.name);
                setType(s.source_type);
                setUrl(s.url);
                setInterval(s.fetch_interval.toString());
            } else {
                toast({ title: "Source not found", variant: "destructive" });
                navigate(resolvedReturnTo, { replace: shouldReplaceOnReturn });
            }
        } catch (err: any) {
            console.error(err);
            toast({ title: "Error loading source", description: String(err), variant: "destructive" });
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name || !url) return;
        setLoading(true);
        try {
            const db = await getDb();
            if (isEditing) {
                await db.execute(
                    "UPDATE sources SET name = $1, source_type = $2, url = $3, fetch_interval = $4 WHERE id = $5",
                    [name, type, url, parseFetchInterval(interval), parseInt(id as string)]
                );
                toast({ title: "Source updated successfully" });
            } else {
                await db.execute(
                    "INSERT INTO sources (name, source_type, url, fetch_interval, active) VALUES ($1, $2, $3, $4, 1)",
                    [name, type, url, parseFetchInterval(interval)]
                );
                toast({ title: "Source added successfully" });
            }
            navigateBack();
        } catch (err: any) {
            toast({ title: "Error saving source", description: String(err), variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    return (
        <PageShell variant="workspace" className="space-y-8">
            <Button variant="ghost" size="sm" onClick={navigateBack} className="-ml-2">
                <ChevronLeft className="h-4 w-4 mr-2" />
                {returnButtonLabel}
            </Button>

            <div>
                <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Source" : "Add New Source"}</h1>
                <p className="text-muted-foreground mt-2">
                    {isEditing ? "Update your data source configuration." : "Add a new data source to track automatically."}
                </p>
            </div>

            <div className="mt-8">
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">Source Name</Label>
                            <Input placeholder="e.g. Hacker News" value={name} onChange={e => setName(e.target.value)} required className="bg-background/50" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="rss">RSS Feed</SelectItem>
                                    <SelectItem value="jina_url">Jina URL Scrape</SelectItem>
                                    <SelectItem value="twitter">Twitter (/X)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-3 md:col-span-2">
                            <Label className="text-sm font-medium">Target URL</Label>
                            <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} required className="bg-background/50" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">Fetch Interval (minutes)</Label>
                            <Input type="number" min="0" value={interval} inline-block="true" onChange={e => setInterval(e.target.value)} className="bg-background/50" />
                            <p className="text-xs text-muted-foreground">Set to 0 for manual refresh only.</p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
                        <Button type="button" variant="outline" onClick={navigateBack}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {isEditing ? "Save Changes" : "Add Source"}
                        </Button>
                    </div>
                </form>
            </div>
        </PageShell>
    );
}
