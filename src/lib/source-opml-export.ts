import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import i18n from "@/lib/i18n";
import { serializeSourcesToOpml } from "@/lib/source-opml";
import { listRssSourcesForExport } from "@/lib/source-service";
import { toast } from "@/hooks/use-toast";

export const EXPORT_SOURCES_OPML_APP_EVENT = "sources:export-opml";

let exportInFlightPromise: Promise<void> | null = null;

function formatExportFileDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function fileNameFromPath(path: string): string {
    return path.split(/[/\\]/).pop() ?? path;
}

async function performExportSourcesToOpml(): Promise<void> {
    try {
        const rssSources = await listRssSourcesForExport();
        if (rssSources.length === 0) {
            toast({ title: i18n.t("sources:exportNoSources") });
            return;
        }

        const output = serializeSourcesToOpml(rssSources.map((source) => ({
            name: source.name,
            url: source.url,
            active: source.active,
            fetchInterval: source.fetch_interval,
        })));

        const exportPath = await save({
            title: i18n.t("sources:exportOpmlDialogTitle"),
            defaultPath: `newsviber-sources-${formatExportFileDate(new Date())}.opml`,
            filters: [{ name: "OPML", extensions: ["opml"] }],
        });

        if (!exportPath) {
            return;
        }

        await writeTextFile(exportPath, output);
        toast({
            title: i18n.t("sources:exportOpmlComplete"),
            description: i18n.t("sources:exportOpmlCompleteDesc", {
                count: rssSources.length,
                fileName: fileNameFromPath(exportPath),
            }),
        });
    } catch (error) {
        toast({
            title: i18n.t("sources:exportOpmlFailed"),
            description: String(error),
            variant: "destructive",
        });
    }
}

export async function exportSourcesToOpml(): Promise<void> {
    if (!exportInFlightPromise) {
        exportInFlightPromise = performExportSourcesToOpml().finally(() => {
            exportInFlightPromise = null;
        });
    }

    await exportInFlightPromise;
}

export async function registerExportSourcesOpmlMenuHandler(
    handler: () => void | Promise<void> = exportSourcesToOpml,
): Promise<UnlistenFn> {
    return listen(EXPORT_SOURCES_OPML_APP_EVENT, () => {
        void handler();
    });
}
