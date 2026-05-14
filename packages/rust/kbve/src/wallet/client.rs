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

async fn build_pool(url: String) -> Result<WalletPool> {
    let manager = AsyncDieselConnectionManager::<AsyncPgConnection>::new(url);
    Pool::builder()
        .max_size(8)
        .build(manager)
        .await
        .map_err(|e| WalletError::Pool(e.to_string()))
}

pub async fn establish_wallet_pool() -> Result<WalletPool> {
    let url = read_env("WALLET_DATABASE_URL")
        .or_else(|_| read_env("DATABASE_URL_PROD"))
        .map_err(|e| WalletError::Pool(format!("missing wallet DATABASE URL: {e}")))?;
    build_pool(url).await
}

async fn establish_readonly_pool() -> Result<Option<WalletPool>> {
    let url = match read_env("WALLET_DATABASE_URL_RO").or_else(|_| read_env("DATABASE_URL_PROD_RO"))
    {
        Ok(u) => u,
        Err(_) => return Ok(None),
    };
    build_pool(url).await.map(Some)
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
    rw: WalletPool,
    ro: WalletPool,
}

impl WalletClient {
    pub fn new(rw: WalletPool, ro: Option<WalletPool>) -> Self {
        let ro = ro.unwrap_or_else(|| rw.clone());
        Self { rw, ro }
    }

    pub async fn from_env() -> Result<Self> {
        let rw = establish_wallet_pool().await?;
        let ro = establish_readonly_pool().await?;
        Ok(Self::new(rw, ro))
    }

    pub fn rw_pool(&self) -> &WalletPool {
        &self.rw
    }

    pub fn ro_pool(&self) -> &WalletPool {
        &self.ro
    }

    pub async fn write(&self) -> Result<WalletConn<'_>> {
        self.rw.get().await.map_err(WalletError::from)
    }

    pub async fn read(&self) -> Result<WalletConn<'_>> {
        self.ro.get().await.map_err(WalletError::from)
    }

    pub async fn conn(&self) -> Result<WalletConn<'_>> {
        self.write().await
    }
}
