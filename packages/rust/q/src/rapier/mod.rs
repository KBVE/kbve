//! Rapier2d integration helpers.

#[cfg(feature = "rapier2d-client")]
pub mod client;

#[cfg(feature = "rapier2d-server")]
pub mod server;

/// Engine-agnostic 3d sim, shared by the client bridge and the headless server.
#[cfg(feature = "rapier3d-sim")]
pub mod sim3d;

/// Godot adapter over [`sim3d`].
#[cfg(feature = "rapier3d-client")]
pub mod bridge3d;

/// Render-time interpolation over the snapshot stream.
#[cfg(feature = "rapier3d-sim")]
pub mod net_interp;

/// Godot adapter for a networked session, rendering server snapshots.
#[cfg(feature = "net-godot")]
pub mod net_bridge3d;
