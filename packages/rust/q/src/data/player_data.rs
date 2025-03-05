use godot::prelude::*;
use serde::{Serialize, Deserialize};
use crate::data::abstract_data_map::AbstractDataMap;
use crate::data::vector_data::vector2i_serde;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayerData {
    pub name: String,
    pub health: f32,
    pub max_health: f32,
    pub energy: f32,
    pub max_energy: f32,
    pub heat: f32,
    pub max_heat: f32,
    #[serde(with = "vector2i_serde")]
    pub position: Vector2i,
    #[serde(with = "vector2i_serde")]
    pub velocity: Vector2i,
    pub rotation: f32,
}

impl AbstractDataMap for PlayerData {}


impl PlayerData {
    pub fn set_position(&mut self, position: Vector2) {
        self.position = position.cast_int();
    }

    pub fn get_position(&self) -> Vector2 {
        Vector2::new(self.position.x as f32, self.position.y as f32)
    }

    pub fn set_velocity(&mut self, velocity: Vector2) {
        self.velocity = velocity.cast_int();
    }

    pub fn get_velocity(&self) -> Vector2 {
        Vector2::new(self.velocity.x as f32, self.velocity.y as f32)
    }
}