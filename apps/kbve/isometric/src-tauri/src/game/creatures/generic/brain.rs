//! CreatureBrain — dispatches behavior tree evaluation to bevy_tasker,
//! polls results, and writes CreatureIntent for the animate system.

use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender, bounded};

use super::super::common::{GameTime, hash_f32, patrol_seed, scene_center};
use super::super::creature::{Creature, SpriteData, SpriteHopState};
use super::behavior::{BehaviorNode, CreatureIntent, WorldSnapshot, evaluate};
use super::types::{SpriteCreatureMarker, SpriteCreatureTypes};
use crate::game::camera::IsometricCamera;
use crate::game::player::Player;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/// Per-entity brain: holds the behavior tree reference and current intent.
#[derive(Component)]
pub struct CreatureBrain {
    /// Current intent (consumed by animate system).
    pub intent: CreatureIntent,
    /// Channel receiver for async evaluation results.
    rx: Option<Receiver<CreatureIntent>>,
    /// True while an async evaluation is in-flight.
    pending: bool,
}

impl CreatureBrain {
    pub fn new() -> Self {
        Self {
            intent: CreatureIntent::None,
            rx: None,
            pending: false,
        }
    }
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

/// Capture world snapshots for idle creatures and dispatch behavior tree
/// evaluation to bevy_tasker. Only evaluates when the creature is idle
/// (no pending intent and not currently moving/emoting).
pub fn dispatch_behavior_trees(
    game_time: Res<GameTime>,
    types: Res<SpriteCreatureTypes>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    player_q: Query<&Transform, With<Player>>,
    mut brain_q: Query<(
        &Creature,
        &SpriteData,
        &mut SpriteCreatureMarker,
        &mut CreatureBrain,
    )>,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let center = scene_center(cam_tf.translation);

    // Collect player positions for proximity check
    let player_positions: Vec<Vec3> = player_q.iter().map(|t| t.translation).collect();

    for (cr, sd, mut marker, mut brain) in &mut brain_q {
        // Skip if already has a pending evaluation or active intent
        if brain.pending {
            continue;
        }
        if !matches!(brain.intent, CreatureIntent::None) {
            continue;
        }
        // Only evaluate when creature is idle
        if !matches!(sd.hop_state, SpriteHopState::Idle { .. }) {
            continue;
        }
        // Skip pooled/hidden creatures
        if cr.anchor.y < -50.0 {
            continue;
        }

        // Look up behavior tree for this creature type
        let Some(ctype) = types.types.iter().find(|t| t.npc_ref == marker.type_key) else {
            continue;
        };
        let Some(ref tree) = ctype.behavior_tree else {
            continue;
        };

        // Build world snapshot
        let (nearest_dist, nearest_dir) = nearest_player(&player_positions, cr.anchor);

        marker.patrol_step = marker.patrol_step.wrapping_add(1);
        let ps = patrol_seed(cr.slot_seed, marker.patrol_step, game_time.creature_seed);

        let snap = WorldSnapshot {
            creature_pos: cr.anchor,
            nearest_player_dist: nearest_dist,
            nearest_player_dir: nearest_dir,
            game_hour: game_time.hour,
            patrol_seed: ps,
            is_idle: true,
            ground_at_anchor: cr.anchor.y,
        };

        // Clone the tree for the async task (it's just enums, cheap)
        let tree_clone = tree.clone();

        // Dispatch to bevy_tasker
        let (tx, rx) = bounded::<CreatureIntent>(1);
        bevy_tasker::spawn(async move {
            let intent = evaluate(&tree_clone, &snap);
            let _ = tx.send(intent);
        })
        .detach();

        brain.rx = Some(rx);
        brain.pending = true;
    }
}

/// Poll completed behavior tree evaluations and write results as CreatureIntent.
pub fn poll_behavior_results(mut brain_q: Query<&mut CreatureBrain>) {
    for mut brain in &mut brain_q {
        if !brain.pending {
            continue;
        }
        let Some(ref rx) = brain.rx else {
            brain.pending = false;
            continue;
        };
        match rx.try_recv() {
            Ok(intent) => {
                brain.intent = intent;
                brain.rx = None;
                brain.pending = false;
            }
            Err(crossbeam_channel::TryRecvError::Empty) => {
                // Still computing — wait
            }
            Err(crossbeam_channel::TryRecvError::Disconnected) => {
                // Task dropped without sending — reset
                brain.rx = None;
                brain.pending = false;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Find the nearest player distance and direction from a creature position.
fn nearest_player(player_positions: &[Vec3], creature_pos: Vec3) -> (f32, Vec3) {
    let mut best_dist = f32::MAX;
    let mut best_dir = Vec3::ZERO;
    for &pos in player_positions {
        let diff = pos - creature_pos;
        let dist = diff.length();
        if dist < best_dist {
            best_dist = dist;
            best_dir = diff;
        }
    }
    (best_dist, best_dir)
}
