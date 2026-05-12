//! `kbve::wallet` — multi-currency ledger client.
//!
//! Mirrors the `wallet` Postgres schema (packages/data/sql/schema/wallet/).
//! Calls SECURITY DEFINER service RPCs via diesel. All public functions are
//! `async` and wrap the synchronous diesel work in `tokio::task::spawn_blocking`.
//!
//! Enable with the `wallet` Cargo feature.
//!
//! Quick start:
//!
//! ```ignore
//! use kbve::wallet::{WalletClient, CreditRequest, CurrencyKind, SourceKind};
//! use uuid::Uuid;
//!
//! let pool = kbve::wallet::client::establish_wallet_pool();
//! let client = WalletClient::new(pool);
//!
//! let ledger_id = client.credit(CreditRequest {
//!     account_id: account,
//!     currency: CurrencyKind::Khash,
//!     amount: 1000,
//!     source_kind: SourceKind::Reward,
//!     reason: Some("daily_login".into()),
//!     ref_type: None,
//!     ref_id: None,
//!     idempotency_key: Uuid::new_v4(),
//! }).await?;
//! ```

pub mod client;
pub mod error;
pub mod proxy;
pub mod service;
pub mod types;

#[cfg(test)]
mod tests;

pub use client::WalletClient;
pub use error::WalletError;
pub use types::*;
// `service` and `proxy` extend WalletClient via `impl` blocks; their methods
// are reached through the client itself, so there are no free items to
// re-export here.
