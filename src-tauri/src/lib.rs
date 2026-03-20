mod chat;
mod creative;
mod db;
pub mod fetchers;

#[cfg(not(mobile))]
use tauri::{
    menu::{
        AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
        WINDOW_SUBMENU_ID,
    },
    AppHandle, Runtime,
};
#[cfg(not(mobile))]
use tauri_plugin_opener::OpenerExt;

#[cfg(not(mobile))]
const HELP_MENU_ID_TWITTER: &str = "help.twitter";
#[cfg(not(mobile))]
const HELP_MENU_ID_GITHUB: &str = "help.github";
#[cfg(not(mobile))]
const HELP_MENU_ID_ISSUES: &str = "help.issues";
#[cfg(not(mobile))]
const APP_DISPLAY_NAME: &str = "News Viber";

#[cfg(not(mobile))]
fn help_menu_url(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        HELP_MENU_ID_TWITTER => Some("https://x.com/shipengtao"),
        HELP_MENU_ID_GITHUB => Some("https://github.com/shipengtaov/newsviber"),
        HELP_MENU_ID_ISSUES => Some("https://github.com/shipengtaov/newsviber/issues/new"),
        _ => None,
    }
}

#[cfg(all(test, not(mobile)))]
mod tests {
    use super::{help_menu_url, HELP_MENU_ID_GITHUB, HELP_MENU_ID_ISSUES};

    #[test]
    fn help_menu_urls_match_expected_destinations() {
        assert_eq!(
            help_menu_url(HELP_MENU_ID_GITHUB),
            Some("https://github.com/shipengtaov/newsviber")
        );
        assert_eq!(
            help_menu_url(HELP_MENU_ID_ISSUES),
            Some("https://github.com/shipengtaov/newsviber/issues/new")
        );
        assert_eq!(help_menu_url("help.unknown"), None);
    }
}

#[cfg(not(mobile))]
const HELP_MENU_RIGHT_PADDING: usize = 22;
#[cfg(not(mobile))]
fn padded_help_menu_label(label: &str) -> String {
    format!("{label}{}", " ".repeat(HELP_MENU_RIGHT_PADDING))
}

#[cfg(not(mobile))]
fn build_help_link_items<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> tauri::Result<[MenuItem<R>; 3]> {
    let twitter_item = MenuItem::with_id(
        app_handle,
        HELP_MENU_ID_TWITTER,
        padded_help_menu_label("Open Twitter"),
        true,
        None::<&str>,
    )?;
    let github_item = MenuItem::with_id(
        app_handle,
        HELP_MENU_ID_GITHUB,
        padded_help_menu_label("Open GitHub"),
        true,
        None::<&str>,
    )?;
    let issues_item = MenuItem::with_id(
        app_handle,
        HELP_MENU_ID_ISSUES,
        padded_help_menu_label("Report an Issue"),
        true,
        None::<&str>,
    )?;

    Ok([twitter_item, github_item, issues_item])
}

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
        name: Some(APP_DISPLAY_NAME.to_string()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        icon: app_handle.default_window_icon().cloned(),
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

    let [twitter_item, github_item, issues_item] = build_help_link_items(app_handle)?;
    let help_menu = Submenu::with_id_and_items(
        app_handle,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[&twitter_item, &github_item, &issues_item],
    )?;

    Menu::with_items(
        app_handle,
        &[
            &Submenu::with_items(
                app_handle,
                APP_DISPLAY_NAME,
                true,
                &[
                    &PredefinedMenuItem::about(
                        app_handle,
                        Some("About News Viber"),
                        Some(about_metadata),
                    )?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::services(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::hide(app_handle, Some("Hide News Viber"))?,
                    &PredefinedMenuItem::hide_others(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::quit(app_handle, Some("Quit News Viber"))?,
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

#[cfg(not(any(target_os = "macos", mobile)))]
fn build_default_desktop_menu<R: Runtime>(app_handle: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app_handle)?;
    let [twitter_item, github_item, issues_item] = build_help_link_items(app_handle)?;

    let help_menu = match menu.get(&HELP_SUBMENU_ID).and_then(|item| item.as_submenu().cloned()) {
        Some(help_menu) => help_menu,
        None => {
            let help_menu =
                Submenu::with_id_and_items(app_handle, HELP_SUBMENU_ID, "Help", true, &[])?;
            menu.append(&help_menu)?;
            help_menu
        }
    };

    if !help_menu.items()?.is_empty() {
        help_menu.append(&PredefinedMenuItem::separator(app_handle)?)?;
    }

    help_menu.append_items(&[&twitter_item, &github_item, &issues_item])?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(not(mobile))]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            Ok(())
        })
        .menu(|app_handle| {
            #[cfg(target_os = "macos")]
            {
                build_macos_menu(app_handle)
            }

            #[cfg(not(any(target_os = "macos", mobile)))]
            {
                build_default_desktop_menu(app_handle)
            }

            #[cfg(mobile)]
            {
                tauri::menu::Menu::default(app_handle)
            }
        })
        .on_menu_event(|app, event| {
            #[cfg(not(mobile))]
            if let Some(url) = help_menu_url(event.id().as_ref()) {
                if let Err(error) = app.opener().open_url(url, None::<&str>) {
                    eprintln!("failed to open help menu URL {url}: {error}");
                }
            }
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(&db::migration_database_url(), db::get_migrations())
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
