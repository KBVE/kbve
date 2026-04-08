//! CreatureBrain — dispatches behavior tree evaluation to bevy_tasker,
//! polls results, and writes CreatureIntent for the animate system.

use bevy::prelude::*;
use crossbeam_channel::{Receiver, bounded};

use super::super::common::{GameTime, patrol_seed};
use super::super::creature::{Creature, SpriteData, SpriteHopState};
use super::behavior::{CreatureIntent, WorldSnapshot, evaluate};
use super::physics_lod::PlayerProximity;
use super::types::{SpriteCreatureMarker, SpriteCreatureTypes};

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
///
/// On mobile (PerfTier::Low), each creature only dispatches every 4th
/// frame (staggered by slot_seed) to reduce async task pressure.
pub fn dispatch_behavior_trees(
    game_time: Res<GameTime>,
    types: Res<SpriteCreatureTypes>,
    time: Res<Time>,
    perf_tier: Option<Res<crate::game::PerfTier>>,
    mut brain_q: Query<(
        &Creature,
        &SpriteData,
        &mut SpriteCreatureMarker,
        &mut CreatureBrain,
        Option<&PlayerProximity>,
    )>,
) {
    let is_low = perf_tier
        .map(|t| *t == crate::game::PerfTier::Low)
        .unwrap_or(false);
    // Approximate frame counter from elapsed time (good enough for staggering)
    let frame = (time.elapsed_secs() * 60.0) as u32;

    for (cr, sd, mut marker, mut brain, proximity) in &mut brain_q {
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

        // On Low tier, stagger dispatches: each creature fires every 4th
        // frame, offset by slot_seed so they don't all fire on the same frame.
        if is_low && (frame + cr.slot_seed) % 4 != 0 {
            continue;
        }

        // Look up behavior tree for this creature type
        let Some(ctype) = types.types.iter().find(|t| t.npc_ref == marker.type_key) else {
            continue;
        };
        let Some(ref tree) = ctype.behavior_tree else {
            continue;
        };

        // Read player proximity from cached component (updated by physics LOD system)
        let (nearest_dist, nearest_dir) = proximity
            .map(|p| (p.distance, p.direction))
            .unwrap_or((f32::MAX, Vec3::ZERO));

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
