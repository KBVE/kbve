use diesel::pg::PgConnection;
use diesel::prelude::*;
use diesel::r2d2::{self, ConnectionManager};
use std::env;
use std::fs;
use std::result::Result;

pub type Pool = r2d2::Pool<ConnectionManager<PgConnection>>;

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

pub fn establish_connection_dev() -> Result<PgConnection, String> {
    establish_connection_generic("DATABASE_URL_DEV")
}
pub fn establish_connection_prod() -> Result<PgConnection, String> {
    establish_connection_generic("DATABASE_URL_PROD")
}

fn establish_connection_generic(env_var: &str) -> Result<PgConnection, String> {
    let database_url = get_env_var(env_var)?;
    PgConnection::establish(&database_url)
        .map_err(|err| format!("Error connecting to {}: {}", database_url, err))
}

pub fn establish_connection_pool() -> Pool {
    let database_url =
        get_env_var("DATABASE_URL_PROD").expect("DATABASE_URL_PROD must be set for production");

    let manager = ConnectionManager::<PgConnection>::new(database_url);

    r2d2::Pool::builder()
        .build(manager)
        .expect("Failed to create the database connection pool")
}
