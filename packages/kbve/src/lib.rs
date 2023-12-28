#![allow(dead_code)]

//  * [MODS]
pub mod models;
pub mod schema;
pub mod db;
pub mod utility;



//  * [MODS] -> Extensions

pub mod guild;
pub mod spellbook;
pub mod runes;
pub mod auth;

//  ! [MODS] -> Removal

pub mod wh;
pub mod playerdb;
pub mod dbrms;
pub mod mm;

// *  [USE]
pub use models::*;
pub use schema::*;
pub use db::*;
pub use utility::*;


//  * [USE] -> Extensions
pub use guild::*;
pub use spellbook::*;
pub use runes::*;
pub use auth::*;

//  !   [USE] -> Removal

pub use wh::*;
pub use playerdb::*;
pub use dbrms::*;
pub use mm::*;
