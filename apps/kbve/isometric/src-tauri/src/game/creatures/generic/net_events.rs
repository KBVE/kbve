//! Client-side handler for server creature state corrections.
//!
//! Creatures are matched by server-assigned ULID (`CreatureId`) for reliable
//! identification. Falls back to `(npc_ref, pool_index)` for entities that
//! haven't received a ULID yet (first sync after spawn).

use std::collections::HashMap;

use bevy::prelude::*;
use lightyear::prelude::*;

use super::super::creature::{Creature, CreaturePoolIndex, RenderKind, SpriteData, SpriteHopState};
use super::behavior::CreatureIntent;
use super::brain::CreatureBrain;
use super::types::SpriteCreatureMarker;
use bevy_kbve_net::creatures::types::CreatureId;
use bevy_kbve_net::{CreatureEventKind, CreaturePositionSync, CreatureStateEvent};

// ---------------------------------------------------------------------------
// ULID → Entity index
// ---------------------------------------------------------------------------

/// O(1) lookup from server-assigned creature ULID to local ECS entity.
/// Built incrementally as sync messages arrive.
#[derive(Resource, Default)]
pub struct CreatureIdIndex(pub HashMap<u128, Entity>);

/// Rebuild the index from all entities that have a `CreatureId`.
/// Runs once per frame before sync reception to stay current.
pub fn update_creature_id_index(
    mut index: ResMut<CreatureIdIndex>,
    q: Query<(Entity, &CreatureId)>,
) {
    index.0.clear();
    for (entity, cid) in &q {
        let key: u128 = cid.as_u128();
        index.0.insert(key, entity);
    }
}

// ---------------------------------------------------------------------------
// State event corrections (damage, death, flee, capture)
// ---------------------------------------------------------------------------

