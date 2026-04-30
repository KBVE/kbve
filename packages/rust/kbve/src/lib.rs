#![allow(dead_code)]

//  * Planned : [Code Splitting]

//  * [MODS]
pub mod authentication;
pub mod db;
pub mod guild;
pub mod models;
pub mod runes;
pub mod schema;
pub mod social;
pub mod spellbook;
pub mod utility;

//  * [REFACTOR]
pub mod entity;
pub mod sys;
pub mod utils;

//  * [WEB] — shared HTTP/web building blocks for axum-* services.
pub mod web;

//  * [MARKDOWN] — safe CommonMark + GFM renderer with ammonia allowlist.
pub mod markdown;

// Re-export the `holy` proc-macro crate so downstream axum-* services
// can pull derive(Sanitize) / derive(Getters) etc. through `kbve::holy::*`
// without taking a second top-level dependency. Single boundary = one
// place to bump.
pub use holy;

pub use authentication::*;
pub use db::*;
pub use guild::*;
pub use models::*;
pub use runes::*;
pub use schema::*;
pub use utility::*;

//  * [REFACTOR]
pub use entity::*;
pub use sys::*;
pub use utils::*;
