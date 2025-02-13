use godot::prelude::*;

mod maiky;
mod hexgrid;
mod camera;
mod hexmap;
mod extensions;
mod data;
mod macros;
mod manager;

#[cfg(target_os = "macos")]
mod macos;

struct RustTowerDefense;

#[gdextension]
unsafe impl ExtensionLibrary for RustTowerDefense {}