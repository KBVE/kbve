//! `kbve::lot` — MC lot/schematic system client.
//!
//! Mirrors the `mc` Postgres schema (packages/data/sql/schema/mc/mc_lot.sql).
//! Calls SECURITY DEFINER `public.proxy_*` RPCs via diesel against the same
//! Postgres pool used by [`crate::wallet::WalletClient`] — both schemas live
//! in the supabase database and lot purchases settle through
//! `wallet.service_debit` under the hood.
//!
//! Enable with the `wallet` Cargo feature (the lot client reuses
//! [`crate::wallet::client`] for connection management).
//!
//! Two surfaces:
//!   - User RPCs (proxy.rs): purchase, queue build/demolish, list vacant /
//!     my-active / my-transitional / viewport, list schematics.
//!   - Service RPCs (service.rs): worker claim batch, mark applied/failed,
//!     admin retry/release/repair, raw get-lot.

pub mod error;
pub mod proxy;
pub mod service;
pub mod types;

pub use error::LotError;
pub use types::*;
