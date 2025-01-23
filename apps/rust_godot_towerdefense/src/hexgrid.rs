use godot::prelude::*;
use godot::classes::{ Timer, AudioStream };

use crate::music::MusicManager;
use crate::camera::CameraManager;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct HexGridScene {
  base: Base<Node>,
  map_root: Option<Gd<Node3D>>,
  music_manager: Option<Gd<MusicManager>>,
  camera_manager: Option<Gd<CameraManager>>,
}

#[godot_api]
impl HexGridScene {

  #[func]
  pub fn blend_level_music(&mut self, track_path: GString, blend_duration: f32) {
      if let Some(manager) = self.music_manager.as_mut() {
          manager.bind_mut().blend_music(track_path, blend_duration);
      } else {
          godot_warn!("MusicManager is not initialized. Cannot blend music.");
      }
  }

}

#[godot_api]
impl INode for HexGridScene {
  fn init(base: Base<Node>) -> Self {
    HexGridScene {
      base,
      map_root: None,
      music_manager: None,
      camera_manager: None,
    }
  }
  fn ready(&mut self) {
    // Music
    self.music_manager = self.base().try_get_node_as::<MusicManager>("MusicManager");

    if self.music_manager.is_none() {
      godot_print!("MusicManager not found, creating one...");
      let mut music_manager = MusicManager::new_alloc();
      music_manager.set_name("MusicManager");
      self.base_mut().add_child(&music_manager);
      self.music_manager = Some(music_manager);
    }

    // if let Some(manager) = self.music_manager.as_mut() {
    //   manager.bind_mut().blend_music("res://audio/track1.ogg".into());
    // }

    // Camera
     self.camera_manager = self.base().try_get_node_as::<CameraManager>("CameraManager");

     if self.camera_manager.is_none() {
         godot_print!("CameraManager not found, creating one...");
         let mut camera_manager = CameraManager::new_alloc();
         camera_manager.set_name("CameraManager");
         self.base_mut().add_child(&camera_manager);
         self.camera_manager = Some(camera_manager);
     }

     if let Some(manager) = self.camera_manager.as_mut() {
         manager.bind_mut().get_or_create_isometric_camera();
     }

  }
}
