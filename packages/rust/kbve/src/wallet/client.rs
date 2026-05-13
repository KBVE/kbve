use std::env;
use std::fs;

use diesel::sql_query;
use diesel::sql_types::Text;
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::pooled_connection::bb8::{Pool, PooledConnection};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde_json::json;
use uuid::Uuid;

use super::error::{Result, WalletError};

pub type WalletPool = Pool<AsyncPgConnection>;
pub type WalletConn<'a> = PooledConnection<'a, AsyncPgConnection>;

pub async fn establish_wallet_pool() -> Result<WalletPool> {
    let url = read_env("WALLET_DATABASE_URL")
        .or_else(|_| read_env("DATABASE_URL_PROD"))
        .map_err(|e| WalletError::Pool(format!("missing wallet DATABASE URL: {e}")))?;

    let manager = AsyncDieselConnectionManager::<AsyncPgConnection>::new(url);
    Pool::builder()
        .max_size(8)
        .build(manager)
        .await
        .map_err(|e| WalletError::Pool(e.to_string()))
}

fn read_env(name: &str) -> std::result::Result<String, String> {
    match env::var(name) {
        Ok(v) => Ok(v),
        Err(_) => {
            let file = env::var(format!("{name}_FILE")).map_err(|_| format!("{name} not set"))?;
            fs::read_to_string(file).map_err(|e| e.to_string())
        }
    }
}

pub async fn set_user_claims(conn: &mut AsyncPgConnection, user_id: Uuid) -> Result<()> {
    let claims = json!({
        "role": "authenticated",
        "sub": user_id.to_string(),
    });
    sql_query("SELECT set_config('request.jwt.claims', $1, true)")
        .bind::<Text, _>(claims.to_string())
        .execute(conn)
        .await
        .map_err(WalletError::from_diesel)?;
    Ok(())
}

#[derive(Clone)]
pub struct WalletClient {
    pool: WalletPool,
}

impl WalletClient {
    pub fn new(pool: WalletPool) -> Self {
        Self { pool }
    }

    pub async fn from_env() -> Result<Self> {
        Ok(Self::new(establish_wallet_pool().await?))
    }

    pub fn pool(&self) -> &WalletPool {
        &self.pool
    }

    pub async fn conn(&self) -> Result<WalletConn<'_>> {
        self.pool.get().await.map_err(WalletError::from)
    }
}
