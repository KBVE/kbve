//! Client-side handler for server creature state corrections.
//!
//! When the server sends a `CreatureStateEvent`, it overrides the local
//! deterministic behavior with a correction (damage, death, forced flee, etc.).

use bevy::prelude::*;
use lightyear::prelude::*;

use super::super::creature::{Creature, CreaturePoolIndex, RenderKind, SpriteData, SpriteHopState};
use super::behavior::CreatureIntent;
use super::brain::CreatureBrain;
use super::types::SpriteCreatureMarker;
use bevy_kbve_net::{CreatureEventKind, CreaturePositionSync, CreatureStateEvent};

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

                // Apply the server's correction
                match &event.event {
                    CreatureEventKind::TakeDamage { .. } => {
                        // Force flee intent — creature was hit
                        if let Some(mut brain) = brain {
                            brain.intent = CreatureIntent::Flee {
                                direction: Vec3::new(0.0, 0.0, -1.0), // flee south
                                speed: 5.0,
                                anim_name: "run",
                            };
                        }
                        info!(
                            "[creature-net] {} #{} took damage — forcing flee",
                            event.npc_ref, event.creature_index
                        );
                    }
                    CreatureEventKind::Die => {
                        // Hide the creature (death animation future work)
                        sd.hop_state = SpriteHopState::Idle { timer: f32::MAX };
                        info!(
                            "[creature-net] {} #{} died",
                            event.npc_ref, event.creature_index
                        );
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
                        info!(
                            "[creature-net] {} #{} forced flee",
                            event.npc_ref, event.creature_index
                        );
                    }
                    CreatureEventKind::Captured { by_player_id } => {
                        sd.hop_state = SpriteHopState::Idle { timer: f32::MAX };
                        info!(
                            "[creature-net] {} #{} captured by player {}",
                            event.npc_ref, event.creature_index, by_player_id
                        );
                    }
                }

                break; // Found the creature, no need to keep searching
            }
        }
    }
}

/// Minimum drift to trigger a correction hop (ignore tiny differences).
const SYNC_MIN_DRIFT: f32 = 0.5;
/// Above this distance, force-snap (creature recycled on server).
const SYNC_FORCE_SNAP: f32 = 15.0;

/// System that receives periodic `CreaturePositionSync` messages from the server
/// and corrects local creature positions using the movement system.
///
/// Strategy:
/// - **Idle + drifted**: inject a `MoveTo` intent so the creature naturally
///   hops toward the server position using existing animation.
/// - **Moving/airborne**: let the current action finish. Only sync patrol_step.
/// - **Large drift (>15u)**: force-snap (creature recycled on server).
/// - **Small drift (<0.5u)**: ignore — close enough.
pub fn receive_creature_sync(
    mut receiver_q: Query<&mut MessageReceiver<CreaturePositionSync>, With<Connected>>,
    mut creature_q: Query<(
        &mut SpriteCreatureMarker,
        &CreaturePoolIndex,
        &mut Creature,
        &mut SpriteData,
    )>,
) {
    for mut receiver in &mut receiver_q {
        for sync in receiver.receive() {
            for snapshot in &sync.snapshots {
                for (mut marker, pool_idx, mut cr, mut sd) in &mut creature_q {
                    if marker.type_key != sync.npc_ref.as_str() {
                        continue;
                    }
                    if pool_idx.0 as u32 != snapshot.index {
                        continue;
                    }

                    let server_pos = Vec3::new(snapshot.x, snapshot.y, snapshot.z);

                    // Always sync the deterministic patrol counter so future
                    // decisions align even if we skip the position correction.
                    marker.patrol_step = snapshot.patrol_step;

                    let dist = cr.anchor.distance(server_pos);

                    // Force-snap if very far off (creature recycled on server)
                    if dist > SYNC_FORCE_SNAP {
                        cr.anchor = server_pos;
                        sd.facing_left = snapshot.facing_left;
                        sd.hop_state = SpriteHopState::Idle { timer: 0.5 };
                        break;
                    }

                    // Ignore tiny drift
                    if dist < SYNC_MIN_DRIFT {
                        break;
                    }

                    // Only correct idle creatures — set JumpWindup so
                    // simulate_sprite_creatures picks the correct move anim
                    // and speed from the creature type's behavior definition.
                    // Frogs will hop, stags/wolves will run, etc.
                    if let SpriteHopState::Idle { .. } = sd.hop_state {
                        sd.hop_state = SpriteHopState::JumpWindup { target: server_pos };
                    }

                    break; // Found the creature
                }
            }
        }
    }
}

/// Map NPC ref strings to the client's RenderKind for ambient creatures.
fn ambient_npc_ref_to_render_kind(npc_ref: &str) -> Option<RenderKind> {
    match npc_ref {
        "meadow-firefly" => Some(RenderKind::Emissive),
        "woodland-butterfly" => Some(RenderKind::Billboard),
        _ => None,
    }
}

/// System that receives `CreaturePositionSync` for ambient creatures (fireflies,
/// butterflies) and smoothly corrects their anchors. Ambient creatures don't have
/// `SpriteCreatureMarker`, so this is a separate query.
pub fn receive_ambient_creature_sync(
    mut receiver_q: Query<&mut MessageReceiver<CreaturePositionSync>, With<Connected>>,
    mut creature_q: Query<(&mut Creature, &CreaturePoolIndex), Without<SpriteCreatureMarker>>,
) {
    for mut receiver in &mut receiver_q {
        for sync in receiver.receive() {
            let Some(kind) = ambient_npc_ref_to_render_kind(&sync.npc_ref) else {
                continue; // Not an ambient creature — handled by sprite sync
            };

            for snapshot in &sync.snapshots {
                for (mut cr, pool_idx) in &mut creature_q {
                    if cr.render_kind != kind {
                        continue;
                    }
                    if pool_idx.0 != snapshot.index {
                        continue;
                    }

                    let server_pos = Vec3::new(snapshot.x, snapshot.y, snapshot.z);
                    // Snap anchor — ambient creatures don't have hop state,
                    // their animate systems will smoothly use the new anchor.
                    cr.anchor = server_pos;

                    break;
                }
            }
        }
    }
}
