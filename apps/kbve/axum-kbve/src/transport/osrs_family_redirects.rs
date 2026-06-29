//! OSRS item-family 301/308 redirects (member page -> canonical family page).
//!
//! `OSRS_FAMILY_REDIRECTS` is generated at build time by `build.rs` from the
//! committed `osrs_family_redirects.json` (produced by the Python resolver
//! `kbve-osrs-families --redirect-json`). build.rs is the single Rust-side
//! generator; this module just pulls in the generated table.

include!(concat!(env!("OUT_DIR"), "/osrs_family_redirects.rs"));
