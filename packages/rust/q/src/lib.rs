use godot::prelude::*;

mod macros;
mod manager;
mod extensions;
mod data;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
mod windows;



struct Q;

#[gdextension]
unsafe impl ExtensionLibrary for Q {}
