use std::env;
use std::fs;
use std::result::Result;

use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::pooled_connection::bb8::{Pool as Bb8Pool, PooledConnection as Bb8Conn};

pub type Pool = Bb8Pool<AsyncPgConnection>;
pub type PooledConn<'a> = Bb8Conn<'a, AsyncPgConnection>;

fn get_env_var(name: &str) -> Result<String, String> {
    match env::var(name) {
        Ok(value) => Ok(value),
        Err(_) => match env::var(format!("{}_FILE", name)) {
            Ok(file_path) => fs::read_to_string(file_path)
                .map_err(|err| format!("Error reading file for {}: {}", name, err)),
            Err(_) => Err(format!(
                "Environment variable {} or {}_FILE must be set",
                name, name
            )),
        },
    }
}

pub async fn establish_connection_dev() -> Result<AsyncPgConnection, String> {
    establish_connection_generic("DATABASE_URL_DEV").await
}

pub async fn establish_connection_prod() -> Result<AsyncPgConnection, String> {
    establish_connection_generic("DATABASE_URL_PROD").await
}

async fn establish_connection_generic(env_var: &str) -> Result<AsyncPgConnection, String> {
    use diesel_async::AsyncConnection;
    let database_url = get_env_var(env_var)?;
    AsyncPgConnection::establish(&database_url)
        .await
        .map_err(|err| format!("Error connecting to {}: {}", database_url, err))
}

pub async fn establish_connection_pool() -> Result<Pool, String> {
    let database_url = get_env_var("DATABASE_URL_PROD")?;
    let manager = AsyncDieselConnectionManager::<AsyncPgConnection>::new(database_url);
    Bb8Pool::builder()
        .build(manager)
        .await
        .map_err(|e| format!("Failed to create the database connection pool: {e}"))
}
