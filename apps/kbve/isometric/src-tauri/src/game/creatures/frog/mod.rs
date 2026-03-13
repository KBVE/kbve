use bevy::prelude::*;

use super::common::{CreaturePool, hash_f32, scene_center};
use crate::game::camera::IsometricCamera;
use crate::game::weather::DayCycle;

const FROG_COUNT: usize = 6;

#[derive(Component)]
pub(super) struct Frog {
    phase: f32,
    anchor: Vec3,
    mat_handle: Handle<StandardMaterial>,
}

pub(super) fn spawn_frogs(
    mut _commands: Commands,
    mut _meshes: ResMut<Assets<Mesh>>,
    mut _materials: ResMut<Assets<StandardMaterial>>,
    pool: ResMut<CreaturePool>,
) {
    if pool.frogs_spawned {
        return;
    }
    // TODO: build frog mesh, spawn entities
}

pub(super) fn animate_frogs(
    _time: Res<Time>,
    _day: Res<DayCycle>,
    _camera_q: Query<&Transform, With<IsometricCamera>>,
    _frog_q: Query<(&mut Transform, &mut Frog, &mut Visibility), Without<IsometricCamera>>,
) {
    // TODO: frog idle animation, hopping, pooling
}
