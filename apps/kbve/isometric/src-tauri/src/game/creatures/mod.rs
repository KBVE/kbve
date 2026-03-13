mod butterfly;
pub mod common;
mod firefly;

use bevy::prelude::*;

use common::CreaturePool;

/// Registers all creature systems (butterflies, fireflies, and future creatures).
///
/// To add a new creature (e.g. frog):
/// 1. Create `frog.rs` in this directory
/// 2. Add `mod frog;` above
/// 3. Add a `frogs_spawned: bool` field to `CreaturePool`
/// 4. Register spawn + animate systems below
pub struct CreaturesPlugin;

impl Plugin for CreaturesPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CreaturePool>();
        app.add_systems(
            Update,
            (
                firefly::spawn_fireflies,
                firefly::animate_fireflies,
                butterfly::spawn_butterflies,
                butterfly::animate_butterflies,
            ),
        );
    }
}
