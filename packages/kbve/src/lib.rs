#![allow(dead_code)]

//  * Planned : [Code Splitting]

//  * [MODS]
pub mod schema;
pub mod db;
pub mod models;
pub mod utility;
pub mod guild;
pub mod spellbook;
pub mod runes;
pub mod authentication;


//  * [REFACTOR]
pub mod utils;
pub mod routes;

pub use schema::*;
pub use db::*;
pub use models::*;
pub use utility::*;
pub use guild::*;
pub use spellbook::*;
pub use runes::*;
pub use authentication::*;

//  * [REFACTOR]
pub use utils::*;
pub use routes::*;