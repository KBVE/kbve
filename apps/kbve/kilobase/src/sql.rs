use pgrx::prelude::*;

extension_sql!(
    "\
    CREATE TABLE IF NOT EXISTS url_queue (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
    );",
    name = "create_url_queue_table",
    bootstrap
);

extension_sql!(
    "\
    CREATE TABLE IF NOT EXISTS url_archive (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        data TEXT NOT NULL,
        archived_at TIMESTAMPTZ DEFAULT NOW()
    );",
    name = "create_url_archive_table",
    requires = ["create_url_queue_table"]
);