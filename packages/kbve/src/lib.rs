#![allow(dead_code)]

//  * [MODS]
pub mod models;
pub mod schema;
pub mod db;


//  * [MODS] -> Extensions

pub mod guild;
pub mod utility;
pub mod spellbook;
pub mod runes;
pub mod auth;

//  ! [MODS] -> Removal

pub mod harden;
pub mod wh;
pub mod playerdb;
pub mod dbrms;
pub mod mm;

// *  [USE]
pub use models::*;
pub use schema::*;
pub use db::*;


//  * [USE] -> Extensions
pub use guild::*;
pub use utility::*;
pub use spellbook::*;
pub use runes::*;
pub use auth::*;

//  !   [USE] -> Removal

pub use harden::*;
pub use wh::*;
pub use playerdb::*;
pub use dbrms::*;
pub use mm::*;
