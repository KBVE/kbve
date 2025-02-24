use godot::prelude::*;

mod macros;

struct Q;

#[gdextension]
unsafe impl ExtensionLibrary for Q {}
