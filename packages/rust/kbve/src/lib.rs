#![allow(dead_code)]

#[cfg(feature = "legacy-sync-db")]
pub mod authentication;
pub mod db;
#[cfg(feature = "legacy-sync-db")]
pub mod guild;
#[cfg(feature = "legacy-sync-db")]
pub mod models;
#[cfg(feature = "legacy-sync-db")]
pub mod runes;
#[cfg(feature = "legacy-sync-db")]
pub mod schema;
pub mod social;
#[cfg(feature = "legacy-sync-db")]
pub mod spellbook;
#[cfg(feature = "legacy-sync-db")]
pub mod utility;

#[cfg(feature = "legacy-sync-db")]
pub mod entity;
#[cfg(feature = "legacy-sync-db")]
pub mod sys;
pub mod utils;

pub mod web;

pub mod markdown;

#[cfg(feature = "wallet")]
pub mod wallet;

// Referral piggybacks on the wallet pool, so it shares the feature gate.
#[cfg(feature = "wallet")]
pub mod referral;

pub use holy;

#[cfg(feature = "legacy-sync-db")]
pub use authentication::*;
pub use db::*;
#[cfg(feature = "legacy-sync-db")]
pub use guild::*;
#[cfg(feature = "legacy-sync-db")]
pub use models::*;
#[cfg(feature = "legacy-sync-db")]
pub use runes::*;
#[cfg(feature = "legacy-sync-db")]
pub use schema::*;
#[cfg(feature = "legacy-sync-db")]
pub use utility::*;

#[cfg(feature = "legacy-sync-db")]
pub use entity::*;
#[cfg(feature = "legacy-sync-db")]
pub use sys::*;
pub use utils::*;
