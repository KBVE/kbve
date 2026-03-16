mod butterfly;
pub mod common;
mod firefly;
mod frog;

use bevy::prelude::*;

use common::CreaturePool;
pub use frog::FrogMaterials;

/// Registers all creature systems.
///
/// To add a new creature:
/// 1. Create a `<name>/` directory with `mod.rs` (and any assets)
/// 2. Add `mod <name>;` above
/// 3. Add a `<name>_spawned: bool` field to `CreaturePool` in `common.rs`
/// 4. Register spawn + animate systems below
pub struct CreaturesPlugin;

impl Plugin for CreaturesPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CreaturePool>();
        app.init_resource::<FrogMaterials>();
        app.add_systems(
            Update,
            (
                firefly::spawn_fireflies,
                firefly::animate_fireflies,
                butterfly::spawn_butterflies,
                butterfly::animate_butterflies,
                frog::spawn_frogs,
                frog::animate_frogs,
            ),
        );
    }
}
