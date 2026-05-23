//! WS transport — `client` opens to the game server, `server` accepts via axum.

#[cfg(feature = "net-client")]
pub mod client;

#[cfg(feature = "net-server")]
pub mod server;
