mod butterfly;
pub mod common;
pub mod creature;
mod firefly;
pub mod generic;
pub mod sprite_material;

use bevy::prelude::*;

pub use common::GameTime;
use common::{CreatureMeshes, CreaturePool};
pub use creature::{
    ClientCreature, CreatureConfig, CreaturePoolIndex, CreatureState, EmissiveData, RenderKind,
    TimeSchedule,
};

// Re-export shared Creature from bevy_kbve_net for generic sprite creatures
pub use bevy_kbve_net::creatures::types::Creature;

// Re-export CreatureRegistry for use by spawn and other systems
pub use creature::CreatureRegistry;

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
/// 1. **NpcDb registry** ([`CreatureRegistry`]) -- game-agnostic NPC definitions
///    from proto + game-specific spawn/render configs. Loaded at startup.
///
/// 2. **Generic sprite system** -- data-driven spawn/animate/tint for all sprite
///    creatures (boar, badger, wolf, stag, frog, wraith). Behavior trees evaluated
///    off-thread via `bevy_tasker`. Shared simulation from `bevy_kbve_net::creatures`.
///
/// 3. **Legacy non-sprite systems** -- fireflies (emissive) and butterflies
///    (billboard) still use per-type modules.
pub struct CreaturesPlugin;

impl Plugin for CreaturesPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(MaterialPlugin::<sprite_material::SpriteAtlasMaterial>::default());

        // --- Unified NpcDb-driven registry ---
        app.add_systems(Startup, setup_creature_registry);

        // --- Shared resources ---
        app.init_resource::<CreaturePool>();
        app.init_resource::<common::GameTime>();
        app.init_resource::<firefly::FireflyState>();

        // --- Generic sprite creature system (shared resources from bevy_kbve_net) ---
        app.insert_resource(bevy_kbve_net::creatures::definitions::build_sprite_creature_types());
        app.init_resource::<generic::render::ClientSpriteAtlasPool>();
        app.init_resource::<bevy_kbve_net::creatures::simulate::SimulationCenter>();
        app.init_resource::<bevy_kbve_net::creatures::physics_lod::PhysicsLodTimer>();
        app.init_resource::<bevy_kbve_net::creatures::types::PlayerPositions>();
        app.init_resource::<bevy_kbve_net::terrain::TerrainMap>();

        app.add_systems(Startup, setup_creature_meshes);

        // --- Per-type systems ---
        app.add_systems(
            Update,
            (
                // Fireflies (Creature + EmissiveData)
                firefly::spawn_fireflies.run_if(|pool: Res<CreaturePool>| !pool.fireflies_spawned),
                firefly::assign_firefly_slots
                    .after(firefly::spawn_fireflies)
                    .run_if(any_with_component::<creature::EmissiveData>),
                firefly::animate_fireflies
                    .after(firefly::assign_firefly_slots)
                    .run_if(any_with_component::<creature::EmissiveData>),
                // Butterflies (Creature + BillboardData)
                butterfly::spawn_butterflies
                    .run_if(|pool: Res<CreaturePool>| !pool.butterflies_spawned),
                butterfly::animate_butterflies
                    .run_if(any_with_component::<creature::BillboardData>),
                // --- Generic sprite creatures (shared simulation from bevy_kbve_net) ---
                generic::spawn::spawn_sprite_creatures,
                bevy_kbve_net::creatures::brain::dispatch_behavior_trees
                    .after(generic::spawn::spawn_sprite_creatures)
                    .run_if(any_with_component::<generic::CreatureBrain>),
                bevy_kbve_net::creatures::brain::poll_behavior_results
                    .after(bevy_kbve_net::creatures::brain::dispatch_behavior_trees)
                    .run_if(any_with_component::<generic::CreatureBrain>),
                bevy_kbve_net::creatures::simulate::simulate_sprite_creatures
                    .after(bevy_kbve_net::creatures::brain::poll_behavior_results)
                    .run_if(any_with_component::<generic::SpriteCreatureMarker>),
                generic::render::render_sprite_creatures
                    .after(bevy_kbve_net::creatures::simulate::simulate_sprite_creatures)
                    .run_if(any_with_component::<generic::SpriteCreatureMarker>),
                bevy_kbve_net::creatures::physics_lod::update_physics_lod
                    .run_if(any_with_component::<generic::PhysicsLod>),
                generic::net_events::receive_creature_events,
            ),
        );
    }
}
