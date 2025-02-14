use godot::prelude::*;
use godot::classes::{ CanvasLayer, Window };
use godot::classes::window::Flags as WindowFlags;

#[cfg(target_os = "macos")]
use crate::macos::macos_gui_options::enable_mac_transparency;

pub trait GUIManagerExt {
    fn with_transparency(&mut self);
}


impl GUIManagerExt for Gd<CanvasLayer> {
    fn with_transparency(&mut self) {
        if let Some(mut viewport) = self.get_viewport() {
            viewport.set_transparent_background(true);
        }
        if let Some(mut window) = self.get_window() {
            window.set_flag(WindowFlags::ALWAYS_ON_TOP, true);
        }
        #[cfg(target_os = "macos")]
        {
            enable_mac_transparency();
        }
    }
}