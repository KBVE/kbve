use godot::prelude::*;
use godot::classes::{
  CanvasLayer,
  ICanvasLayer,
  Control,
  TextureRect,
  Texture2D,
  RichTextLabel,
  Button,
  Timer,
  InputEvent,
  InputEventKey,
};
use godot::classes::control::LayoutPreset;
use godot::classes::window::Flags as WindowFlags;
use godot::classes::text_server::AutowrapMode;
use godot::classes::texture_rect::ExpandMode;
use godot::classes::tween::{ TransitionType, EaseType };
use godot::global::Key;

use crate::extensions::timer_extension::{ ClockMaster, TimerExt };
use crate::data::uxui_data::{ UxUiElement, MenuButtonData };
use crate::extensions::ui_extension::*;
use crate::extensions::gui_manager_extension::GUIManagerExt;

use crate::manager::game_manager::GameManager;
use crate::data::cache::CacheManager;

use crate::{ connect_signal, find_game_manager };

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
      if key_event.is_pressed() && key_event.get_keycode() == Key::DOLLAR {
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
    self.base_mut().with_windowflag(WindowFlags::ALWAYS_ON_TOP, true);
    //self.base_mut().with_windowflag(WindowFlags::MOUSE_PASSTHROUGH, true);
    //self.base_mut().with_windowflag(WindowFlags::BORDERLESS, false);
  }

  #[func]
  fn toggle_mouse_passthrough(&mut self) {
    self.mouse_passthrough = !self.mouse_passthrough;

    let passthrough = self.mouse_passthrough; 

    self.base_mut()
        .with_windowflag(WindowFlags::MOUSE_PASSTHROUGH, passthrough);

    godot_print!(
        "[GUIManager] Mouse Passthrough: {}",
        self.mouse_passthrough
    );
  }
}
