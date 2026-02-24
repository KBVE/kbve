use crate::data::abstract_data_map::AbstractDataMap;
use crate::data::npc_data::{NPCData, NPCState};
use crate::debug_print;
use godot::classes::Sprite2D;
use godot::prelude::*;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct NPCEntity {
    base: Base<Node>,
    #[export]
    speed: f32,
    pub data: NPCData,
    #[export]
    sprite: Option<Gd<Sprite2D>>,
}

#[godot_api]
impl INode for NPCEntity {
    fn init(base: Base<Node>) -> Self {
        NPCEntity {
            base,
            speed: 100.0,
            data: NPCData::new(
                "default_npc",
                "generic",
                Vector2::ZERO,
                100.0,
                NPCState::IDLE,
            ),
            sprite: None,
        }
    }

    fn ready(&mut self) {
        debug_print!("[NPCEntity] Initializing...");

        if let Some(sprite) = self.base().try_get_node_as::<Sprite2D>("Sprite2D") {
            self.sprite = Some(sprite);
        } else {
            godot_warn!("[NPCEntity] Base could not be cast to Node.");
        }

        if self.sprite.is_none() {
            godot_warn!("[NPCEntity] Sprite2D not found.");
        }
    }

    fn process(&mut self, delta: f64) {
        self.update_behavior();
        self.move_and_update(delta);
    }
}

#[godot_api]
impl NPCEntity {
    fn update_behavior(&mut self) {
        let state = self.data.get_state();
        if state.contains(NPCState::ESCAPING) {
            self.handle_escape();
        } else if state.contains(NPCState::ATTACKING) {
            self.handle_attack();
        } else if state.contains(NPCState::DEFENDING) {
            self.handle_defend();
        } else if state.contains(NPCState::PATROLLING) {
            self.handle_patrol();
        } else if state.contains(NPCState::MOVING) {
            self.handle_movement();
        } else {
            self.handle_idle();
        }
    }

    fn handle_idle(&mut self) {
        self.data.set_velocity(Vector2::ZERO);
    }

    fn handle_movement(&mut self) {
        let direction = Vector2::new(1.0, 0.0);
        self.data.set_velocity(direction * self.speed);
    }

    fn handle_attack(&mut self) {
        debug_print!("[NPCEntity] Attacking...");
        self.data.set_velocity(Vector2::ZERO);
    }

    fn handle_defend(&mut self) {
        debug_print!("[NPCEntity] Defending...");
        self.data.set_velocity(Vector2::ZERO);
    }

    fn handle_patrol(&mut self) {
        let patrol_direction = Vector2::new(0.5, 0.0);
        self.data.set_velocity(patrol_direction * self.speed);
    }

    fn handle_escape(&mut self) {
        let escape_direction = Vector2::new(-1.0, 0.0);
        self.data.set_velocity(escape_direction * self.speed * 1.5);
    }

    fn move_and_update(&mut self, delta: f64) {
        let velocity = self.data.get_velocity();
        if velocity != Vector2::ZERO {
            if let Some(sprite) = self.sprite.as_mut() {
                let new_position = sprite.get_position() + velocity * (delta as f32);
                sprite.set_position(new_position);
                self.data.set_position(new_position);
            } else {
                godot_error!("[NPCEntity] Sprite2D not linked. Cannot update position.");
            }
        }
    }

    pub fn set_npc_data(&mut self, data: NPCData) {
        self.data = data;
    }

    pub fn get_npc_data(&self) -> &NPCData {
        &self.data
    }

    #[func]
    fn save_npc_data(&self, file_path: GString) -> bool {
        debug_print!("Saving NPC data to {}", file_path);
        self.data.to_save_gfile_json(&file_path.to_string())
    }

    #[func]
    fn load_npc_data(&mut self, file_path: GString) -> bool {
        debug_print!("Loading NPC data from {}", file_path);
        if let Some(loaded_data) = NPCData::from_load_gfile_json(&file_path.to_string()) {
            self.data = loaded_data;
            true
        } else {
            false
        }
    }
}
