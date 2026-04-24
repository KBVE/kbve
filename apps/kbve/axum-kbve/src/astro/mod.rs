//! Re-exports shared Astro static-file plumbing from `kbve::web::astro` plus
//! kbve-specific middleware (`/isometric` COOP/COEP isolation). Consumers
//! layer both `corp_static_assets` (shared) and `coop_coep_isometric` (local)
//! onto the router that `build_static_router` returns.

pub mod askama;
pub mod isometric;

pub use isometric::coop_coep_isometric;
pub use kbve::web::astro::{StaticConfig, build_static_router, corp_static_assets};
