use godot::prelude::*;
use godot::classes::{ Timer, AudioStream };

use crate::hexmap::HexMapManager;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct HexGridScene {
  base: Base<Node>,
  hex_map_manager: Option<Gd<HexMapManager>>,
}

#[godot_api]
impl HexGridScene {}

#[godot_api]
impl INode for HexGridScene {
  fn init(base: Base<Node>) -> Self {
    HexGridScene {
      base,
      hex_map_manager: None,
    }
  }
  fn ready(&mut self) {
    self.hex_map_manager = self.base().try_get_node_as::<HexMapManager>("HexMapManager");
    if self.hex_map_manager.is_none() {
      godot_print!("HexMapManager not found, creating one...");
      let mut hex_map_manager = HexMapManager::new_alloc();
      hex_map_manager.set_name("HexMapManager");
      self.base_mut().add_child(&hex_map_manager);
      self.hex_map_manager = Some(hex_map_manager);
    } else {
      godot_print!("HexMapManager found and linked.");
    }
  }
}
