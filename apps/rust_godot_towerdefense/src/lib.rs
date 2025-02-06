use godot::prelude::*;

mod maiky;
mod hexgrid;
mod music;
mod camera;
mod hexmap;
mod shader;
mod cache;
mod extensions;
mod data;
mod macrow;

struct RustTowerDefense;

#[gdextension]
unsafe impl ExtensionLibrary for RustTowerDefense {}