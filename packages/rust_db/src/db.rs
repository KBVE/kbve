use std::env;
use std::result::Result;
use std::fs;
//  *   [IMPORT]
use diesel::prelude::*;
use diesel::mysql::MysqlConnection;
fn get_env_var(name: &str) -> Result<String, String> {
    match env::var(name) {
        Ok(value) => Ok(value),
        Err(_) => match env::var(format!("{}_FILE", name)) {
            Ok(file_path) => fs::read_to_string(file_path)
                              .map_err(|err| format!("Error reading file for {}: {}", name, err)),
            Err(_) => Err(format!("Environment variable {} or {}_FILE must be set", name, name)),
        },
    }
}
//  *   Dev like an asian fenty lab. Bumpin out fresh precursor S Q L i t t y.
pub fn establish_connection_dev() -> Result<MysqlConnection, String> {
    establish_connection_generic("DATABASE_URL_DEV")
}
//  *   Going to the east side, to hit up my perk connect.
pub fn establish_connection_prod() -> Result<MysqlConnection, String> {
    establish_connection_generic("DATABASE_URL_PROD")
}
//  *   Generic -> Shared Logic
fn establish_connection_generic(env_var: &str) -> Result<MysqlConnection, String> {
    let database_url = get_env_var(env_var)?;
    MysqlConnection::establish(&database_url)
        .map_err(|err| format!("Error connecting to {}: {}", database_url, err))
}
