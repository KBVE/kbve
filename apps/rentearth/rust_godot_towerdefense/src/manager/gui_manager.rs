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
};
use godot::classes::control::LayoutPreset;
use godot::classes::window::Flags as WindowFlags;
use godot::classes::text_server::AutowrapMode;
use godot::classes::texture_rect::ExpandMode;
use godot::classes::tween::{ TransitionType, EaseType };

use crate::extensions::timer_extension::{ ClockMaster, TimerExt };
use crate::data::uxui_data::{ UxUiElement, MenuButtonData };
use crate::extensions::ui_extension::*;
use crate::extensions::gui_manager_extension::GUIManagerExt;

use crate::manager::game_manager::GameManager;
use crate::data::cache::CacheManager;

use crate::{connect_signal, find_game_manager};

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct GUIManager {
  base: Base<CanvasLayer>,
  game_manager: Option<Gd<GameManager>>,
}

#[godot_api]
impl ICanvasLayer for GUIManager {
  fn init(base: Base<Self::Base>) -> Self {
    Self {
      base,
      game_manager: None,
    }
  }

  fn ready(&mut self) {
    find_game_manager!(self);

    #[cfg(target_os = "macos")]
    {
    self.enable_transparency();
    //self.enable_always_ontop();
    }

    #[cfg(target_os = "windows")]
    {
    self.enable_always_ontop();
    self.enable_transparency();
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
    //self.base_mut().with_windowflag(WindowFlags::BORDERLESS, false);
  }
}
