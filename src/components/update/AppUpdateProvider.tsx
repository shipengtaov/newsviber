import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatUtcDateTime } from "@/lib/time";
import { APP_VERSION, getAppVersion } from "@/lib/version";

type AppUpdateMetadata = {
    body?: string;
    currentVersion: string;
    date?: string;
    version: string;
};

type AppUpdateContextValue = {
    checkForUpdates: (options?: { silent?: boolean }) => Promise<boolean>;
    currentVersion: string;
    downloadProgress: {
        contentLength: number | null;
        downloadedBytes: number;
    };
    hasPendingUpdate: boolean;
    isChecking: boolean;
    isInstalling: boolean;
    isRestartReady: boolean;
    lastCheckError: string | null;
    openUpdateDialog: () => void;
    restartToFinishUpdate: () => Promise<void>;
    update: AppUpdateMetadata | null;
};

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

function closePendingUpdate(update: Update | null): void {
    if (!update) {
        return;
    }

    void update.close().catch((error) => {
        console.error("Failed to dispose pending updater handle:", error);
    });
}

function toUpdateMetadata(update: Update): AppUpdateMetadata {
    return {
        body: update.body,
        currentVersion: update.currentVersion,
        date: update.date,
        version: update.version,
    };
}

function formatDownloadProgress(downloadedBytes: number, contentLength: number | null, fallback: string): string {
    const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

    function formatSize(value: number): string {
        if (value >= 1024 * 1024) {
            return `${formatter.format(value / (1024 * 1024))} MB`;
        }

        if (value >= 1024) {
            return `${formatter.format(value / 1024)} KB`;
        }

        return `${formatter.format(value)} B`;
    }

    if (!downloadedBytes && !contentLength) {
        return fallback;
    }

    if (!contentLength) {
        return formatSize(downloadedBytes);
    }

    return `${formatSize(downloadedBytes)} / ${formatSize(contentLength)}`;
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation("settings");
    const { toast } = useToast();
    const [currentVersion, setCurrentVersion] = useState(APP_VERSION);
    const [update, setUpdate] = useState<AppUpdateMetadata | null>(null);
    const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [isRestartReady, setIsRestartReady] = useState(false);
    const [downloadedBytes, setDownloadedBytes] = useState(0);
    const [contentLength, setContentLength] = useState<number | null>(null);
    const [lastCheckError, setLastCheckError] = useState<string | null>(null);
    const pendingCheckRef = useRef<Promise<boolean> | null>(null);
    const hasRunStartupCheckRef = useRef(false);

    useEffect(() => {
        let cancelled = false;

        void getAppVersion().then((version) => {
            if (!cancelled) {
                setCurrentVersion(version);
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => () => {
        closePendingUpdate(pendingUpdate);
    }, [pendingUpdate]);

    async function restartToFinishUpdate(): Promise<void> {
        try {
            await relaunch();
        } catch (error) {
            toast({
                title: t("updateRestartFailed"),
                description: String(error),
                variant: "destructive",
            });
        }
    }

    async function checkForUpdates(options: { silent?: boolean } = {}): Promise<boolean> {
        if (pendingCheckRef.current) {
            return pendingCheckRef.current;
        }

        const { silent = false } = options;

        if (!isTauri()) {
            if (!silent) {
                toast({
                    title: t("updatesUnavailable"),
                    description: t("updatesUnavailableDesc"),
                });
            }
            return false;
        }

        const pendingCheck = (async () => {
            setIsChecking(true);
            setLastCheckError(null);

            try {
                const availableUpdate = await check();

                if (!availableUpdate) {
                    if (!silent) {
                        toast({
                            title: t("upToDate"),
                            description: t("upToDateDesc", { version: currentVersion }),
                        });
                    }
                    return false;
                }

                setPendingUpdate(availableUpdate);
                setUpdate(toUpdateMetadata(availableUpdate));
                setIsRestartReady(false);
                setDownloadedBytes(0);
                setContentLength(null);
                setDialogOpen(true);
                return true;
            } catch (error) {
                const message = String(error);
                setLastCheckError(message);

                if (!silent) {
                    toast({
                        title: t("updateCheckFailed"),
                        description: message,
                        variant: "destructive",
                    });
                }

                return false;
            } finally {
                setIsChecking(false);
                pendingCheckRef.current = null;
            }
        })();

        pendingCheckRef.current = pendingCheck;
        return pendingCheck;
    }

    async function installUpdate(): Promise<void> {
        if (!pendingUpdate || isInstalling) {
            return;
        }

        setIsInstalling(true);
        setLastCheckError(null);
        setDownloadedBytes(0);
        setContentLength(null);

        try {
            await pendingUpdate.downloadAndInstall((event) => {
                switch (event.event) {
                    case "Started":
                        setContentLength(event.data.contentLength ?? null);
                        break;
                    case "Progress":
                        setDownloadedBytes((value) => value + event.data.chunkLength);
                        break;
                    case "Finished":
                        break;
                }
            });

            setPendingUpdate(null);
            setIsRestartReady(true);
            setDialogOpen(true);
            toast({
                title: t("restartToFinish"),
                description: t("restartToFinishDesc"),
            });
        } catch (error) {
            const message = String(error);
            setLastCheckError(message);
            toast({
                title: t("updateInstallFailed"),
                description: message,
                variant: "destructive",
            });
        } finally {
            setIsInstalling(false);
        }
    }

    useEffect(() => {
        if (hasRunStartupCheckRef.current) {
            return;
        }

        hasRunStartupCheckRef.current = true;
        void checkForUpdates({ silent: true });
    }, []);

    const progressLabel = formatDownloadProgress(
        downloadedBytes,
        contentLength,
        t("downloadPreparing"),
    );
    const progressPercent = contentLength && contentLength > 0
        ? Math.min(100, (downloadedBytes / contentLength) * 100)
        : 0;

    const value: AppUpdateContextValue = {
        checkForUpdates,
        currentVersion,
        downloadProgress: {
            contentLength,
            downloadedBytes,
        },
        hasPendingUpdate: pendingUpdate !== null,
        isChecking,
        isInstalling,
        isRestartReady,
        lastCheckError,
        openUpdateDialog: () => {
            if (update) {
                setDialogOpen(true);
            }
        },
        restartToFinishUpdate,
        update,
    };

    return (
        <AppUpdateContext.Provider value={value}>
            {children}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {isRestartReady ? t("restartToFinish") : t("updateDialogTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {isRestartReady ? t("restartToFinishDesc") : t("updateDialogDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    {update ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 rounded-[1.25rem] border border-border/70 bg-muted/35 p-4 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-medium text-foreground">{t("currentVersion")}</span>
                                    <span className="text-muted-foreground">v{update.currentVersion}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-medium text-foreground">{t("updateVersionLabel")}</span>
                                    <span className="text-muted-foreground">v{update.version}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-medium text-foreground">{t("updatePublishedLabel")}</span>
                                    <span className="text-muted-foreground">
                                        {formatUtcDateTime(update.date, t("unknown", { ns: "common" }))}
                                    </span>
                                </div>
                            </div>

                            {update.body ? (
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-foreground">{t("updateReleaseNotes")}</div>
                                    <div className="max-h-56 overflow-y-auto rounded-[1.25rem] border border-border/70 bg-muted/25 p-4 text-sm text-muted-foreground whitespace-pre-wrap">
                                        {update.body}
                                    </div>
                                </div>
                            ) : null}

                            {isInstalling ? (
                                <div className="space-y-3 rounded-[1.25rem] border border-border/70 bg-muted/25 p-4">
                                    <div className="text-sm font-medium text-foreground">{t("installingUpdate")}</div>
                                    <div className="text-sm text-muted-foreground">{progressLabel}</div>
                                    <div className="h-2 overflow-hidden rounded-full bg-border/70">
                                        <div
                                            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>
                                </div>
                            ) : null}

                            {lastCheckError ? (
                                <div className="rounded-[1rem] border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                                    {lastCheckError}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                            {t("close", { ns: "common" })}
                        </Button>
                        {isRestartReady ? (
                            <Button type="button" onClick={() => {
                                void restartToFinishUpdate();
                            }}>
                                {t("restartNow")}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={() => {
                                    void installUpdate();
                                }}
                                disabled={!pendingUpdate || isInstalling}
                            >
                                {isInstalling ? t("installingUpdate") : t("installUpdate")}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppUpdateContext.Provider>
    );
}

export function useAppUpdate(): AppUpdateContextValue {
    const context = useContext(AppUpdateContext);

    if (!context) {
        throw new Error("useAppUpdate must be used within an AppUpdateProvider.");
    }

    return context;
}
