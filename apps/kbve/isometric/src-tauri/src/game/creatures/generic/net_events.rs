//! Client-side handler for server creature state corrections.
//!
//! Creatures are matched by server-assigned ULID (`CreatureId`) for reliable
//! identification. Falls back to `(npc_ref, pool_index)` for entities that
//! haven't received a ULID yet (first sync after spawn).

use std::collections::{HashMap, HashSet};

use bevy::prelude::*;
use lightyear::prelude::*;

use super::super::creature::{Creature, RenderKind, SpriteData, SpriteHopState};
use super::behavior::CreatureIntent;
use super::brain::CreatureBrain;
use super::types::SpriteCreatureMarker;
use bevy_kbve_net::creatures::types::CreatureId;
use bevy_kbve_net::{CreatureEventKind, CreaturePositionSync, CreatureStateEvent};

/// Index of server-assigned creature ULIDs to local ECS entities.
///
/// Two views are kept in sync:
/// - [`Self::by_ulid`] — O(1) lookup from ULID to entity (primary path).
/// - [`Self::indexed`] — O(1) "is this entity already bound to a ULID?" check.
///
/// The `indexed` mirror eliminates the O(N) `values().any(...)` scan that
/// previously sat inside per-snapshot fallback loops, turning the worst case
/// from O(N×K) to O(N) per snapshot. Both grow with the active creature pool.
#[derive(Resource, Default)]
pub struct CreatureIdIndex {
    pub by_ulid: HashMap<u128, Entity>,
    pub indexed: HashSet<Entity>,
}

impl CreatureIdIndex {
    /// O(1) — entity has been bound to a server ULID.
    #[inline]
    pub fn contains_entity(&self, entity: Entity) -> bool {
        self.indexed.contains(&entity)
    }

    /// O(1) — ULID lookup. Returns `None` if the creature isn't tracked yet.
    #[inline]
    pub fn entity_for_ulid(&self, ulid: u128) -> Option<Entity> {
        self.by_ulid.get(&ulid).copied()
    }
}

/// Rebuild the index from all entities that have a `CreatureId`.
/// Runs once per frame before sync reception to stay current.
pub fn update_creature_id_index(
    mut index: ResMut<CreatureIdIndex>,
    q: Query<(Entity, &CreatureId)>,
) {
    index.by_ulid.clear();
    index.indexed.clear();
    for (entity, cid) in &q {
        index.by_ulid.insert(cid.as_u128(), entity);
        index.indexed.insert(entity);
    }
}

/// System that receives `CreatureStateEvent` messages from the server and
/// overrides the local creature's behavior intent.
pub fn receive_creature_events(
    index: Res<CreatureIdIndex>,
    mut receiver_q: Query<&mut MessageReceiver<CreatureStateEvent>, With<Connected>>,
    mut creature_q: Query<(
        Entity,
        &SpriteCreatureMarker,
        &mut SpriteData,
        Option<&mut CreatureBrain>,
    )>,
) {
    for mut receiver in &mut receiver_q {
        for event in receiver.receive() {
            // Find entity by ULID
            let entity = if event.creature_id != 0 {
                index.entity_for_ulid(event.creature_id)
            } else {
                None
            };
            let Some(entity) = entity else {
                continue;
            };
            let Ok((_, _marker, mut sd, brain)) = creature_q.get_mut(entity) else {
                continue;
            };

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
        }
    }
}

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
                // ULID lookup (O(1))
                let entity = if snapshot.creature_id != 0 {
                    index.entity_for_ulid(snapshot.creature_id)
                } else {
                    None
                };

                // Fall back: find an unassigned creature of the same type.
                // O(N) total — the inner `contains_entity` check is O(1) via
                // the HashSet mirror, instead of the prior O(K) values() scan.
                let entity = entity.or_else(|| {
                    creature_q.iter().find_map(|(e, marker, _, _)| {
                        if marker.type_key == sync.npc_ref.as_str() && !index.contains_entity(e) {
                            Some(e)
                        } else {
                            None
                        }
                    })
                });

                let Some(entity) = entity else {
                    continue;
                };

                let Ok((_, mut marker, mut cr, mut sd)) = creature_q.get_mut(entity) else {
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
    mut creature_q: Query<(Entity, &mut Creature), Without<SpriteCreatureMarker>>,
) {
    for mut receiver in &mut receiver_q {
        for sync in receiver.receive() {
            let Some(kind) = ambient_npc_ref_to_render_kind(&sync.npc_ref) else {
                continue;
            };

            for snapshot in &sync.snapshots {
                // ULID lookup
                let entity = if snapshot.creature_id != 0 {
                    index.entity_for_ulid(snapshot.creature_id)
                } else {
                    None
                };

                // Fall back: find unassigned creature of matching render kind.
                // O(N) total — see `receive_creature_sync` for rationale.
                let entity = entity.or_else(|| {
                    creature_q.iter().find_map(|(e, cr)| {
                        if cr.render_kind == kind && !index.contains_entity(e) {
                            Some(e)
                        } else {
                            None
                        }
                    })
                });

                let Some(entity) = entity else {
                    continue;
                };

                let Ok((_, mut cr)) = creature_q.get_mut(entity) else {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_for_ulid_returns_inserted_entity() {
        let mut idx = CreatureIdIndex::default();
        let e = Entity::from_bits(7u64);
        idx.by_ulid.insert(0xdead_beef, e);
        idx.indexed.insert(e);

        assert_eq!(idx.entity_for_ulid(0xdead_beef), Some(e));
        assert_eq!(idx.entity_for_ulid(0xfeed_face), None);
    }

    #[test]
    fn contains_entity_is_true_only_after_insertion() {
        let mut idx = CreatureIdIndex::default();
        let e = Entity::from_bits(42u64);
        assert!(!idx.contains_entity(e));
        idx.indexed.insert(e);
        assert!(idx.contains_entity(e));
        // A different entity must not register as indexed.
        assert!(!idx.contains_entity(Entity::from_bits(43u64)));
    }

    #[test]
    fn indexed_mirror_stays_aligned_with_by_ulid() {
        // Simulates the body of `update_creature_id_index` — both views must
        // hold identical entity sets after a rebuild.
        let mut idx = CreatureIdIndex::default();
        for (ulid, raw) in [(1u128, 10u64), (2, 20), (3, 30)] {
            let e = Entity::from_bits(raw);
            idx.by_ulid.insert(ulid, e);
            idx.indexed.insert(e);
        }
        assert_eq!(idx.by_ulid.len(), idx.indexed.len());
        for &e in idx.by_ulid.values() {
            assert!(idx.contains_entity(e));
        }
    }

    #[test]
    fn fallback_check_is_o1_via_hashset() {
        // Regression guard: replacing `values().any(...)` with
        // `contains_entity()` must keep equivalent semantics.
        let mut idx = CreatureIdIndex::default();
        let bound = Entity::from_bits(1u64);
        let unbound = Entity::from_bits(2u64);
        idx.by_ulid.insert(99, bound);
        idx.indexed.insert(bound);

        assert!(idx.contains_entity(bound));
        assert!(!idx.contains_entity(unbound));
    }
}
