import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import NewsList from "@/views/NewsList";
import NewsDetail from "@/views/NewsDetail";
import SourceManager from "@/views/SourceManager";
import SourceForm from "@/views/SourceForm";
import GlobalChat from "@/views/GlobalChat";
import Automation from "@/views/Automation";
import Settings from "@/views/Settings";
import { useEffect } from "react";
import { runDueAutomations } from "@/lib/automation-service";
import { getDb } from "@/lib/db";
import { dispatchNewsSyncEvent } from "@/lib/news-events";
import { registerExportSourcesOpmlMenuHandler } from "@/lib/source-opml-export";
import { addSourceFetchSyncListener, dispatchSourceFetchSyncEvent } from "@/lib/source-events";
import { fetchSources, isSourceDueForFetch, type SchedulableSource } from "@/lib/source-fetch";
import { normalizeFetchInterval } from "@/lib/source-utils";
import { AppUpdateProvider } from "@/components/update/AppUpdateProvider";

function App() {
  useEffect(() => {
    let removeMenuListener: (() => void) | null = null;
    let disposed = false;

    void registerExportSourcesOpmlMenuHandler()
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }

        removeMenuListener = unlisten;
      })
      .catch((err) => {
        console.error("Failed to register sources export menu handler", err);
      });

    return () => {
      disposed = true;
      removeMenuListener?.();
    };
  }, []);

  useEffect(() => {
    let isBackgroundCheckRunning = false;
    let isAutomationCheckRunning = false;

    async function runAutomationCheck() {
      if (isAutomationCheckRunning) {
        return;
      }

      isAutomationCheckRunning = true;
      try {
        await runDueAutomations();
      } catch (err) {
        console.error("Automation task err", err);
      } finally {
        isAutomationCheckRunning = false;
      }
    }

    async function backgroundCheck() {
      if (isBackgroundCheckRunning) {
        return;
      }

      isBackgroundCheckRunning = true;

      try {
        const db = await getDb();
        const result: SchedulableSource[] = await db.select(`
          SELECT id, name, source_type, url, active, fetch_interval, last_fetch
          FROM sources
          WHERE active = 1
        `);
        const dueSources = result
          .map((source) => ({
            ...source,
            fetch_interval: normalizeFetchInterval(source.fetch_interval),
            last_fetch: source.last_fetch ?? null,
          }))
          .filter((source) => isSourceDueForFetch(source));

        if (dueSources.length === 0) {
          await runAutomationCheck();
          return;
        }

        const fetchResult = await fetchSources(dueSources);
        if (fetchResult.insertedCount > 0) {
          dispatchSourceFetchSyncEvent();
          dispatchNewsSyncEvent();
        }
        await runAutomationCheck();
      } catch (err) {
        console.error("BG task err", err);
      } finally {
        isBackgroundCheckRunning = false;
      }
    }

    void backgroundCheck();
    const interval = window.setInterval(() => {
      void backgroundCheck();
    }, 60 * 1000);
    const removeSourceSyncListener = addSourceFetchSyncListener(() => {
      void runAutomationCheck();
    });

    return () => {
      window.clearInterval(interval);
      removeSourceSyncListener();
    };
  }, []);

  return (
    <AppUpdateProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<NewsList />} />
            <Route path="/news/:id" element={<NewsDetail />} />
            <Route path="/sources" element={<SourceManager />} />
            <Route path="/sources/add" element={<SourceForm />} />
            <Route path="/sources/edit/:id" element={<SourceForm />} />
            <Route path="/chat" element={<GlobalChat />} />
            <Route path="/chat/:threadId" element={<GlobalChat />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppUpdateProvider>
  );
}

export default App;
