mod chat;
mod creative;
mod db;
pub mod fetchers;

#[cfg(target_os = "macos")]
use tauri::{
    menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID},
    AppHandle, Runtime,
};

#[tauri::command]
async fn fetch_rss_cmd(url: String) -> Result<Vec<fetchers::rss::ParsedArticle>, String> {
    fetchers::rss::fetch_rss(&url)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn build_macos_menu<R: Runtime>(app_handle: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app_handle.package_info();
    let config = app_handle.config();
    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };

    let window_menu = Submenu::with_id_and_items(
        app_handle,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app_handle, None)?,
            &PredefinedMenuItem::maximize(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::close_window(app_handle, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(app_handle, HELP_SUBMENU_ID, "Help", true, &[])?;

    Menu::with_items(
        app_handle,
        &[
            &Submenu::with_items(
                app_handle,
                pkg_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(
                        app_handle,
                        Some("About Stream Deck"),
                        Some(about_metadata),
                    )?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::services(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::hide(app_handle, Some("Hide Stream Deck"))?,
                    &PredefinedMenuItem::hide_others(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::quit(app_handle, Some("Quit Stream Deck"))?,
                ],
            )?,
            &Submenu::with_items(
                app_handle,
                "File",
                true,
                &[&PredefinedMenuItem::close_window(app_handle, None)?],
            )?,
            &Submenu::with_items(
                app_handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app_handle, None)?,
                    &PredefinedMenuItem::redo(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::cut(app_handle, None)?,
                    &PredefinedMenuItem::copy(app_handle, None)?,
                    &PredefinedMenuItem::paste(app_handle, None)?,
                    &PredefinedMenuItem::select_all(app_handle, None)?,
                ],
            )?,
            &Submenu::with_items(
                app_handle,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app_handle, None)?],
            )?,
            &window_menu,
            &help_menu,
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|app_handle| {
            #[cfg(target_os = "macos")]
            {
                build_macos_menu(app_handle)
            }

            #[cfg(not(target_os = "macos"))]
            {
                tauri::menu::Menu::default(app_handle)
            }
        })
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:getnews.db", db::get_migrations())
                .build(),
        )
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
