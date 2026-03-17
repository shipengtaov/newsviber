mod chat;
mod creative;
mod db;
pub mod fetchers;

#[tauri::command]
async fn fetch_rss_cmd(url: String) -> Result<Vec<fetchers::rss::ParsedArticle>, String> {
    fetchers::rss::fetch_rss(&url).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().add_migrations("sqlite:getnews.db", db::get_migrations()).build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_rss_cmd,
            chat::save_chat_thread_scope_cmd,
            chat::persist_chat_message_cmd,
            chat::delete_chat_thread_cmd,
            creative::save_creative_project_cmd,
            creative::persist_creative_card_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
