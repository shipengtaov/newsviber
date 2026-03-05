import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import NewsList from "@/views/NewsList";
import NewsDetail from "@/views/NewsDetail";
import SourceManager from "@/views/SourceManager";
import SourceForm from "@/views/SourceForm";
import GlobalChat from "@/views/GlobalChat";
import CreativeSpace from "@/views/CreativeSpace";
import Settings from "@/views/Settings";
import { useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";

function App() {
  useEffect(() => {
    // Basic startup checks / auto generation hooks could go here.
    // E.g. setInterval to check sources and creative spaces.
    async function backgroundCheck() {
      // Basic skeleton for periodic tasks in frontend
      try {
        await Database.load("sqlite:getnews.db");
        // Auto generation logic goes here for daily/weekly modes.
        // It should track "last_generated_at" locally to avoid spam.
      } catch (err) {
        console.error("BG task err", err);
      }
    }
    backgroundCheck();
    const interval = setInterval(backgroundCheck, 15 * 60 * 1000); // 15 mins
    return () => clearInterval(interval);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<NewsList />} />
          <Route path="/news/:id" element={<NewsDetail />} />
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
