use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection};
use std::collections::HashSet;
use std::fs::create_dir_all;
use tauri::{AppHandle, Manager};

const DEFAULT_PRESET_DAYS: i64 = 7;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChatThreadScopeCommandInput {
    pub thread_id: Option<i64>,
    pub title: Option<String>,
    pub time_range_mode: String,
    pub preset_days: Option<i64>,
    pub custom_start_date: Option<String>,
    pub custom_end_date: Option<String>,
    pub source_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChatThreadScopeCommandResult {
    pub thread_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistChatMessageCommandInput {
    pub thread_id: i64,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistChatMessageCommandResult {
    pub message_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChatThreadCommandInput {
    pub thread_id: i64,
}

fn normalize_unique_ids(ids: Vec<i64>) -> Vec<i64> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|id| *id > 0)
        .filter(|id| seen.insert(*id))
        .collect()
}

fn chat_db_url(app: &AppHandle) -> Result<String, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    create_dir_all(&app_config_dir).map_err(|error| error.to_string())?;
    let db_path = app_config_dir.join("getnews.db");

    Ok(format!("sqlite:{}", db_path.to_string_lossy()))
}

async fn connect_chat_db(app: &AppHandle) -> Result<SqliteConnection, String> {
    let db_url = chat_db_url(app)?;
    SqliteConnection::connect(&db_url)
        .await
        .map_err(|error| error.to_string())
}

fn normalize_title(title: Option<String>) -> Option<String> {
    title.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_preset_days(value: Option<i64>) -> i64 {
    match value.unwrap_or(DEFAULT_PRESET_DAYS) {
        1 | 3 | 7 | 30 => value.unwrap_or(DEFAULT_PRESET_DAYS),
        _ => DEFAULT_PRESET_DAYS,
    }
}

fn parse_chat_date(value: Option<String>, label: &str) -> Result<String, String> {
    let trimmed = value.unwrap_or_default().trim().to_string();
    if trimmed.is_empty() {
        return Err(format!("{label} is required."));
    }

    NaiveDate::parse_from_str(&trimmed, "%Y-%m-%d")
        .map_err(|_| format!("{label} must use YYYY-MM-DD format."))?;

    Ok(trimmed)
}

fn normalize_scope_values(
    input: &SaveChatThreadScopeCommandInput,
) -> Result<(String, Option<i64>, Option<String>, Option<String>), String> {
    let normalized_mode = input.time_range_mode.trim().to_lowercase();

    if normalized_mode == "custom" {
        let custom_start_date = parse_chat_date(input.custom_start_date.clone(), "Custom start date")?;
        let custom_end_date = parse_chat_date(input.custom_end_date.clone(), "Custom end date")?;
        if custom_start_date > custom_end_date {
            return Err("Custom start date must be on or before the end date.".into());
        }

        return Ok((
            normalized_mode,
            None,
            Some(custom_start_date),
            Some(custom_end_date),
        ));
    }

    Ok((
        "preset".into(),
        Some(normalize_preset_days(input.preset_days)),
        None,
        None,
    ))
}

#[tauri::command]
pub async fn save_chat_thread_scope_cmd(
    app: AppHandle,
    input: SaveChatThreadScopeCommandInput,
) -> Result<SaveChatThreadScopeCommandResult, String> {
    let normalized_title = normalize_title(input.title.clone());
    let (time_range_mode, preset_days, custom_start_date, custom_end_date) =
        normalize_scope_values(&input)?;
    let source_ids = normalize_unique_ids(input.source_ids);

    let mut connection = connect_chat_db(&app).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;

    let result: Result<i64, String> = async {
        let thread_id = if let Some(thread_id) = input.thread_id {
            let query_result = sqlx::query(
                "
                    UPDATE chat_threads
                    SET
                        title = COALESCE(NULLIF(?, ''), title),
                        time_range_mode = ?,
                        preset_days = ?,
                        custom_start_date = ?,
                        custom_end_date = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ",
            )
            .bind(normalized_title.clone().unwrap_or_default())
            .bind(&time_range_mode)
            .bind(preset_days)
            .bind(custom_start_date.clone())
            .bind(custom_end_date.clone())
            .bind(thread_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;

            if query_result.rows_affected() == 0 {
                return Err("Chat thread not found.".into());
            }

            thread_id
        } else {
            let title = normalized_title.ok_or_else(|| "Chat thread title is required.".to_string())?;

            sqlx::query(
                "
                    INSERT INTO chat_threads
                        (title, time_range_mode, preset_days, custom_start_date, custom_end_date)
                    VALUES (?, ?, ?, ?, ?)
                ",
            )
            .bind(title)
            .bind(&time_range_mode)
            .bind(preset_days)
            .bind(custom_start_date.clone())
            .bind(custom_end_date.clone())
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .last_insert_rowid()
        };

        sqlx::query("DELETE FROM chat_thread_sources WHERE thread_id = ?")
            .bind(thread_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;

        for source_id in source_ids {
            sqlx::query("INSERT INTO chat_thread_sources (thread_id, source_id) VALUES (?, ?)")
                .bind(thread_id)
                .bind(source_id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        }

        Ok(thread_id)
    }
    .await;

    match result {
        Ok(thread_id) => {
            transaction
                .commit()
                .await
                .map_err(|error| error.to_string())?;
            Ok(SaveChatThreadScopeCommandResult { thread_id })
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn persist_chat_message_cmd(
    app: AppHandle,
    input: PersistChatMessageCommandInput,
) -> Result<PersistChatMessageCommandResult, String> {
    let role = input.role.trim().to_lowercase();
    if role != "user" && role != "assistant" {
        return Err("Invalid chat message role.".into());
    }

    let content = input.content.trim();
    if content.is_empty() {
        return Err("Chat message content is required.".into());
    }

    let mut connection = connect_chat_db(&app).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;

    let result: Result<i64, String> = async {
        let query_result = sqlx::query("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(input.thread_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;

        if query_result.rows_affected() == 0 {
            return Err("Chat thread not found.".into());
        }

        let message_id = sqlx::query(
            "
                INSERT INTO chat_messages (thread_id, role, content)
                VALUES (?, ?, ?)
            ",
        )
        .bind(input.thread_id)
        .bind(role)
        .bind(content)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .last_insert_rowid();

        Ok(message_id)
    }
    .await;

    match result {
        Ok(message_id) => {
            transaction
                .commit()
                .await
                .map_err(|error| error.to_string())?;
            Ok(PersistChatMessageCommandResult { message_id })
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn delete_chat_thread_cmd(
    app: AppHandle,
    input: DeleteChatThreadCommandInput,
) -> Result<(), String> {
    let mut connection = connect_chat_db(&app).await?;
    let query_result = sqlx::query("DELETE FROM chat_threads WHERE id = ?")
        .bind(input.thread_id)
        .execute(&mut connection)
        .await
        .map_err(|error| error.to_string())?;

    if query_result.rows_affected() == 0 {
        return Err("Chat thread not found.".into());
    }

    Ok(())
}
