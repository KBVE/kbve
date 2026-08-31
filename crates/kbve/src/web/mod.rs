//! Shared HTTP/web building blocks used by axum-* services across the monorepo.
//!
//! This module is intentionally opinionated but generic: site-specific
//! concerns (askama template with site name, COOP/COEP for WASM subsites,
//! auth handlers) stay in the consumer service. What lives here is the
//! code that every axum-* site duplicates otherwise — static-file routing,
//! env-driven static config, and generic CORP header layering for static
//! asset paths.

pub mod astro;
