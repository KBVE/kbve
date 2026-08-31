use crate::data::abstract_data_map::AbstractDataMap;
use crate::data::vector_data::vector2_serde;
use godot::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayerData {
    pub name: String,
    pub health: f32,
    pub max_health: f32,
    pub energy: f32,
    pub max_energy: f32,
    pub heat: f32,
    pub max_heat: f32,
    pub mana: f32,
    pub max_mana: f32,

    #[serde(with = "vector2_serde")]
    pub position: Vector2,
    #[serde(with = "vector2_serde")]
    pub velocity: Vector2,
    pub rotation: f32,
}

impl AbstractDataMap for PlayerData {}

impl PlayerData {
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
}
