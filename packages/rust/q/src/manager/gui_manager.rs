use godot::classes::window::Flags as WindowFlags;
use godot::classes::{CanvasLayer, ICanvasLayer, InputEvent, InputEventKey, Window};
use godot::global::Key;
use godot::prelude::*;

use crate::find_game_manager;
use crate::manager::game_manager::GameManager;

#[cfg(target_os = "macos")]
use crate::platform::macos::enable_mac_transparency;

#[cfg(target_os = "windows")]
use crate::platform::windows::set_windows_opacity;

trait GUIManagerExt {
    fn with_transparency(&mut self, transparency_value: f64);
    fn with_windowflag(&mut self, flag: WindowFlags, flag_boolean: bool);
}

impl GUIManagerExt for Gd<CanvasLayer> {
    fn with_transparency(&mut self, transparency_value: f64) {
        if let Some(mut viewport) = self.get_viewport() {
            viewport.set_transparent_background(true);
        }

        #[cfg(target_os = "windows")]
        {
            if let Some(mut window) = self.get_window() {
                window.set_transparent_background(true);
                window.set_flag(WindowFlags::TRANSPARENT, true);
            }

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
                godot_print!(
                    "[Godot] Modifying window flag: {:?}, setting to: {}",
                    flag,
                    flag_boolean
                );
                root_window.set_flag(flag, flag_boolean);
            } else {
                godot_print!("[Godot] ERROR: Root window not found!");
            }
        }
    }
}

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct GUIManager {
    base: Base<CanvasLayer>,
    game_manager: Option<Gd<GameManager>>,
    mouse_passthrough: bool,
}

#[godot_api]
impl ICanvasLayer for GUIManager {
    fn init(base: Base<Self::Base>) -> Self {
        Self {
            base,
            game_manager: None,
            mouse_passthrough: false,
        }
    }

    fn ready(&mut self) {
        find_game_manager!(self);
        self.enable_always_ontop();
        self.enable_transparency();
    }

    fn input(&mut self, event: Gd<InputEvent>) {
        if let Ok(key_event) = event.try_cast::<InputEventKey>() {
            if key_event.is_pressed() && key_event.get_keycode() == Key::QUOTELEFT {
                self.toggle_mouse_passthrough();
            }
        }
    }
}

#[godot_api]
impl GUIManager {
    #[func]
    fn enable_transparency(&mut self) {
        self.base_mut().with_transparency(0.55);
    }

    #[func]
    fn enable_always_ontop(&mut self) {
        self.base_mut()
            .with_windowflag(WindowFlags::ALWAYS_ON_TOP, true);
        //self.base_mut().with_windowflag(WindowFlags::MOUSE_PASSTHROUGH, true);
        //self.base_mut().with_windowflag(WindowFlags::BORDERLESS, false);
    }

    #[func]
    fn toggle_mouse_passthrough(&mut self) {
        self.mouse_passthrough = !self.mouse_passthrough;

        let passthrough = self.mouse_passthrough;

        self.base_mut()
            .with_windowflag(WindowFlags::MOUSE_PASSTHROUGH, passthrough);

        godot_print!("[GUIManager] Mouse Passthrough: {}", self.mouse_passthrough);
    }
}
