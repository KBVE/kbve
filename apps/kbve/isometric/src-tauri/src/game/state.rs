use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub static PLAYER_STATE_SNAPSHOT: Mutex<Option<PlayerState>> = Mutex::new(None);

#[derive(Resource, Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub health: f32,
    pub max_health: f32,
    pub mana: f32,
    pub max_mana: f32,
    pub position: [f32; 3],
    pub inventory_slots: usize,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            health: 100.0,
            max_health: 100.0,
            mana: 50.0,
            max_mana: 50.0,
            position: [0.0, 0.0, 0.0],
            inventory_slots: 16,
        }
    }
}

pub struct GameStatePlugin;

impl Plugin for GameStatePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<PlayerState>();
        app.add_systems(Update, snapshot_player_state);
    }
}

fn snapshot_player_state(state: Res<PlayerState>) {
    if state.is_changed() {
        if let Ok(mut snapshot) = PLAYER_STATE_SNAPSHOT.lock() {
            *snapshot = Some(state.clone());
        }
    }
}
