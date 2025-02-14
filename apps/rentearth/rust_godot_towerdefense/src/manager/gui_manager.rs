use godot::prelude::*;
use godot::classes::{ CanvasLayer, Control, TextureRect, Texture2D, RichTextLabel, Button, Timer };
use godot::classes::control::LayoutPreset;
use godot::classes::window::Flags as WindowFlags;
use godot::classes::text_server::AutowrapMode;
use godot::classes::texture_rect::ExpandMode;
use godot::classes::tween::{ TransitionType, EaseType };

use crate::manager::game_manager::GameManager;
use crate::data::cache::CacheManager;
use crate::extensions::timer_extension::{ ClockMaster, TimerExt };

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
    if let Some(parent) = self.base().get_parent() {
      if let Some(game_manager) = parent.cast::<GameManager>().into() {
        godot_print!("[GUIManager] Linked with GameManager...");
        self.game_manager = Some(game_manager);
      } else {
        godot_warn!("[GUIManager] Failed to link GameManager...");
      }
    }
  }
}