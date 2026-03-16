mod butterfly;
pub mod common;
mod firefly;
mod frog;

use bevy::prelude::*;

pub use common::GameTime;
use common::{CreatureMeshes, CreaturePool};
pub use frog::FrogMaterials;

/// Build creature meshes once at Startup to avoid allocating during spawn.
fn setup_creature_meshes(mut commands: Commands, mut meshes: ResMut<Assets<Mesh>>) {
    commands.insert_resource(CreatureMeshes {
        firefly_sphere: meshes.add(Sphere::new(0.04).mesh().ico(1).unwrap()),
        butterfly_wings: meshes.add(butterfly::build_butterfly_mesh()),
    });
}

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
        app.init_resource::<common::GameTime>();
        app.init_resource::<FrogMaterials>();
        app.add_systems(Startup, setup_creature_meshes);
        app.add_systems(
            Update,
            (
                firefly::spawn_fireflies.run_if(|pool: Res<CreaturePool>| !pool.fireflies_spawned),
                firefly::animate_fireflies.run_if(any_with_component::<firefly::Firefly>),
                butterfly::spawn_butterflies
                    .run_if(|pool: Res<CreaturePool>| !pool.butterflies_spawned),
                butterfly::animate_butterflies.run_if(any_with_component::<butterfly::Butterfly>),
                frog::spawn_frogs.run_if(|pool: Res<CreaturePool>| !pool.frogs_spawned),
                frog::animate_frogs.run_if(any_with_component::<frog::Frog>),
            ),
        );
    }
}
