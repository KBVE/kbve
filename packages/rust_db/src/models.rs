use std::io::Write;

use diesel::mysql::{Mysql, MysqlValue};
use diesel::prelude::Queryable;
use diesel::serialize::{self, ToSql, Output};
use diesel::deserialize::{self, FromSql};
use diesel::sql_types::Text;

use serde::{Serialize, Deserialize};
use serde_json::Value as SerdeJsonValue;


use chrono::NaiveDateTime;


#[derive(Serialize, Queryable)]
pub struct Profile {
    pub id: u64,
    pub name: Option<String>,
    pub bio: Option<String>,
    pub unsplash: Option<String>,
    pub github: Option<String>,
    pub instagram: Option<String>,
    pub discord: Option<String>,
    pub uuid: Option<i32>,
}


#[derive(Serialize, Deserialize, Queryable)]
pub struct Apikey {
    pub id: u64, // Corresponds to Unsigned<Bigint>
    pub uuid: Option<i32>, // Corresponds to Nullable<Integer>
    pub permissions: Option<SerdeJsonValue>, // Corresponds to Nullable<Json>
    pub keyhash: Option<String>, // Corresponds to Nullable<Varchar>
    pub label: Option<String>, // Corresponds to Nullable<Varchar>
}

#[derive(Serialize, Deserialize, Queryable)]
pub struct User {
    pub id: u64, // Corresponds to Unsigned<Bigint>
    pub username: Option<String>, // Corresponds to Nullable<Varchar>
    pub reputation: Option<i32>, // Corresponds to Nullable<Integer>
    pub exp: Option<i32>, // Corresponds to Nullable<Integer>
    pub role: Option<UsersRole>, // Corresponds to Nullable<UsersRoleEnum>
    pub created_at: NaiveDateTime, // Corresponds to Timestamp
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum UsersRole {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "mod")]
    Mod,
    #[serde(rename = "admin")]
    Admin,
}


impl ToSql<Text, Mysql> for UsersRole {
    fn to_sql(&self, out: &mut Output<'_, '_, Mysql>) -> serialize::Result {
        let value = match *self {
            UsersRole::User => "user",
            UsersRole::Mod => "mod",
            UsersRole::Admin => "admin",
        };
        out.write_all(value.as_bytes())?;
        Ok(serialize::IsNull::No)
    }
}
impl FromSql<Text, Mysql> for UsersRole {
    fn from_sql(bytes: MysqlValue<'_>) -> deserialize::Result<Self> {
        let value_str = std::str::from_utf8(bytes.as_bytes())?;
        match value_str {
            "user" => Ok(UsersRole::User),
            "mod" => Ok(UsersRole::Mod),
            "admin" => Ok(UsersRole::Admin),
            _ => Err("Unrecognized enum variant".into()),
        }
    }
}