use godot::prelude::*;

mod maiky;
mod hexgrid;
mod music;
mod camera;

struct RustTowerDefense;

#[gdextension]
unsafe impl ExtensionLibrary for RustTowerDefense {}