mod butterfly;
pub mod common;
pub mod creature;
mod firefly;
mod frog;
pub mod sprite_material;
mod wraith;

use bevy::prelude::*;

pub use common::GameTime;
use common::{CreatureMeshes, CreaturePool};
pub use creature::{
    Creature, CreatureConfig, CreaturePoolIndex, CreatureRegistry, CreatureState, EmissiveData,
    RenderKind, TimeSchedule,
};
pub use frog::FrogMaterials;
pub use wraith::WraithMaterials;

/// Build creature meshes once at Startup to avoid allocating during spawn.
fn setup_creature_meshes(mut commands: Commands, mut meshes: ResMut<Assets<Mesh>>) {
    commands.insert_resource(CreatureMeshes {
        firefly_sphere: meshes.add(Sphere::new(0.07).mesh().ico(1).unwrap()),
        butterfly_wings: meshes.add(butterfly::build_butterfly_mesh()),
    });
}

/// Load the NpcDb-driven creature registry at startup.
fn setup_creature_registry(mut commands: Commands) {
    let registry = creature::build_creature_registry();
    info!(
        "[creatures] registry loaded: {} creature types",
        registry.creature_ids.len()
    );
    for (id, npc, config) in registry.iter_creatures() {
        info!(
            "[creatures]   {} (id={:?}, family={}, render={:?}, pool={})",
            npc.name, id, npc.family, config.render_kind, config.pool_size
        );
    }
    commands.insert_resource(registry);
}

/// Registers all creature systems.
///
/// ## Architecture
///
/// The creature system has two layers:
///
/// 1. **NpcDb registry** ([`CreatureRegistry`]) — game-agnostic NPC definitions
///    from proto + game-specific spawn/render configs. Loaded at startup.
///
/// 2. **Per-type systems** (firefly, butterfly, frog) — each uses the unified
///    [`Creature`] component with render-specific companions (`EmissiveData`,
///    `BillboardData`, `SpriteData`). New creature types should follow this pattern.
pub struct CreaturesPlugin;

impl Plugin for CreaturesPlugin {
    fn build(&self, app: &mut App) {
        // Sprite sheet material plugin (automatic instancing + storage buffer)
        app.add_plugins(MaterialPlugin::<sprite_material::SpriteSheetMaterial>::default());

        // --- Unified NpcDb-driven registry ---
        app.add_systems(Startup, setup_creature_registry);

        // --- Legacy per-type resources ---
        app.init_resource::<CreaturePool>();
        app.init_resource::<common::GameTime>();
        app.init_resource::<FrogMaterials>();
        app.init_resource::<WraithMaterials>();
        app.init_resource::<firefly::FireflyState>();
        app.add_systems(Startup, setup_creature_meshes);

        // --- Per-type systems ---
        app.add_systems(
            Update,
            (
                // Fireflies (unified Creature + EmissiveData)
                firefly::spawn_fireflies.run_if(|pool: Res<CreaturePool>| !pool.fireflies_spawned),
                firefly::assign_firefly_slots
                    .after(firefly::spawn_fireflies)
                    .run_if(any_with_component::<creature::EmissiveData>),
                firefly::animate_fireflies
                    .after(firefly::assign_firefly_slots)
                    .run_if(any_with_component::<creature::EmissiveData>),
                // Butterflies (unified Creature + BillboardData)
                butterfly::spawn_butterflies
                    .run_if(|pool: Res<CreaturePool>| !pool.butterflies_spawned),
                butterfly::animate_butterflies
                    .run_if(any_with_component::<creature::BillboardData>),
                // Frogs (unified Creature + SpriteData)
                frog::spawn_frogs.run_if(|pool: Res<CreaturePool>| !pool.frogs_spawned),
                frog::animate_frogs.run_if(any_with_component::<creature::SpriteData>),
                // Wraiths (unified Creature + SpriteData + WraithMarker)
                wraith::spawn_wraiths.run_if(|pool: Res<CreaturePool>| !pool.wraiths_spawned),
                wraith::animate_wraiths.run_if(any_with_component::<wraith::WraithMarker>),
            ),
        );
    }
}
