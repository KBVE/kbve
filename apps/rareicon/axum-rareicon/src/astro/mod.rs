//! Thin re-export of shared Astro static-file plumbing from the `kbve` crate.
//!
//! `StaticConfig`, `build_static_router`, and `corp_static_assets` live in
//! `kbve::web::astro` so every axum-* service can reuse the same ServeDir +
//! precompression + 404 fallback behavior. Keep RareIcon-specific middleware
//! (auth, rate-limit, site-specific headers) local to this crate instead of
//! upstreaming into the shared module.

pub mod askama;

pub use kbve::web::astro::{StaticConfig, build_static_router, corp_static_assets};
