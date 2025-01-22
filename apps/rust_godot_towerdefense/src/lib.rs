use godot::prelude::*;

mod maiky;
mod hexgrid;

struct RustTowerDefense;

#[gdextension]
unsafe impl ExtensionLibrary for RustTowerDefense {}