import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { isProbablyHtml, sanitizeArticleHtml } from "@/lib/article-html";

type ArticleContentProps = {
    content: string;
    className?: string;
    emptyPlaceholder?: string;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
};

export function ArticleContent({
    content,
    className,
    emptyPlaceholder = "_No content body available for this article._",
    onClick,
}: ArticleContentProps) {
    const trimmed = content.trim();

    if (!trimmed) {
        return (
            <div className={cn(className)}>
                <ReactMarkdown>{emptyPlaceholder}</ReactMarkdown>
            </div>
        );
    }

    if (isProbablyHtml(trimmed)) {
        return (
            <div
                className={cn(className)}
                dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(trimmed) }}
                onClick={onClick}
            />
        );
    }

    return (
        <div className={cn(className)}>
            <ReactMarkdown>{trimmed}</ReactMarkdown>
        </div>
    );
}
