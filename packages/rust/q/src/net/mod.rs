//! Networking. `transport` is the engine- and vendor-agnostic seam; `client`
//! and `server` are the WebSocket flavor (client opens to the game server,
//! server accepts via axum). Steam P2P slots in as another `Transport` impl
//! without either side of the protocol changing.

#[cfg(feature = "net-transport")]
pub mod transport;

#[cfg(feature = "net-session")]
pub mod session;

#[cfg(feature = "net-ws")]
pub mod ws;

#[cfg(feature = "net-udp")]
pub mod udp;

#[cfg(feature = "net-udp")]
pub mod dual;

#[cfg(all(feature = "net-udp", feature = "net-session"))]
pub mod client_thread;

#[cfg(feature = "net-client")]
pub mod client;

#[cfg(feature = "net-server")]
pub mod server;
