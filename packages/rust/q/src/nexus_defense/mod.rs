//! Nexus Defense client-side classes (Godot side).
//! Activated by `--features nexus-defense`.

mod ping;

#[cfg(all(feature = "net-client", not(target_family = "wasm")))]
mod match_socket;
