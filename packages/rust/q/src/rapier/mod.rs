//! Rapier2d integration helpers.
//!
//! Split per side so the same crate can ship a thin query/render-only
//! flavor for the client and a full physics-stepping flavor for the server.

#[cfg(feature = "rapier2d-client")]
pub mod client;

#[cfg(feature = "rapier2d-server")]
pub mod server;
