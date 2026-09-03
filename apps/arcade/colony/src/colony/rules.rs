use bevy::prelude::*;

#[derive(Resource, Debug, Clone, Copy)]
pub struct ColonyRules {
    pub pawn_speed: f32,
}

impl Default for ColonyRules {
    fn default() -> Self {
        Self { pawn_speed: 2.0 }
    }
}
