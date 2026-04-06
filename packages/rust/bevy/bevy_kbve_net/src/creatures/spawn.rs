//! Headless creature spawning — creates ECS entities with simulation components
//! but NO rendering (no mesh, material, SSBO, shadow). Used by the server.
//! The client extends this by attaching visuals to spawned entities.

use bevy::prelude::*;

use super::brain::CreatureBrain;
use super::common::hash_f32;
use super::types::{self, *};

/// Headless spawn system — creates creature entities with simulation components.
/// Runs on both server and client (client adds visuals separately).
pub fn spawn_creatures_headless(
    mut commands: Commands,
    types: Res<SpriteCreatureTypes>,
    mut atlas_pool: ResMut<SpriteAtlasPool>,
    registry: Res<crate::npcdb::CreatureRegistry>,
) {
    for creature_type in &types.types {
        // Skip if already spawned
        if atlas_pool
            .entries
            .iter()
            .any(|e| e.type_key == creature_type.npc_ref && e.spawned)
        {
            continue;
        }

        // Look up pool size from registry
        let Some(config) = registry.config_by_ref(creature_type.npc_ref) else {
            warn!(
                "[creatures] no registry config for '{}' — skipping",
                creature_type.npc_ref
            );
            continue;
        };
        let count = config.pool_size;

        // Track in atlas pool
        atlas_pool.entries.push(SpriteAtlasEntry {
            type_key: creature_type.npc_ref,
            spawned: true,
        });

        let idle_anim = &creature_type.anims.idle;
        let seed_offset = creature_type.seed_offset;

        for i in 0..count {
            let seed = (i as u32).wrapping_add(seed_offset);
            let phase = hash_f32(seed * 11 + 1);
            let direction = match &creature_type.direction_model {
                DirectionModel::Flip => 0,
                DirectionModel::FourWay { .. } => (hash_f32(seed * 37 + 5) * 4.0) as u32 % 4,
            };
            let idle_timer = creature_type.idle_min
                + hash_f32(seed * 53 + 11) * (creature_type.idle_max - creature_type.idle_min);
            let frame_duration =
                creature_type.frame_duration_base * (0.8 + hash_f32(seed * 79 + 17) * 0.4);

            let initial_row = match &creature_type.direction_model {
                DirectionModel::Flip => idle_anim.base_row,
                DirectionModel::FourWay { .. } => idle_anim.base_row + direction,
            };

            let mut entity = commands.spawn((
                types::CreatureId::new(),
                Transform::from_xyz(0.0, -100.0, 0.0),
                Creature {
                    npc_ref: creature_type.npc_ref,
                    state: CreatureState::Pooled,
                    slot_seed: seed,
                    assigned_slot: None,
                    anchor: Vec3::new(0.0, -100.0, 0.0),
                    phase,
                },
                SpriteData {
                    frame_timer: hash_f32(seed * 83 + 13) * frame_duration,
                    frame_duration,
                    current_frame: 0,
                    anim_row: initial_row,
                    anim_frames: idle_anim.frame_count,
                    facing_left: hash_f32(seed * 67 + 3) > 0.5,
                    hop_state: SpriteHopState::Idle { timer: idle_timer },
                },
                CreaturePoolIndex(i),
                SpriteCreatureMarker {
                    type_key: creature_type.npc_ref,
                    patrol_step: (hash_f32(seed * 97 + 31) * 1000.0) as u32,
                    direction,
                    anim_base_row: idle_anim.base_row,
                    anim_frame_count: idle_anim.frame_count,
                    active_move_speed: 0.0,
                },
                CreatureVitals::new(
                    creature_type.vitals.max_health,
                    creature_type.vitals.max_mana,
                    creature_type.vitals.max_energy,
                ),
            ));

            // Add brain if creature type has a behavior tree
            if creature_type.behavior_tree.is_some() {
                entity.insert(CreatureBrain::new());
            }
        }

        info!(
            "[creatures] spawned {} '{}' entities (headless)",
            count, creature_type.npc_ref
        );
    }
}
