import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";

type Article = {
    id: number;
    source_id: number;
    source_name: string;
    title: string;
    summary: string;
    published_at: string;
    is_read: boolean;
};

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

export default function NewsList() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(0);

    useEffect(() => {
        loadArticles(0, search);
    }, []);

    async function loadArticles(p: number, q: string) {
        try {
            const db = await getDb();
            let query = `
        SELECT a.id, a.source_id, s.name as source_name, a.title, a.summary, a.published_at, a.is_read
        FROM articles a
        JOIN sources s ON a.source_id = s.id
      `;
            let params: any[] = [];

            if (q.trim()) {
                query += `
          JOIN articles_fts fts ON a.id = fts.rowid
          WHERE articles_fts MATCH $1
        `;
                params.push(q);
            }

            query += ` ORDER BY a.published_at DESC LIMIT 20 OFFSET $${params.length + 1}`;
            params.push(p * 20);

            const result: Article[] = await db.select(query, params);
            setArticles(result);
            setPage(p);
        } catch (err) {
            console.error(err);
        }
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        loadArticles(0, search);
    }

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Timeline</h1>
                    <p className="text-muted-foreground mt-1">Latest news from your sources.</p>
                </div>
                <form onSubmit={handleSearch} className="flex items-center space-x-2 relative w-full md:w-80">
                    <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
                    <Input
                        placeholder="Search articles..."
                        className="pl-9"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </form>
            </div>

            <div className="space-y-4">
                {articles.map(article => (
                    <Link to={`/news/${article.id}`} key={article.id} className="block">
                        <Card className="hover:border-primary/50 transition-colors">
                            <CardHeader className="py-4">
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-1">
                                    <span className="bg-muted px-2 py-0.5 rounded text-foreground">{article.source_name}</span>
                                    <span>{new Date(article.published_at).toLocaleString()}</span>
                                    {!article.is_read && <span className="bg-blue-500 w-2 h-2 rounded-full inline-block"></span>}
                                </div>
                                <CardTitle className="text-xl leading-tight">{article.title}</CardTitle>
                                <CardDescription className="line-clamp-2 mt-2 text-sm">{article.summary || "No summary available."}</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
                {articles.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                        No articles found. Add some sources and fetch!
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between pt-4">
                <Button variant="outline" onClick={() => loadArticles(Math.max(0, page - 1), search)} disabled={page === 0}>
                    Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" onClick={() => loadArticles(page + 1, search)} disabled={articles.length < 20}>
                    Next
                </Button>
            </div>
        </div>
    );
}