/// System that receives `CreatureStateEvent` messages from the server and
/// overrides the local creature's behavior intent.
pub fn receive_creature_events(
    mut receiver_q: Query<&mut MessageReceiver<CreatureStateEvent>, With<Connected>>,
    mut creature_q: Query<(
        &SpriteCreatureMarker,
        &CreaturePoolIndex,
        &mut SpriteData,
        Option<&mut CreatureBrain>,
    )>,
) {
    for mut receiver in &mut receiver_q {
        for event in receiver.receive() {
            for (marker, pool_idx, mut sd, brain) in &mut creature_q {
                if marker.type_key != event.npc_ref.as_str() {
                    continue;
                }
                if pool_idx.0 != event.creature_index {
                    continue;
                }

                match &event.event {
                    CreatureEventKind::TakeDamage { .. } => {
                        if let Some(mut brain) = brain {
                            brain.intent = CreatureIntent::Flee {
                                direction: Vec3::new(0.0, 0.0, -1.0),
                                speed: 5.0,
                                anim_name: "run",
                            };
                        }
                    }
                    CreatureEventKind::Die => {
                        sd.hop_state = SpriteHopState::Idle { timer: f32::MAX };
                    }
                    CreatureEventKind::ForceFlee { from_x, from_z } => {
                        if let Some(mut brain) = brain {
                            let flee_dir = Vec3::new(-from_x, 0.0, -from_z).normalize_or_zero();
                            brain.intent = CreatureIntent::Flee {
                                direction: flee_dir,
                                speed: 5.0,
                                anim_name: "run",
                            };
                        }
                    }
                    CreatureEventKind::Captured { .. } => {
                        sd.hop_state = SpriteHopState::Idle { timer: f32::MAX };
                    }
                }

                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Position sync (sprite creatures)
// ---------------------------------------------------------------------------

/// Minimum drift to trigger a correction hop.
const SYNC_MIN_DRIFT: f32 = 0.5;
/// Above this distance, force-snap (creature recycled on server).
const SYNC_FORCE_SNAP: f32 = 15.0;

/// Receives `CreaturePositionSync` for sprite creatures.
/// Matches by ULID first (O(1) via `CreatureIdIndex`), falls back to
/// `(npc_ref, pool_index)` for entities that haven't received a ULID yet.
pub fn receive_creature_sync(
    mut commands: Commands,
    index: Res<CreatureIdIndex>,
    mut receiver_q: Query<&mut MessageReceiver<CreaturePositionSync>, With<Connected>>,
    mut creature_q: Query<(
        Entity,
        &mut SpriteCreatureMarker,
        &CreaturePoolIndex,
        &mut Creature,
        &mut SpriteData,
    )>,
) {
    for mut receiver in &mut receiver_q {
        for sync in receiver.receive() {
            // Skip ambient creatures — handled by receive_ambient_creature_sync
            if ambient_npc_ref_to_render_kind(&sync.npc_ref).is_some() {
                continue;
            }

            for snapshot in &sync.snapshots {
                // Try ULID-first lookup (O(1))
                let matched_entity = if snapshot.creature_id != 0 {
                    index.0.get(&snapshot.creature_id).copied()
                } else {
                    None
                };

                // Fall back to (npc_ref, pool_index) scan if no ULID match
                let entity = matched_entity.or_else(|| {
                    creature_q.iter().find_map(|(e, marker, pool_idx, _, _)| {
                        if marker.type_key == sync.npc_ref.as_str()
                            && pool_idx.0 as u32 == snapshot.index
                        {
                            Some(e)
                        } else {
                            None
                        }
                    })
                });

                let Some(entity) = entity else {
                    continue;
                };

                let Ok((_, mut marker, _, mut cr, mut sd)) = creature_q.get_mut(entity) else {
                    continue;
                };

                // Assign/update ULID on this entity
                if snapshot.creature_id != 0 {
                    commands
                        .entity(entity)
                        .insert(CreatureId::from_u128(snapshot.creature_id));
                }

                let server_pos = Vec3::new(snapshot.x, snapshot.y, snapshot.z);
                marker.patrol_step = snapshot.patrol_step;

                let dist = cr.anchor.distance(server_pos);

                if dist > SYNC_FORCE_SNAP {
                    cr.anchor = server_pos;
                    sd.facing_left = snapshot.facing_left;
                    sd.hop_state = SpriteHopState::Idle { timer: 0.5 };
                    continue;
                }

                if dist < SYNC_MIN_DRIFT {
                    continue;
                }

                if let SpriteHopState::Idle { .. } = sd.hop_state {
                    sd.hop_state = SpriteHopState::JumpWindup { target: server_pos };
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Position sync (ambient creatures: fireflies, butterflies)
// ---------------------------------------------------------------------------

fn ambient_npc_ref_to_render_kind(npc_ref: &str) -> Option<RenderKind> {
    match npc_ref {
        "meadow-firefly" => Some(RenderKind::Emissive),
        "woodland-butterfly" => Some(RenderKind::Billboard),
        _ => None,
    }
}

/// Receives `CreaturePositionSync` for ambient creatures.
/// Uses ULID-first matching, falls back to `(render_kind, pool_index)`.
pub fn receive_ambient_creature_sync(
    mut commands: Commands,
    index: Res<CreatureIdIndex>,
    mut receiver_q: Query<&mut MessageReceiver<CreaturePositionSync>, With<Connected>>,
    mut creature_q: Query<
        (Entity, &mut Creature, &CreaturePoolIndex),
        Without<SpriteCreatureMarker>,
    >,
) {
    for mut receiver in &mut receiver_q {
        for sync in receiver.receive() {
            let Some(kind) = ambient_npc_ref_to_render_kind(&sync.npc_ref) else {
                continue;
            };

            for snapshot in &sync.snapshots {
                // ULID-first lookup
                let matched_entity = if snapshot.creature_id != 0 {
                    index.0.get(&snapshot.creature_id).copied()
                } else {
                    None
                };

                // Fall back to (render_kind, pool_index)
                let entity = matched_entity.or_else(|| {
                    creature_q.iter().find_map(|(e, cr, pool_idx)| {
                        if cr.render_kind == kind && pool_idx.0 == snapshot.index {
                            Some(e)
                        } else {
                            None
                        }
                    })
                });

                let Some(entity) = entity else {
                    continue;
                };

                let Ok((_, mut cr, _)) = creature_q.get_mut(entity) else {
                    continue;
                };

                if snapshot.creature_id != 0 {
                    commands
                        .entity(entity)
                        .insert(CreatureId::from_u128(snapshot.creature_id));
                }

                cr.anchor = Vec3::new(snapshot.x, snapshot.y, snapshot.z);
            }
        }
    }
}
