use bevy::ecs::entity::MapEntities;
use bevy::prelude::*;
use serde::{Deserialize, Serialize};

/// Player input sent from client → server each tick.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Reflect)]
pub enum PlayerInput {
    /// Movement direction in isometric space + jump flag.
    Move(MoveDir),
    /// No input this tick.
    #[default]
    None,
}

impl MapEntities for PlayerInput {
    fn map_entities<M: EntityMapper>(&mut self, _mapper: &mut M) {
        // No entity references in inputs
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Reflect)]
pub struct MoveDir {
    pub forward: bool,
    pub back: bool,
    pub left: bool,
    pub right: bool,
    pub jump: bool,
}

impl MoveDir {
    /// Convert WASD booleans into a normalized isometric direction vector.
    pub fn to_isometric_vec(&self) -> Vec3 {
        let mut dir = Vec3::ZERO;
        if self.forward {
            dir += Vec3::new(-1.0, 0.0, -1.0);
        }
        if self.back {
            dir += Vec3::new(1.0, 0.0, 1.0);
        }
        if self.left {
            dir += Vec3::new(-1.0, 0.0, 1.0);
        }
        if self.right {
            dir += Vec3::new(1.0, 0.0, -1.0);
        }
        if dir != Vec3::ZERO {
            dir = dir.normalize();
        }
        dir
    }
}
