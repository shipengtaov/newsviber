use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
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
        }
    ]
}
