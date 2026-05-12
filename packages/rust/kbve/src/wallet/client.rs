//! `WalletClient` — diesel-pool wrapper that hosts the wallet service ops.
//!
//! The wallet schema's `SECURITY DEFINER` functions need the caller to either
//! be `service_role` (recommended) or come through an authenticated proxy.
//! We support both by using two helpers on the client:
//!
//!   - [`WalletClient::run_service`] runs a closure as the role the connection
//!     pool authenticates as. For service paths this should be `service_role`.
//!   - [`WalletClient::run_as_user`] sets `request.jwt.claims` for the
//!     `public.proxy_wallet_*` functions so `auth.uid()` resolves correctly,
//!     then runs the closure.
//!
//! The actual sync diesel work happens inside `tokio::task::spawn_blocking`
//! so we never block the async runtime.

use std::env;
use std::fs;

use diesel::pg::PgConnection;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel::sql_query;
use diesel::sql_types::Text;
use serde_json::json;
use uuid::Uuid;

use super::error::{Result, WalletError};

pub type WalletPool = Pool<ConnectionManager<PgConnection>>;
pub type WalletConn = PooledConnection<ConnectionManager<PgConnection>>;

/// Build a wallet-dedicated diesel pool.
///
/// Reads `WALLET_DATABASE_URL` (or `WALLET_DATABASE_URL_FILE` for Docker
/// secrets style). Falls back to `DATABASE_URL_PROD` so dev environments keep
/// working without a separate var.
///
/// The login role should be `service_role` so the SECURITY DEFINER chains
/// resolve cleanly. For local docker postgres without that role, use
/// `postgres` (the SQL functions accept superuser fallback).
pub fn establish_wallet_pool() -> Result<WalletPool> {
    let url = read_env("WALLET_DATABASE_URL")
        .or_else(|_| read_env("DATABASE_URL_PROD"))
        .map_err(|e| WalletError::Pool(format!("missing wallet DATABASE URL: {e}")))?;

    let manager = ConnectionManager::<PgConnection>::new(url);
    Pool::builder()
        .max_size(8)
        .build(manager)
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

#[derive(Clone)]
pub struct WalletClient {
    pool: WalletPool,
}

impl WalletClient {
    pub fn new(pool: WalletPool) -> Self {
        Self { pool }
    }

    /// Construct from env vars.
    pub fn from_env() -> Result<Self> {
        Ok(Self::new(establish_wallet_pool()?))
    }

    pub fn pool(&self) -> &WalletPool {
        &self.pool
    }

    /// Run a diesel closure on a worker thread without any per-request session
    /// state. Used by `service_*` paths that already trust the caller (the
    /// connection itself authenticates as `service_role`).
    pub async fn run_service<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut WalletConn) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            f(&mut conn)
        })
        .await?
    }

    /// Run a diesel closure on behalf of an authenticated user.
    ///
    /// Sets `request.jwt.claims` as a session GUC inside the closure's
    /// transaction so the `public.proxy_wallet_*` SECURITY DEFINER functions
    /// see `auth.uid()` correctly. The claim block is reset after the closure
    /// returns regardless of outcome.
    pub async fn run_as_user<F, T>(&self, user_id: Uuid, f: F) -> Result<T>
    where
        F: FnOnce(&mut WalletConn) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            conn.transaction::<T, WalletError, _>(|conn| {
                let claims = json!({
                    "role": "authenticated",
                    "sub": user_id.to_string(),
                });
                sql_query("SELECT set_config('request.jwt.claims', $1, true)")
                    .bind::<Text, _>(claims.to_string())
                    .execute(conn)
                    .map_err(WalletError::from_diesel)?;
                f(conn)
            })
        })
        .await?
    }
}
