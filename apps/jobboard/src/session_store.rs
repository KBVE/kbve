use crate::db::Pg;
use async_trait::async_trait;
use std::collections::HashMap;
use tokio_postgres::error::SqlState;
use tower_sessions::session::{Id, Record};
use tower_sessions::session_store::{Error, Result, SessionStore};

#[derive(Clone)]
pub struct PgSessionStore {
    db: Pg,
}

impl std::fmt::Debug for PgSessionStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PgSessionStore")
    }
}

impl PgSessionStore {
    pub fn new(db: Pg) -> Self {
        Self { db }
    }
}

fn backend(e: impl std::fmt::Display) -> Error {
    Error::Backend(e.to_string())
}

fn now_unix() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn encode_data(record: &Record) -> Result<serde_json::Value> {
    serde_json::to_value(&record.data).map_err(|e| Error::Encode(e.to_string()))
}

#[async_trait]
impl SessionStore for PgSessionStore {
    async fn create(&self, record: &mut Record) -> Result<()> {
        let conn = self.db.write().await.map_err(backend)?;
        loop {
            let data = encode_data(record)?;
            let expiry = record.expiry_date.unix_timestamp();
            let res = conn
                .execute(
                    "INSERT INTO jobboard.sessions (id, data, expiry) VALUES ($1, $2, $3)",
                    &[&record.id.to_string(), &data, &expiry],
                )
                .await;
            match res {
                Ok(_) => return Ok(()),
                Err(e) if e.code() == Some(&SqlState::UNIQUE_VIOLATION) => {
                    record.id = Id(uuid::Uuid::new_v4().as_u128() as i128);
                    continue;
                }
                Err(e) => return Err(backend(e)),
            }
        }
    }

    async fn save(&self, record: &Record) -> Result<()> {
        let conn = self.db.write().await.map_err(backend)?;
        let data = encode_data(record)?;
        let expiry = record.expiry_date.unix_timestamp();
        conn.execute(
            "INSERT INTO jobboard.sessions (id, data, expiry) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, expiry = EXCLUDED.expiry",
            &[&record.id.to_string(), &data, &expiry],
        )
        .await
        .map_err(backend)?;
        Ok(())
    }

    async fn load(&self, id: &Id) -> Result<Option<Record>> {
        let conn = self.db.read().await.map_err(backend)?;
        let row = conn
            .query_opt(
                "SELECT data, expiry FROM jobboard.sessions WHERE id = $1 AND expiry > $2",
                &[&id.to_string(), &now_unix()],
            )
            .await
            .map_err(backend)?;
        match row {
            Some(row) => {
                let data: serde_json::Value = row.get(0);
                let expiry: i64 = row.get(1);
                let data: HashMap<String, serde_json::Value> =
                    serde_json::from_value(data).map_err(|e| Error::Decode(e.to_string()))?;
                let expiry_date = time::OffsetDateTime::from_unix_timestamp(expiry)
                    .map_err(|e| Error::Decode(e.to_string()))?;
                Ok(Some(Record {
                    id: *id,
                    data,
                    expiry_date,
                }))
            }
            None => Ok(None),
        }
    }

    async fn delete(&self, id: &Id) -> Result<()> {
        let conn = self.db.write().await.map_err(backend)?;
        conn.execute(
            "DELETE FROM jobboard.sessions WHERE id = $1",
            &[&id.to_string()],
        )
        .await
        .map_err(backend)?;
        Ok(())
    }
}
