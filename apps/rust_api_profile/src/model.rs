use diesel::prelude::Queryable;
use rocket::serde::Serialize;

#[derive(Serialize, Queryable)]
#[serde(crate = "rocket::serde")]
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