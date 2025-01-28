use godot::prelude::*;

mod maiky;
mod hexgrid;
mod music;
mod camera;
mod hexmap;
mod shader;

struct RustTowerDefense;

#[gdextension]
unsafe impl ExtensionLibrary for RustTowerDefense {}