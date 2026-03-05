import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ExternalLink } from "lucide-react";

type Article = {
    id: number;
    source_id: number;
    source_name: string;
    guid: string;
    title: string;
    summary: string;
    published_at: string;
    is_read: boolean;
};

const MAIN_MENU_SCROLL_STORAGE_KEY = "mainMenuScrollPositions_v1";

let db: Database | null = null;
async function getDb() {
    if (!db) {
        db = await Database.load("sqlite:getnews.db");
    }
    return db;
}

export default function NewsList() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const page = parseInt(searchParams.get("page") || "0");
    const search = searchParams.get("q") || "";
    const [searchInput, setSearchInput] = useState(search);

    useEffect(() => {
        loadArticles(page, search);
    }, [page, search]);

    async function loadArticles(p: number, q: string) {
        try {
            const db = await getDb();
            let query = `
        SELECT a.id, a.source_id, s.name as source_name, a.guid, a.title, a.summary, a.published_at, a.is_read
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
        } catch (err) {
            console.error(err);
        }
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        setSearchParams({ q: searchInput, page: "0" });
    }

    function goToPage(p: number) {
        const params: Record<string, string> = { page: String(p) };
        if (search) params.q = search;
        setSearchParams(params);
    }

    function handleExternalLink(e: React.MouseEvent, url: string) {
        e.preventDefault();
        e.stopPropagation();
        openUrl(url);
    }

    function handleHtmlLinkClick(e: React.MouseEvent) {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && anchor.href) {
            e.preventDefault();
            e.stopPropagation();
            openUrl(anchor.href);
        }
    }

    function handleArticleClick() {
        const main = document.querySelector("main");
        if (!(main instanceof HTMLElement)) return;

        let scrollMap: Record<string, number> = {};
        const raw = sessionStorage.getItem(MAIN_MENU_SCROLL_STORAGE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    scrollMap = parsed as Record<string, number>;
                }
            } catch {
                scrollMap = {};
            }
        }

        scrollMap["/"] = Math.max(0, Math.floor(main.scrollTop));
        sessionStorage.setItem(MAIN_MENU_SCROLL_STORAGE_KEY, JSON.stringify(scrollMap));
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
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                </form>
            </div>

            <div className="space-y-4">
                {articles.map(article => (
                    <Link to={`/news/${article.id}`} key={article.id} className="block" onClick={handleArticleClick}>
                        <Card className="hover:border-primary/50 transition-colors">
                            <CardHeader className="py-4">
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-1">
                                    <span className="bg-muted px-2 py-0.5 rounded text-foreground">{article.source_name}</span>
                                    <span>{new Date(article.published_at).toLocaleString()}</span>
                                    {!article.is_read && <span className="bg-blue-500 w-2 h-2 rounded-full inline-block"></span>}
                                </div>
                                <CardTitle className="text-xl leading-tight">{article.title}</CardTitle>
                                <div className="flex items-center gap-3 mt-2">
                                    {article.summary ? (
                                        <CardDescription className="line-clamp-1 text-sm flex-1 min-w-0" dangerouslySetInnerHTML={{ __html: article.summary }} onClick={handleHtmlLinkClick} />
                                    ) : (
                                        <CardDescription className="line-clamp-1 text-sm flex-1 min-w-0">No summary available.</CardDescription>
                                    )}
                                    {article.guid && (
                                        <a
                                            href={article.guid}
                                            className="inline-flex items-center text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                                            onClick={(e) => handleExternalLink(e, article.guid)}
                                        >
                                            <ExternalLink className="w-3 h-3 mr-1" />
                                            Original
                                        </a>
                                    )}
                                </div>
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
                <Button variant="outline" onClick={() => goToPage(Math.max(0, page - 1))} disabled={page === 0}>
                    Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" onClick={() => goToPage(page + 1)} disabled={articles.length < 20}>
                    Next
                </Button>
            </div>
        </div>
    );
}
