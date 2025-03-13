use pgrx::prelude::*;

extension_sql!(
    "\
    DROP TABLE IF EXISTS url_queue CASCADE;

    CREATE TABLE IF NOT EXISTS url_queue (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'pending', 'processing', 'completed', 'error')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
    );",
    name = "create_url_queue_table",
    bootstrap
);

extension_sql!(
    "\
    DROP TABLE IF EXISTS url_archive CASCADE;

    CREATE TABLE IF NOT EXISTS url_archive (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        data TEXT NOT NULL,
        archived_at TIMESTAMPTZ DEFAULT NOW()
    );",
    name = "create_url_archive_table",
    requires = ["create_url_queue_table"]
);