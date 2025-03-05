use godot::prelude::*;
use serde::{Serialize, Deserialize};
use crate::data::abstract_data_map::AbstractDataMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayerData {
    pub name: String,
    pub health: f32,
    pub max_health: f32,
    pub energy: f32,
    pub max_energy: f32,
    pub heat: f32,
    pub max_heat: f32,
    pub position: Vector2,
    pub velocity: Vector2,
    pub rotation: f32,
}

impl AbstractDataMap for PlayerData {}
