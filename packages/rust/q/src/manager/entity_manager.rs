use dashmap::DashMap;
use godot::prelude::*;

use crate::entity::npc_entity::NPCEntity;
use crate::entity::player_entity::PlayerEntity;

#[derive(GodotClass)]
#[class(base = Node)]
pub struct EntityManager {
    base: Base<Node>,
    local_player: Option<Gd<PlayerEntity>>,
    active_npcs: Vec<Gd<NPCEntity>>,
    npc_pool: DashMap<String, Gd<NPCEntity>>,
}

#[godot_api]
impl INode for EntityManager {
    fn init(base: Base<Node>) -> Self {
        godot_print!("[EntityManager] Initializing...");

        EntityManager {
            base,
            local_player: None,
            active_npcs: Vec::new(),
            npc_pool: DashMap::new(),
        }
    }

    fn ready(&mut self) {
        godot_print!("[EntityManager] Ready!");
    }
}

#[godot_api]
impl EntityManager {
    #[func]
    pub fn set_local_player(&mut self, player: Gd<PlayerEntity>) {
        godot_print!("[EntityManager] Setting local player.");
        self.local_player = Some(player.clone());
        self.base_mut().add_child(&player.upcast::<Node>());
    }

    #[func]
    pub fn get_local_player_position(&self) -> Vector2 {
        if let Some(ref player) = self.local_player {
            return player.bind().get_position();
        } else {
            godot_warn!("[EntityManager] Local player not set. Returning Vector2::ZERO.");
            Vector2::ZERO
        }
    }
}
