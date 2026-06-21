//! Supabase JWT verification + LRU cache.
//!
//! The implementation now lives in the shared `jedi` crate so the axum gateway
//! and the arpg game server share one verifier + cache (and one global
//! singleton). This module re-exports it to keep the existing
//! `crate::auth::jwt_cache::*` call sites unchanged.

pub use jedi::jwt_cache::{JwtCacheError, TokenInfo, get_jwt_cache, init_jwt_cache, staff_perm};
