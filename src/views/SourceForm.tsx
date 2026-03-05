import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

export default function SourceForm() {
    const { toast } = useToast();
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = !!id;

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
                navigate("/sources");
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
                    [name, type, url, parseInt(interval) || 60, parseInt(id as string)]
                );
                toast({ title: "Source updated successfully" });
            } else {
                await db.execute(
                    "INSERT INTO sources (name, source_type, url, fetch_interval, active) VALUES ($1, $2, $3, $4, 1)",
                    [name, type, url, parseInt(interval) || 60]
                );
                toast({ title: "Source added successfully" });
            }
            navigate("/sources");
        } catch (err: any) {
            toast({ title: "Error saving source", description: String(err), variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-8 max-w-2xl mx-auto space-y-6">
            <Button variant="ghost" onClick={() => navigate("/sources")} className="mb-4 -ml-4">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Sources
            </Button>

            <div>
                <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Source" : "Add New Source"}</h1>
                <p className="text-muted-foreground mt-2">
                    {isEditing ? "Update your data source configuration." : "Add a new data source to track automatically."}
                </p>
            </div>

            <Card>
                <form onSubmit={handleSubmit}>
                    <CardHeader>
                        <CardTitle>Configuration</CardTitle>
                        <CardDescription>Enter the details for this content source.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Source Name</Label>
                            <Input placeholder="e.g. Hacker News" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="rss">RSS Feed</SelectItem>
                                    <SelectItem value="jina_url">Jina URL Scrape</SelectItem>
                                    <SelectItem value="twitter">Twitter (/X)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Target URL</Label>
                            <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Fetch Interval (minutes)</Label>
                            <Input type="number" value={interval} inline-block="true" onChange={e => setInterval(e.target.value)} />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => navigate("/sources")}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {isEditing ? "Save Changes" : "Add Source"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
