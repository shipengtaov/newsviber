mod db;
pub mod fetchers;

#[tauri::command]
async fn fetch_rss_cmd(url: String) -> Result<Vec<fetchers::rss::ParsedArticle>, String> {
    fetchers::rss::fetch_rss(&url).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_jina_cmd(url: String, api_key: Option<String>) -> Result<fetchers::jina::JinaResponse, String> {
    fetchers::jina::fetch_jina_url(&url, api_key.as_deref()).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().add_migrations("sqlite:getnews.db", db::get_migrations()).build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_rss_cmd, fetch_jina_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
