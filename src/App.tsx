import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import NewsList from "@/views/NewsList";
import SourceManager from "@/views/SourceManager";
import SourceForm from "@/views/SourceForm";
import GlobalChat from "@/views/GlobalChat";
import CreativeSpace from "@/views/CreativeSpace";
import Settings from "@/views/Settings";
import { useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { dispatchSourceFetchSyncEvent } from "@/lib/source-events";
import { fetchSources, isSourceDueForFetch, type SchedulableSource } from "@/lib/source-fetch";
import { normalizeFetchInterval } from "@/lib/source-utils";

let db: Database | null = null;

async function getDb() {
  if (!db) {
    db = await Database.load("sqlite:getnews.db");
  }

  return db;
}

function App() {
  useEffect(() => {
    let isBackgroundCheckRunning = false;

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
          return;
        }

        const fetchResult = await fetchSources(dueSources);
        if (fetchResult.successCount > 0) {
          dispatchSourceFetchSyncEvent();
        }
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

    return () => window.clearInterval(interval);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<NewsList />} />
          <Route path="/news/:id" element={<NewsList />} />
          <Route path="/sources" element={<SourceManager />} />
          <Route path="/sources/add" element={<SourceForm />} />
          <Route path="/sources/edit/:id" element={<SourceForm />} />
          <Route path="/chat" element={<GlobalChat />} />
          <Route path="/creative" element={<CreativeSpace />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
