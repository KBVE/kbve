//! Generic spawn system for all sprite-sheet creatures.

use bevy::camera::visibility::NoFrustumCulling;
use bevy::light::NotShadowCaster;
use bevy::mesh::MeshTag;
use bevy::prelude::*;
use bevy::render::storage::ShaderStorageBuffer;

use super::super::common::{CreaturePool, build_billboard_quad, hash_f32};
use super::super::creature::{
    Creature, CreaturePoolIndex, CreatureRegistry, CreatureState, RenderKind, SpriteData,
    SpriteHopState,
};
use super::super::sprite_material::{SpriteAnimData, SpriteAtlasMaterial};
use super::brain::CreatureBrain;
use super::types::*;
use crate::game::weather::BlobShadowAssets;

/// Single spawn system that spawns all generic sprite creature types.
pub fn spawn_sprite_creatures(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut atlas_materials: ResMut<Assets<SpriteAtlasMaterial>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
    asset_server: Res<AssetServer>,
    pool: Res<CreaturePool>,
    registry: Res<CreatureRegistry>,
    types: Res<SpriteCreatureTypes>,
    mut atlas_pool: ResMut<SpriteAtlasPool>,
    blob_shadow: Option<Res<BlobShadowAssets>>,
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
                "[generic] no registry config for '{}' — skipping",
                creature_type.npc_ref
            );
            continue;
        };
        let npc_id = registry
            .npc_db
            .id_for_ref(creature_type.npc_ref)
            .unwrap_or(bevy_kbve_net::npcdb::ProtoNpcId(0));
        let count = config.pool_size;

        // Build shared resources
        let texture: Handle<Image> = asset_server.load(creature_type.texture_path);
        let quad_mesh = meshes.add(build_billboard_quad(creature_type.sprite_size));

        let anim_data: Vec<SpriteAnimData> =
            (0..count).map(|_| SpriteAnimData::default()).collect();
        let anim_buffer = buffers.add(ShaderStorageBuffer::from(anim_data.clone()));

        let material = atlas_materials.add(SpriteAtlasMaterial {
            atlas: texture,
            anim_data: anim_buffer.clone(),
            atlas_grid: UVec2::new(creature_type.sheet_cols, creature_type.sheet_rows),
            tint: LinearRgba::WHITE,
        });

        // Store in atlas pool
        let entry_idx = atlas_pool.entries.len();
        atlas_pool.entries.push(SpriteAtlasEntry {
            type_key: creature_type.npc_ref,
            material: material.clone(),
            anim_buffer: anim_buffer.clone(),
            anim_data,
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
                DirectionModel::FourWay { quadrant_to_row } => idle_anim.base_row + direction,
            };

            // Spawn blob shadow
            let shadow_entity = if let Some(ref bs) = blob_shadow {
                Some(
                    commands
                        .spawn((
                            Mesh3d(bs.mesh.clone()),
                            MeshMaterial3d(bs.material.clone()),
                            Transform::from_xyz(0.0, -100.0, 0.0),
                            Visibility::Hidden,
                            crate::game::weather::BlobShadow {
                                anchor: Vec3::new(0.0, -100.0, 0.0),
                                radius: creature_type.sprite_size
                                    * creature_type.shadow_radius_factor,
                                object_height: creature_type.sprite_size
                                    * creature_type.shadow_height_factor,
                            },
                        ))
                        .id(),
                )
            } else {
                None
            };

            let mut entity = commands.spawn((
                Mesh3d(quad_mesh.clone()),
                MeshMaterial3d(material.clone()),
                MeshTag(i as u32),
                Transform::from_xyz(0.0, -100.0, 0.0),
                Visibility::Hidden,
                NoFrustumCulling,
                NotShadowCaster,
                Creature {
                    npc_id,
                    render_kind: RenderKind::Sprite,
                    state: CreatureState::Pooled,
                    slot_seed: seed,
                    assigned_slot: None,
                    anchor: Vec3::new(0.0, -100.0, 0.0),
                    phase,
                    mat_handle: Handle::default(),
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
                CreaturePoolIndex(i as u32),
                SpriteCreatureMarker {
                    type_key: creature_type.npc_ref,
                    patrol_step: (hash_f32(seed * 97 + 31) * 1000.0) as u32,
                    direction,
                    anim_base_row: idle_anim.base_row,
                    anim_frame_count: idle_anim.frame_count,
                    active_move_speed: 0.0,
                },
            ));

            // Add brain if creature type has a behavior tree
            if creature_type.behavior_tree.is_some() {
                entity.insert(CreatureBrain::new());
            }

            if let Some(se) = shadow_entity {
                entity.insert(CreatureShadowLink(se));
            }
        }

        info!(
            "[generic] spawned {} '{}' entities (atlas instanced)",
            count, creature_type.npc_ref
        );
    }
}
