use godot::prelude::*;
use godot::classes::Sprite2D;
use crate::data::player_data::PlayerData;
use crate::data::abstract_data_map::AbstractDataMap;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct Player2DNode {
  base: Base<Node>,
  #[export]
  speed: f32,
  pub data: PlayerData,
  #[export]
  sprite: Option<Gd<Sprite2D>>,
}

#[godot_api]
impl INode for Player2DNode {
  fn init(base: Base<Node>) -> Self {
    Player2DNode {
      base,
      speed: 200.0,
      data: PlayerData::default(),
      sprite: None,
    }
  }

  fn ready(&mut self) {
    godot_print!("[Player2DNode] Ready! Initializing Player2DNode...");

    if let Some(sprite) = self.base().try_get_node_as::<Sprite2D>("Sprite2D") {
      self.sprite = Some(sprite);
      godot_print!("[Player2DNode] Sprite2D found and cached by name.");
    } else {
      godot_warn!("[Player2DNode] Base could not be cast to Node.");
    }

    // TODO We need to add another fallback method for the Sprite2D is not found.

    if self.sprite.is_none() {
      godot_warn!("[Player2DNode] Sprite2D not found.");
    }
  }

  fn process(&mut self, delta: f64) {
    self.handle_input();
    self.move_and_update(delta);
  }
}

#[godot_api]
impl Player2DNode {
  fn handle_input(&mut self) {
    let input = Input::singleton();

    let mut direction = Vector2::ZERO;

    if input.is_action_pressed("ui_right") {
      direction.x += 1.0;
    }
    if input.is_action_pressed("ui_left") {
      direction.x -= 1.0;
    }
    if input.is_action_pressed("ui_down") {
      direction.y += 1.0;
    }
    if input.is_action_pressed("ui_up") {
      direction.y -= 1.0;
    }

    if direction.length() > 0.0 {
      self.data.set_velocity(direction * self.speed);
    } else {
      self.data.set_velocity(Vector2::ZERO);
    }
  }

  fn move_and_update(&mut self, delta: f64) {
    let velocity = self.data.get_velocity();
    if velocity != Vector2::ZERO {
        if let Some(sprite) = &self.sprite {
            let new_position = sprite.get_position() + velocity * (delta as f32);
            sprite.set_position(new_position);
            self.data.set_position(new_position);
        } else {
            godot_error!("[Player2DNode] Sprite2D not linked. Cannot update position.");
        }
    }
}

  fn save_player_data(&self, file_path: &str) -> bool {
    godot_print!("Saving player data to {}", file_path);
    self.data.to_save_gfile_json(file_path)
  }

  fn load_player_data(&mut self, file_path: &str) -> bool {
    godot_print!("Loading player data from {}", file_path);
    if let Some(loaded_data) = PlayerData::from_load_gfile_json(file_path) {
      self.data = loaded_data;
      true
    } else {
      false
    }
  }
}
