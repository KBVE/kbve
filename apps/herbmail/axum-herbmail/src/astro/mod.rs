//! Thin re-export of shared Astro static-file plumbing from the `kbve` crate.
//!
//! `StaticConfig`, `build_static_router`, and `corp_static_assets` live in
//! `kbve::web::astro` so every axum-* service reuses the same ServeDir +
//! precompression + 404 fallback behavior. Layer `corp_static_assets` onto
//! the router at the call site; keep service-specific middleware local.

pub mod askama;

pub use kbve::web::astro::{StaticConfig, build_static_router, corp_static_assets};
