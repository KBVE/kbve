//! Rapier2d integration helpers.
//!
//! Split per side so the same crate can ship a thin query/render-only
//! flavor for the client and a full physics-stepping flavor for the server.

#[cfg(feature = "rapier2d-client")]
pub mod client;

#[cfg(feature = "rapier2d-server")]
pub mod server;

/// Engine-agnostic 3d sim, shared by the client bridge and the headless server.
#[cfg(feature = "rapier3d-sim")]
pub mod sim3d;

/// Godot adapter over [`sim3d`]. Client-only — it is the one place in the
/// physics stack allowed to name Godot types.
#[cfg(feature = "rapier3d-client")]
pub mod bridge3d;

/// Godot adapter for a networked session, rendering server snapshots.
#[cfg(feature = "net-godot")]
pub mod net_bridge3d;
