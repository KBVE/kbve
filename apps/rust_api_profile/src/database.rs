use std::env;
use std::result::Result;
use std::fs;
//  ?   The statement is to import the `env` module from the Rust library!
//  !   [ATLAS] -> Prompt{$token1} [/ATLAS]
//  *   External Imports
//  *   Just straight raw VW Diesel Gate. - Pre Lube and * for glob import. GLOBBIN SO MUCH. POLLUTING DE NAMESPACE.
use diesel::prelude::*; // Queryable
use diesel::mysql::MysqlConnection;
//  *   Grabbin dat sweet sweet victoria das secret.
use dotenvy::dotenv;
//  TODO: [1] HOLD UP Docker in a Swarm would pass the environment as a _FILE? Would it grab it from the /run/secrets folder?
//  TODO: [1] We setting up that real environmental variable.
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
