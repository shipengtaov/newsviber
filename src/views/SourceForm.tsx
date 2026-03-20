import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { getDb } from "@/lib/db";
import { DEFAULT_SOURCE_RETURN_TO, isNewsReturnToPath, resolveSourceReturnTo } from "@/lib/source-navigation";

function parseFetchInterval(value: string): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 60;
}

export default function SourceForm() {
    const { t } = useTranslation("sources");
    const { toast } = useToast();
    const navigate = useNavigate();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const isEditing = !!id;
    const resolvedReturnTo = resolveSourceReturnTo(searchParams.get("returnTo"));
    const returnButtonLabel = isNewsReturnToPath(resolvedReturnTo) ? t("backToNews") : t("backToSources");
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
                toast({ title: t("sourceNotFound"), variant: "destructive" });
                navigate(resolvedReturnTo, { replace: shouldReplaceOnReturn });
            }
        } catch (err: any) {
            console.error(err);
            toast({ title: t("errorLoadingSource"), description: String(err), variant: "destructive" });
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
                toast({ title: t("sourceUpdated") });
            } else {
                await db.execute(
                    "INSERT INTO sources (name, source_type, url, fetch_interval, active) VALUES ($1, $2, $3, $4, 1)",
                    [name, type, url, parseFetchInterval(interval)]
                );
                toast({ title: t("sourceAdded") });
            }
            navigateBack();
        } catch (err: any) {
            toast({ title: t("errorSavingSource"), description: String(err), variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    return (
        <PageShell
            variant="workspace"
            contentClassName="space-y-8"
            header={{
                density: "compact",
                leading: (
                    <Button variant="ghost" onClick={navigateBack}>
                        <ChevronLeft className="h-4 w-4 mr-2" />
                        {returnButtonLabel}
                    </Button>
                ),
                eyebrow: t("eyebrow"),
                title: isEditing ? t("editSource") : t("addNewSource"),
                description: isEditing ? t("editSourceDesc") : t("addSourceDesc"),
                showDescription: false,
                showStats: false,
            }}
        >
            <div className="surface-panel px-5 py-5 md:px-7 md:py-7">
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">{t("sourceName")}</Label>
                            <Input placeholder={t("sourceNamePlaceholder")} value={name} onChange={e => setName(e.target.value)} required className="bg-background/50" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">{t("sourceType")}</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="rss">{t("rssAtomFeed")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-3 md:col-span-2">
                            <Label className="text-sm font-medium">{t("targetUrl")}</Label>
                            <Input placeholder={t("targetUrlPlaceholder")} value={url} onChange={e => setUrl(e.target.value)} required className="bg-background/50" />
                        </div>
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">{t("fetchInterval")}</Label>
                            <Input type="number" min="0" value={interval} inline-block="true" onChange={e => setInterval(e.target.value)} className="bg-background/50" />
                            <p className="text-xs text-muted-foreground">{t("manualRefreshOnly")}</p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
                        <Button type="button" variant="outline" onClick={navigateBack}>{t("cancel", { ns: "common" })}</Button>
                        <Button type="submit" disabled={loading}>
                            {isEditing ? t("saveChanges") : t("addSource")}
                        </Button>
                    </div>
                </form>
            </div>
        </PageShell>
    );
}
