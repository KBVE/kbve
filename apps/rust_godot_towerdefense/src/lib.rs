use godot::prelude::*;

mod maiky;
mod hexgrid;
mod music;

struct RustTowerDefense;

#[gdextension]
unsafe impl ExtensionLibrary for RustTowerDefense {}