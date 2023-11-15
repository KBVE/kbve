use std::io::Write;
use std::str::FromStr;

//* [IMPORTS] */

use diesel::prelude::Queryable;
use diesel::backend::Backend;
use diesel::serialize::{self, ToSql, Output};
use diesel::deserialize::{self, FromSql};
use diesel::sql_types::Text;

use serde::{Serialize, Deserialize};
use serde_json::Value as JsonValue;

use chrono::NaiveDateTime;

//* [MODELS] */

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

#[derive(Debug, Clone, PartialEq, FromSqlRow, AsExpression)]
#[sql_type = "Text"]
pub enum UsersRole {
    User,
    Mod,
    Admin,
}

impl<DB: Backend> ToSql<Text, DB> for UsersRole {
    fn to_sql<W: Write>(&self, out: &mut Output<W, DB>) -> serialize::Result {
        match *self {
            UsersRole::User => out.write_all(b"user")?,
            UsersRole::Mod => out.write_all(b"mod")?,
            UsersRole::Admin => out.write_all(b"admin")?,
        }
        Ok(serialize::IsNull::No)
    }
}

impl<DB: Backend> FromSql<Text, DB> for UsersRole
where
    *const str: FromSql<Text, DB>,
{
    fn from_sql(bytes: Option<&DB::RawValue>) -> deserialize::Result<Self> {
        match not_none!(bytes) {
            b"user" => Ok(UsersRole::User),
            b"mod" => Ok(UsersRole::Mod),
            b"admin" => Ok(UsersRole::Admin),
            _ => Err("Unrecognized role".into()),
        }
    }
}
