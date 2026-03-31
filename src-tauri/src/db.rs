use std::fs::create_dir_all;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_FILE_NAME: &str = "newsviber.db";

pub fn app_database_url<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    create_dir_all(&app_config_dir).map_err(|error| error.to_string())?;
    let db_path = app_config_dir.join(DATABASE_FILE_NAME);

    Ok(format!("sqlite:{}", db_path.to_string_lossy()))
}

pub fn migration_database_url() -> String {
    format!("sqlite:{DATABASE_FILE_NAME}")
}

pub fn get_migrations() -> Vec<Migration> {
    vec![
        // Never edit an already-applied migration in place. sqlx hashes the full SQL string.
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    source_type TEXT NOT NULL, /* 'rss', 'jina_url', 'jina_search', 'twitter', 'custom' */
                    url TEXT NOT NULL,
                    config TEXT, /* JSON config */
                    fetch_interval INTEGER NOT NULL DEFAULT 60, /* minutes */
                    last_fetch DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS articles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id INTEGER NOT NULL,
                    guid TEXT NOT NULL UNIQUE, /* url or rss guid */
                    title TEXT NOT NULL,
                    content TEXT,
                    summary TEXT,
                    author TEXT,
                    published_at DATETIME,
                    is_read BOOLEAN NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
                    title, content, summary, content='articles', content_rowid='id'
                );

                CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
                    INSERT INTO articles_fts(rowid, title, content, summary) VALUES (new.id, new.title, new.content, new.summary);
                END;
                CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
                    INSERT INTO articles_fts(articles_fts, rowid, title, content, summary) VALUES('delete', old.id, old.title, old.content, old.summary);
                END;
                CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
                    INSERT INTO articles_fts(articles_fts, rowid, title, content, summary) VALUES('delete', old.id, old.title, old.content, old.summary);
                    INSERT INTO articles_fts(rowid, title, content, summary) VALUES (new.id, new.title, new.content, new.summary);
                END;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_creative_space",
            sql: "
                CREATE TABLE IF NOT EXISTS creative_projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    cycle_mode TEXT NOT NULL, /* 'daily', 'weekly', 'manual' */
                    filter_source_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS creative_cards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    signals TEXT,
                    interpretation TEXT,
                    ideas TEXT,
                    counterpoints TEXT,
                    next_actions TEXT,
                    full_report TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(project_id) REFERENCES creative_projects(id) ON DELETE CASCADE
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_active_to_sources",
            sql: "
                ALTER TABLE sources ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "extend_creative_projects_and_card_sources",
            sql: "
                ALTER TABLE creative_projects ADD COLUMN auto_enabled BOOLEAN NOT NULL DEFAULT 0;
                ALTER TABLE creative_projects ADD COLUMN auto_interval_minutes INTEGER NOT NULL DEFAULT 60;
                ALTER TABLE creative_projects ADD COLUMN max_articles_per_card INTEGER NOT NULL DEFAULT 12;
                ALTER TABLE creative_projects ADD COLUMN last_auto_checked_at DATETIME;
                ALTER TABLE creative_projects ADD COLUMN last_auto_generated_at DATETIME;

                CREATE TABLE IF NOT EXISTS creative_project_sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    source_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(project_id) REFERENCES creative_projects(id) ON DELETE CASCADE,
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_project_sources_unique
                    ON creative_project_sources(project_id, source_id);
                CREATE INDEX IF NOT EXISTS idx_creative_project_sources_project
                    ON creative_project_sources(project_id);

                ALTER TABLE creative_cards ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'manual';
                ALTER TABLE creative_cards ADD COLUMN used_article_count INTEGER NOT NULL DEFAULT 0;

                CREATE TABLE IF NOT EXISTS creative_card_articles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id INTEGER NOT NULL,
                    article_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(card_id) REFERENCES creative_cards(id) ON DELETE CASCADE,
                    FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_card_articles_unique
                    ON creative_card_articles(card_id, article_id);
                CREATE INDEX IF NOT EXISTS idx_creative_card_articles_article
                    ON creative_card_articles(article_id);
                CREATE INDEX IF NOT EXISTS idx_creative_cards_project_created
                    ON creative_cards(project_id, created_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_global_chat_threads",
            sql: "
                CREATE TABLE IF NOT EXISTS chat_threads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    time_range_mode TEXT NOT NULL DEFAULT 'preset',
                    preset_days INTEGER,
                    custom_start_date TEXT,
                    custom_end_date TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS chat_thread_sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id INTEGER NOT NULL,
                    source_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id INTEGER NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_chat_threads_updated_at
                    ON chat_threads(updated_at DESC);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_sources_unique
                    ON chat_thread_sources(thread_id, source_id);
                CREATE INDEX IF NOT EXISTS idx_chat_thread_sources_thread
                    ON chat_thread_sources(thread_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
                    ON chat_messages(thread_id, created_at, id);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "simplify_creative_cards_markdown_storage",
            sql: "
                PRAGMA foreign_keys=OFF;

                DROP INDEX IF EXISTS idx_creative_cards_project_created;
                DROP INDEX IF EXISTS idx_creative_card_articles_unique;
                DROP INDEX IF EXISTS idx_creative_card_articles_article;

                ALTER TABLE creative_cards RENAME TO creative_cards_old;
                ALTER TABLE creative_card_articles RENAME TO creative_card_articles_old;

                CREATE TABLE creative_cards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    full_report TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    generation_mode TEXT NOT NULL DEFAULT 'manual',
                    used_article_count INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(project_id) REFERENCES creative_projects(id) ON DELETE CASCADE
                );

                INSERT INTO creative_cards (
                    id,
                    project_id,
                    title,
                    full_report,
                    created_at,
                    generation_mode,
                    used_article_count
                )
                SELECT
                    id,
                    project_id,
                    title,
                    full_report,
                    created_at,
                    generation_mode,
                    used_article_count
                FROM creative_cards_old;

                CREATE TABLE creative_card_articles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id INTEGER NOT NULL,
                    article_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(card_id) REFERENCES creative_cards(id) ON DELETE CASCADE,
                    FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
                );

                INSERT INTO creative_card_articles (
                    id,
                    card_id,
                    article_id,
                    created_at
                )
                SELECT
                    id,
                    card_id,
                    article_id,
                    created_at
                FROM creative_card_articles_old;

                DROP TABLE creative_card_articles_old;
                DROP TABLE creative_cards_old;

                CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_card_articles_unique
                    ON creative_card_articles(card_id, article_id);
                CREATE INDEX IF NOT EXISTS idx_creative_card_articles_article
                    ON creative_card_articles(article_id);
                CREATE INDEX IF NOT EXISTS idx_creative_cards_project_created
                    ON creative_cards(project_id, created_at DESC);

                PRAGMA foreign_keys=ON;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_creative_card_read_state",
            sql: "
                ALTER TABLE creative_cards ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0;
                UPDATE creative_cards SET is_read = 1;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "remove_jina_and_twitter_sources",
            sql: "
                DELETE FROM sources
                WHERE source_type IN ('jina_url', 'twitter');
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_app_settings",
            sql: "
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_min_articles_per_card",
            sql: "
                ALTER TABLE creative_projects ADD COLUMN min_articles_per_card INTEGER NOT NULL DEFAULT 1;
                UPDATE creative_projects SET min_articles_per_card = 1;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_creative_project_web_search_enabled",
            sql: "
                ALTER TABLE creative_projects ADD COLUMN web_search_enabled BOOLEAN NOT NULL DEFAULT 0;
                UPDATE creative_projects SET web_search_enabled = 0;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_creative_card_favorite_state",
            sql: "
                ALTER TABLE creative_cards ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0;
            ",
            kind: MigrationKind::Up,
        }
    ]
}
