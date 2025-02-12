use godot::prelude::*;
use godot::classes::window::Flags as WindowFlags;
use godot::classes::ICanvasLayer;
use crate::data::user_data::{ UserData, UserDataCache };
use crate::data::abstract_data_map::AbstractDataMap;
use crate::music::MusicManager;
use crate::maiky::Maiky;
use crate::extensions::timer_extension::ClockMaster;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct GameManager {
  base: Base<Node>,
  user_data_cache: UserDataCache,
  clock_master: Gd<ClockMaster>,
  music_manager: Gd<MusicManager>,
  ui_manager: Gd<Maiky>,
}

#[godot_api]
impl INode for GameManager {
  fn init(base: Base<Self::Base>) -> Self {
    godot_print!("[GameManager] Initializing...");

    let clock_master = Gd::from_init_fn(|base| ClockMaster::init(base));
    let music_manager = Gd::from_init_fn(|base| MusicManager::init(base));
    let ui_manager = Gd::from_init_fn(|base| Maiky::init(base));

    Self {
      base,
      user_data_cache: UserDataCache::new(),
      clock_master,
      music_manager,
      ui_manager,
      
    }
  }

  fn ready(&mut self) {
    godot_print!("[GameManager] Ready! Adding children...");

    
    let clock_master = self.clock_master.clone();
    let music_manager = self.music_manager.clone();
    let ui_manager = self.ui_manager.clone();

    self.base_mut().call_deferred("add_child", &[clock_master.to_variant()]);
    self.base_mut().call_deferred("add_child", &[music_manager.to_variant()]);
    self.base_mut().call_deferred("add_child", &[ui_manager.to_variant()]);
  }
}

#[godot_api]
impl GameManager {
  #[signal]
  fn game_started();

  #[signal]
  fn game_paused();

  #[signal]
  fn game_resumed();

  #[signal]
  fn game_exited();

  #[func]
  pub fn get_music_manager(&self) -> Gd<MusicManager> {
    self.music_manager.clone()
  }

  #[func]
  pub fn get_ui_manager(&self) -> Gd<Maiky> {
    self.ui_manager.clone()
  }

  #[func]
  pub fn get_clock_master(&self) -> Gd<ClockMaster> {
    self.clock_master.clone()
  }

  #[func]
  fn load_user_settings(&mut self) {
    let file_path = "user://settings.json";

    if let Some(user_data) = self.user_data_cache.load_from_file(file_path) {
      godot_print!("[GameManager] Loaded User Settings: {:?}", user_data);
    } else {
      godot_warn!("[GameManager] Failed to load user settings, using defaults.");
      let default_data = UserData::new(
        "Player",
        "guest@kbve.com",
        0.55,
        false,
        Some("dark".to_string())
      );
      self.user_data_cache.save_user_data(&default_data);
      self.user_data_cache.save_to_file(file_path);
    }
  }

  #[func]
  fn save_user_settings(&mut self) {
    let file_path = "user://settings.json";
    self.user_data_cache.save_to_file(file_path);
    godot_print!("[GameManager] User settings saved.");
  }

  #[func]
  fn update_setting(&mut self, key: GString, value: Variant) {
    let key_str = key.to_string();
    self.user_data_cache.insert(&key_str, value.clone());
    self.save_user_settings();
    godot_print!("[GameManager] Updated Setting: {} -> {:?}", key_str, value);
  }

  #[func]
  fn start_game(&mut self) {
    self.base_mut().emit_signal("game_started", &[]);
    godot_print!("[GameManager] Game Started!");
  }

  #[func]
  fn pause_game(&mut self) {
    self.base_mut().emit_signal("game_paused", &[]);
    if let Some(mut scene_tree) = self.base().get_tree() {
      scene_tree.set_pause(true);
    }
    godot_print!("[GameManager] Game Paused.");
  }

  #[func]
  fn resume_game(&mut self) {
    self.base_mut().emit_signal("game_resumed", &[]);
    if let Some(mut scene_tree) = self.base().get_tree() {
      scene_tree.set_pause(false);
    }
    godot_print!("[GameManager] Game Resumed.");
  }

  #[func]
  fn exit_game(&mut self) {
    self.base_mut().emit_signal("game_exited", &[]);
    godot_print!("[GameManager] Exiting Game...");

    if let Some(mut scene_tree) = self.base().get_tree() {
      scene_tree.quit();
    }
  }
}
