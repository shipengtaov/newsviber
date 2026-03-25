import { useState, useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArticleContent } from "@/components/article/ArticleContent";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { sanitizeArticleHtml } from "@/lib/article-html";
import { markNewsArticleAsRead } from "@/lib/news-service";
import { cn } from "@/lib/utils";
import { getDb } from "@/lib/db";
import { formatUtcDateTime } from "@/lib/time";
import { CONTENT_GUTTER_X_CLASS } from "@/components/layout/layout-spacing";

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
};

type NewsDetailLocationState = {
    returnTo?: string;
};

export function ArticleDetailView({
    articleId,
    className,
    onBack,
    onMarkAsRead,
}: ArticleDetailViewProps) {
    const { t } = useTranslation("news");
    const navigate = useNavigate();
    const location = useLocation();
    const [article, setArticle] = useState<FullArticle | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const notifyMarkedRead = useEffectEvent((id: number) => {
        onMarkAsRead?.(id);
    });

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
                    setLoadError(t("articleNotFound"));
                }
            } catch (err) {
                console.error(err);
                if (!isDisposed) {
                    setArticle(null);
                    setLoadError(t("failedToLoadArticle"));
                }
            } finally {
                if (!isDisposed) {
                    setIsLoading(false);
                }
            }
        }

        void loadCurrentArticle();
        void markAsRead(articleId);

        return () => {
            isDisposed = true;
        };
    }, [articleId]);

    async function markAsRead(articleId: number) {
        try {
            await markNewsArticleAsRead(articleId);
            notifyMarkedRead(articleId);
        } catch (err) {
            console.error(err);
        }
    }

    function handleBack() {
        const returnTo = (location.state as NewsDetailLocationState | null)?.returnTo;

        if (onBack) {
            onBack();
            return;
        }

        if (typeof returnTo === "string" && returnTo.length > 0) {
            navigate(returnTo);
            return;
        }

        navigate("/");
    }

    if (isLoading && !article) {
        return (
            <div className={cn("flex h-full w-full items-center justify-center py-6", CONTENT_GUTTER_X_CLASS, className)}>
                <div className="surface-panel-quiet px-6 py-10 text-sm text-muted-foreground">{t("loadingArticle")}</div>
            </div>
        );
    }

    if (!article) {
        return (
            <div className={cn("flex h-full w-full flex-col items-center justify-center gap-4 py-6", CONTENT_GUTTER_X_CLASS, className)}>
                <div className="surface-panel-quiet px-6 py-10 text-center text-sm text-muted-foreground">
                    {loadError ?? t("articleNotFound")}
                </div>
                <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t("backToNews")}
                </Button>
            </div>
        );
    }

    return (
        <div className={cn("flex h-full w-full min-h-0 py-4 md:py-6", CONTENT_GUTTER_X_CLASS, className)}>
            <div className="surface-panel min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-5xl p-6 md:p-8">
                    <Button variant="ghost" className="mb-5 -ml-1 text-muted-foreground hover:bg-background/80" onClick={handleBack}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> {t("backToNews")}
                    </Button>

                    <div className="mb-7">
                        <h1 className="mb-3 font-display text-[2rem] font-semibold leading-tight tracking-[-0.05em] text-foreground md:text-[2.35rem]">{article.title}</h1>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="rounded-full bg-accent/80 px-3 py-1 font-medium text-accent-foreground">{article.source_name}</span>
                            <span>{formatUtcDateTime(article.published_at)}</span>
                            <a
                                href={article.guid}
                                className="flex items-center text-primary transition-colors hover:text-accent-foreground hover:underline cursor-pointer"
                                onClick={(e) => { e.preventDefault(); openUrl(article.guid); }}
                            >
                                <ExternalLink className="w-3.5 h-3.5 mr-1" /> {t("originalSource")}
                            </a>
                        </div>
                    </div>

                    {article.summary && (
                        <div
                            className="surface-panel-quiet mb-6 px-5 py-4 text-sm leading-7 text-muted-foreground"
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
                        className="prose prose-neutral dark:prose-invert max-w-none w-full leading-8 text-foreground/90"
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
        </div>
    );
}

export default function NewsDetail() {
    const { t } = useTranslation("news");
    const { id } = useParams();
    const parsedArticleId = Number.parseInt(id ?? "", 10);

    if (!Number.isFinite(parsedArticleId) || parsedArticleId <= 0) {
        return (
            <div className={cn("flex h-full w-full items-center justify-center py-8", CONTENT_GUTTER_X_CLASS)}>
                <div className="text-sm text-muted-foreground">{t("articleNotFound")}</div>
            </div>
        );
    }

    return <ArticleDetailView articleId={parsedArticleId} className="min-h-full" />;
}
