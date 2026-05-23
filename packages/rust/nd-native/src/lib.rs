use godot::prelude::*;

mod bridges;

struct NdNative;

#[gdextension]
unsafe impl ExtensionLibrary for NdNative {}
