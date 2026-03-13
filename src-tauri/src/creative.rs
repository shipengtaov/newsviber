use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection};
use std::collections::HashSet;
use std::fs::create_dir_all;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCreativeProjectCommandInput {
    pub project_id: Option<i64>,
    pub name: String,
    pub prompt: String,
    pub auto_enabled: bool,
    pub auto_interval_minutes: i64,
    pub max_articles_per_card: i64,
    pub source_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCreativeProjectCommandResult {
    pub project_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistCreativeCardCommandInput {
    pub project_id: i64,
    pub title: String,
    pub full_report: String,
    pub generation_mode: String,
    pub used_article_count: i64,
    pub article_ids: Vec<i64>,
    pub checked_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistCreativeCardCommandResult {
    pub card_id: i64,
}

fn normalize_positive_i64(value: i64, fallback: i64) -> i64 {
    if value > 0 {
        value
    } else {
        fallback
    }
}

fn normalize_unique_ids(ids: Vec<i64>) -> Vec<i64> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|id| *id > 0)
        .filter(|id| seen.insert(*id))
        .collect()
}

fn creative_db_url(app: &AppHandle) -> Result<String, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    create_dir_all(&app_config_dir).map_err(|error| error.to_string())?;
    let db_path = app_config_dir.join("getnews.db");

    Ok(format!("sqlite:{}", db_path.to_string_lossy()))
}

async fn connect_creative_db(app: &AppHandle) -> Result<SqliteConnection, String> {
    let db_url = creative_db_url(app)?;
    SqliteConnection::connect(&db_url)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_creative_project_cmd(
    app: AppHandle,
    input: SaveCreativeProjectCommandInput,
) -> Result<SaveCreativeProjectCommandResult, String> {
    let name = input.name.trim();
    let prompt = input.prompt.trim();
    if name.is_empty() || prompt.is_empty() {
        return Err("Project name and prompt are required.".into());
    }

    let auto_interval_minutes = normalize_positive_i64(input.auto_interval_minutes, 60);
    let max_articles_per_card = normalize_positive_i64(input.max_articles_per_card, 12);
    let source_ids = normalize_unique_ids(input.source_ids);

    let mut connection = connect_creative_db(&app).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;

    let result: Result<i64, String> = async {
        let project_id = if let Some(project_id) = input.project_id {
            let query_result = sqlx::query(
                "
                    UPDATE creative_projects
                    SET
                        name = ?,
                        prompt = ?,
                        cycle_mode = 'manual',
                        auto_enabled = ?,
                        auto_interval_minutes = ?,
                        max_articles_per_card = ?
                    WHERE id = ?
                ",
            )
            .bind(name)
            .bind(prompt)
            .bind(if input.auto_enabled { 1_i64 } else { 0_i64 })
            .bind(auto_interval_minutes)
            .bind(max_articles_per_card)
            .bind(project_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;

            if query_result.rows_affected() == 0 {
                return Err("Creative project not found.".into());
            }

            project_id
        } else {
            sqlx::query(
                "
                    INSERT INTO creative_projects
                        (name, prompt, cycle_mode, auto_enabled, auto_interval_minutes, max_articles_per_card)
                    VALUES (?, ?, 'manual', ?, ?, ?)
                ",
            )
            .bind(name)
            .bind(prompt)
            .bind(if input.auto_enabled { 1_i64 } else { 0_i64 })
            .bind(auto_interval_minutes)
            .bind(max_articles_per_card)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .last_insert_rowid()
        };

        sqlx::query("DELETE FROM creative_project_sources WHERE project_id = ?")
            .bind(project_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;

        for source_id in source_ids {
            sqlx::query(
                "INSERT INTO creative_project_sources (project_id, source_id) VALUES (?, ?)",
            )
            .bind(project_id)
            .bind(source_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        }

        Ok(project_id)
    }
    .await;

    match result {
        Ok(project_id) => {
            transaction
                .commit()
                .await
                .map_err(|error| error.to_string())?;
            Ok(SaveCreativeProjectCommandResult { project_id })
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn persist_creative_card_cmd(
    app: AppHandle,
    input: PersistCreativeCardCommandInput,
) -> Result<PersistCreativeCardCommandResult, String> {
    let PersistCreativeCardCommandInput {
        project_id,
        title,
        full_report,
        generation_mode,
        used_article_count,
        article_ids,
        checked_at,
    } = input;

    let generation_mode = generation_mode.trim().to_string();
    if generation_mode != "manual" && generation_mode != "auto" {
        return Err("Invalid generation mode.".into());
    }

    let article_ids = normalize_unique_ids(article_ids);
    if article_ids.is_empty() {
        return Err("At least one article is required to persist a creative card.".into());
    }

    if used_article_count != article_ids.len() as i64 {
        return Err("Used article count does not match the supplied article ids.".into());
    }

    let mut connection = connect_creative_db(&app).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;

    let result: Result<i64, String> = async {
        let card_id = sqlx::query(
            "
                INSERT INTO creative_cards
                    (
                        project_id,
                        title,
                        full_report,
                        generation_mode,
                        used_article_count
                    )
                VALUES (?, ?, ?, ?, ?)
            ",
        )
        .bind(project_id)
        .bind(title.trim())
        .bind(full_report)
        .bind(&generation_mode)
        .bind(article_ids.len() as i64)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .last_insert_rowid();

        for article_id in article_ids {
            sqlx::query("INSERT INTO creative_card_articles (card_id, article_id) VALUES (?, ?)")
                .bind(card_id)
                .bind(article_id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        }

        if let Some(checked_at) = checked_at {
            sqlx::query(
                "
                    UPDATE creative_projects
                    SET
                        last_auto_checked_at = ?,
                        last_auto_generated_at = ?
                    WHERE id = ?
                ",
            )
            .bind(&checked_at)
            .bind(&checked_at)
            .bind(project_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        }

        Ok(card_id)
    }
    .await;

    match result {
        Ok(card_id) => {
            transaction
                .commit()
                .await
                .map_err(|error| error.to_string())?;
            Ok(PersistCreativeCardCommandResult { card_id })
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}
