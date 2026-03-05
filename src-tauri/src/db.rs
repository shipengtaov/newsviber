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
        }
    ]
}
