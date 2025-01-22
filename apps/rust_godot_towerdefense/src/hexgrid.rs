use godot::prelude::*;
use godot::classes::{ Timer, AudioStream };

use crate::music::MusicManager;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct HexGridScene {
  base: Base<Node>,
  map_root: Option<Gd<Node3D>>,
  music_manager: Option<Gd<MusicManager>>,
}

#[godot_api]
impl HexGridScene {}

#[godot_api]
impl INode for HexGridScene {
  fn init(base: Base<Node>) -> Self {
    HexGridScene {
      base,
      map_root: None,
      music_manager: None,
    }
  }
  fn ready(&mut self) {
    self.music_manager = self.base().try_get_node_as::<MusicManager>("MusicManager");

    if self.music_manager.is_none() {
      godot_print!("MusicManager not found, creating one...");
      let mut music_manager = MusicManager::new_alloc();
      music_manager.set_name("MusicManager");
      self.base_mut().add_child(&music_manager);
      self.music_manager = Some(music_manager);
    }

    if let Some(manager) = self.music_manager.as_mut() {
      manager.bind_mut().load_music("res://audio/track1.ogg".into());
    }
  }
}
