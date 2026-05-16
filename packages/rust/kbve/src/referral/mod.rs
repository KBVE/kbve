//! `kbve::referral` — Phase 2 client for the referral schema.
//!
//! Mirrors the `referral` Postgres schema (packages/data/sql/schema/referral/).
//! Calls `referral.record_click` and `referral.resolve_user_target` via the
//! same diesel-async pool the wallet uses (referral writes credit the wallet
//! in the same transaction, so reusing one pool keeps the connection model
//! simple).
//!
//! The axum referral handler is the only caller in Phase 2. The handler
//! resolves `@<handle>` → user_id via the existing profile service, hashes
//! the visitor IP + subnet with HMAC-SHA256, and calls `record_click` here.
//! The response carries the redirect target URL and whether the click was
//! credited.

pub mod client;
pub mod error;
pub mod types;

pub use client::ReferralClient;
pub use error::ReferralError;
pub use types::*;
