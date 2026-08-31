use bitflags::bitflags;
use godot::prelude::*;
use serde::{Deserialize, Serialize};

use crate::data::abstract_data_map::AbstractDataMap;
use crate::data::vector_data::vector2_serde;

bitflags! {
    #[derive(Default, Serialize, Deserialize, Copy, Clone, PartialEq, Eq, Debug)]
    pub struct NPCState: u32 {
        const IDLE        = 0b00000001;
        const MOVING      = 0b00000010;
        const ATTACKING   = 0b00000100;
        const DEFENDING   = 0b00001000;
        const DEAD        = 0b00010000;
        const FRIENDLY    = 0b00100000;
        const HOSTILE     = 0b01000000;
        const INTERACTABLE = 0b10000000;
        const PATROLLING   = 0b00000001_00000000;
        const SLEEPING     = 0b00000010_00000000;
        const TRADING      = 0b00000100_00000000;
        const ESCAPING     = 0b00001000_00000000;
        const HIDDEN       = 0b00010000_00000000;
        const STUNNED      = 0b00100000_00000000;
        const FOLLOWING    = 0b01000000_00000000;
        const HEALING      = 0b10000000_00000000;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NPCData {
    pub npc_id: String,
    pub npc_type: String,
    #[serde(with = "vector2_serde")]
    pub position: Vector2,
    #[serde(with = "vector2_serde")]
    pub velocity: Vector2,
    pub health: f32,
    pub state: NPCState,
}

impl AbstractDataMap for NPCData {}

impl NPCData {
    pub fn new(
        npc_id: &str,
        npc_type: &str,
        position: Vector2,
        health: f32,
        state: NPCState,
    ) -> Self {
        Self {
            npc_id: npc_id.to_string(),
            npc_type: npc_type.to_string(),
            position,
            velocity: Vector2::ZERO,
            health,
            state,
        }
    }

    pub fn set_position(&mut self, position: Vector2) {
        self.position = position;
    }

    pub fn get_position(&self) -> Vector2 {
        self.position
    }

    pub fn set_velocity(&mut self, velocity: Vector2) {
        self.velocity = velocity;
    }

    pub fn get_velocity(&self) -> Vector2 {
        self.velocity
    }

    pub fn set_health(&mut self, health: f32) {
        self.health = health;
    }

    pub fn get_health(&self) -> f32 {
        self.health
    }

    pub fn set_state(&mut self, state: NPCState) {
        self.state = state;
    }

    pub fn get_state(&self) -> NPCState {
        self.state
    }

    pub fn add_state(&mut self, state: NPCState) {
        self.state.insert(state);
    }

    pub fn remove_state(&mut self, state: NPCState) {
        self.state.remove(state);
    }

    pub fn has_state(&self, state: NPCState) -> bool {
        self.state.contains(state)
    }
}
