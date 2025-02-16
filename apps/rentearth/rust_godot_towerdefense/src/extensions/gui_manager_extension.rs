use godot::prelude::*;
use godot::classes::{ CanvasLayer, Window, Node, Control };
use godot::classes::window::Flags as WindowFlags;

#[cfg(target_os = "macos")]
use crate::macos::macos_gui_options::enable_mac_transparency;

#[cfg(target_os = "windows")]
use crate::windows::windows_gui_options::set_windows_opacity;

pub trait GUIManagerExt {
  fn with_transparency(&mut self, transparency_value: f64);
  fn with_windowflag(&mut self, flag: WindowFlags, flag_boolean: bool);
}

impl GUIManagerExt for Gd<CanvasLayer> {
  fn with_transparency(&mut self, transparency_value: f64) {
    if let Some(mut viewport) = self.get_viewport() {
      viewport.set_transparent_background(true);
    }

    if let Some(mut window) = self.get_window() {
      window.set_transparent_background(true);
      window.set_flag(WindowFlags::TRANSPARENT, true);
    }

    #[cfg(target_os = "windows")]
    {
      set_windows_opacity(transparency_value, self);
    }

    #[cfg(target_os = "macos")]
    {
      enable_mac_transparency(transparency_value);
    }
  }

  fn with_windowflag(&mut self, flag: WindowFlags, flag_boolean: bool) {
    if let Some(root) = self.get_tree().and_then(|tree| tree.get_root()) {
      if let Ok(mut root_window) = root.try_cast::<Window>() {
        godot_print!("[Godot] Modifying window flag: {:?}, setting to: {}", flag, flag_boolean);

        root_window.set_flag(flag, flag_boolean);
      } else {
        godot_print!("[Godot] ERROR: Root window not found!");
      }
    }
  }
}
