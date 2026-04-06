//! Client-side handler for server creature state corrections.
//!
//! When the server sends a `CreatureStateEvent`, it overrides the local
//! deterministic behavior with a correction (damage, death, forced flee, etc.).

use bevy::prelude::*;
use lightyear::prelude::*;

use super::super::creature::{Creature, CreaturePoolIndex, SpriteData, SpriteHopState};
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

/// System that receives periodic `CreaturePositionSync` messages from the server
/// and corrects local creature simulation state to match.
///
/// Strategy:
/// - **Idle creatures**: snap anchor to server position so the next hop starts
///   from the correct spot. Sync patrol_step so future decisions align.
/// - **Moving/airborne creatures**: do NOT touch anchor or hop state — let the
///   current animation finish naturally. Only sync patrol_step so the *next*
///   decision after landing will match the server.
/// - **Large drift (>15u)**: force-snap regardless of state (creature recycled
///   on server but not on client).
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
                    if dist > 15.0 {
                        cr.anchor = server_pos;
                        sd.facing_left = snapshot.facing_left;
                        sd.hop_state = SpriteHopState::Idle { timer: 0.5 };
                        break;
                    }

                    // Only correct position for idle/landing creatures.
                    // Airborne creatures finish their hop naturally — the
                    // patrol_step sync above ensures the next hop aligns.
                    match sd.hop_state {
                        SpriteHopState::Idle { .. } | SpriteHopState::Landing { .. } => {
                            cr.anchor = cr.anchor.lerp(server_pos, 0.5);
                            sd.facing_left = snapshot.facing_left;
                        }
                        _ => {
                            // Moving — don't touch position or facing
                        }
                    }

                    break; // Found the creature
                }
            }
        }
    }
}
