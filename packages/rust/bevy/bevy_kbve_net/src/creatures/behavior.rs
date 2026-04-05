//! Lightweight behavior tree — deterministic, `Send + Sync`, evaluated off-thread.
//!
//! Trees are static data (no closures, no ECS access). Evaluation takes a
//! [`WorldSnapshot`] captured on the main thread and produces a [`CreatureIntent`].

use bevy::prelude::Vec3;

use super::common::hash_f32;

// ---------------------------------------------------------------------------
// Behavior tree nodes
// ---------------------------------------------------------------------------

/// A node in the behavior tree. Fully deterministic given the same snapshot+seed.
#[derive(Clone, Debug)]
pub enum BehaviorNode {
    // --- Composites ---
    /// Run children in order. Succeed if all succeed, fail on first failure.
    Sequence(Vec<BehaviorNode>),
    /// Try children in order. Succeed on first success, fail if all fail.
    Selector(Vec<BehaviorNode>),

    // --- Decorators ---
    /// Only evaluate child if random roll (from seed) is below probability.
    Chance {
        probability: f32,
        child: Box<BehaviorNode>,
    },

    // --- Conditions (leaf, no side effects) ---
    /// True if nearest player is within radius.
    PlayerNearby { radius: f32 },
    /// True if nearest player is farther than radius.
    PlayerFar { radius: f32 },
    /// True if creature is currently idle (no active intent).
    IsIdle,
    /// True during daytime hours.
    IsDay,
    /// True during nighttime hours.
    IsNight,

    // --- Actions (leaf, produce CreatureIntent) ---
    /// Wander to a random nearby position.
    Wander {
        min_dist: f32,
        max_dist: f32,
        speed: f32,
        anim: &'static str,
    },
    /// Flee away from the nearest player.
    Flee { speed: f32, anim: &'static str },
    /// Play an emote animation in place.
    Emote { anim: &'static str, repeat: u32 },
    /// Enter idle state for a random duration.
    Idle { min: f32, max: f32 },
}

// ---------------------------------------------------------------------------
// World snapshot — captured on main thread, sent to task
// ---------------------------------------------------------------------------

/// Lightweight snapshot of the world state relevant to one creature's decision.
/// All fields must be `Send` — no ECS references.
pub struct WorldSnapshot {
    pub creature_pos: Vec3,
    pub nearest_player_dist: f32,
    pub nearest_player_dir: Vec3,
    pub game_hour: f32,
    pub patrol_seed: u32,
    pub is_idle: bool,
    /// Terrain height at the creature's anchor.
    pub ground_at_anchor: f32,
}

// ---------------------------------------------------------------------------
// Creature intent — result of tree evaluation
// ---------------------------------------------------------------------------

/// What the creature should do next. Produced by behavior tree evaluation,
/// consumed by the animate system to drive state transitions.
#[derive(Clone, Debug, Default)]
pub enum CreatureIntent {
    #[default]
    None,
    MoveTo {
        target: Vec3,
        speed: f32,
        anim_name: &'static str,
    },
    Emote {
        anim_name: &'static str,
        repeat: u32,
    },
    SetIdle {
        duration: f32,
    },
    Flee {
        direction: Vec3,
        speed: f32,
        anim_name: &'static str,
    },
}

// ---------------------------------------------------------------------------
// Tree evaluation — pure function, no ECS, deterministic
// ---------------------------------------------------------------------------

/// Result of evaluating a single node.
enum NodeResult {
    Success(CreatureIntent),
    Failure,
}

/// Evaluate a behavior tree given a world snapshot. Returns the first
/// successful action intent, or `CreatureIntent::None` if the tree fails.
pub fn evaluate(node: &BehaviorNode, snap: &WorldSnapshot) -> CreatureIntent {
    match eval_node(node, snap) {
        NodeResult::Success(intent) => intent,
        NodeResult::Failure => CreatureIntent::None,
    }
}

fn eval_node(node: &BehaviorNode, snap: &WorldSnapshot) -> NodeResult {
    match node {
        // --- Composites ---
        BehaviorNode::Sequence(children) => {
            let mut last_intent = CreatureIntent::None;
            for child in children {
                match eval_node(child, snap) {
                    NodeResult::Success(intent) => last_intent = intent,
                    NodeResult::Failure => return NodeResult::Failure,
                }
            }
            NodeResult::Success(last_intent)
        }
        BehaviorNode::Selector(children) => {
            for child in children {
                if let result @ NodeResult::Success(_) = eval_node(child, snap) {
                    return result;
                }
            }
            NodeResult::Failure
        }

        // --- Decorators ---
        BehaviorNode::Chance { probability, child } => {
            let roll = hash_f32(snap.patrol_seed.wrapping_mul(31).wrapping_add(7));
            if roll < *probability {
                eval_node(child, snap)
            } else {
                NodeResult::Failure
            }
        }

        // --- Conditions ---
        BehaviorNode::PlayerNearby { radius } => {
            if snap.nearest_player_dist <= *radius {
                NodeResult::Success(CreatureIntent::None)
            } else {
                NodeResult::Failure
            }
        }
        BehaviorNode::PlayerFar { radius } => {
            if snap.nearest_player_dist > *radius {
                NodeResult::Success(CreatureIntent::None)
            } else {
                NodeResult::Failure
            }
        }
        BehaviorNode::IsIdle => {
            if snap.is_idle {
                NodeResult::Success(CreatureIntent::None)
            } else {
                NodeResult::Failure
            }
        }
        BehaviorNode::IsDay => {
            if snap.game_hour >= 7.0 && snap.game_hour <= 18.0 {
                NodeResult::Success(CreatureIntent::None)
            } else {
                NodeResult::Failure
            }
        }
        BehaviorNode::IsNight => {
            if snap.game_hour >= 19.0 || snap.game_hour < 5.5 {
                NodeResult::Success(CreatureIntent::None)
            } else {
                NodeResult::Failure
            }
        }

        // --- Actions ---
        BehaviorNode::Wander {
            min_dist,
            max_dist,
            speed,
            anim,
        } => {
            let angle = hash_f32(snap.patrol_seed.wrapping_add(100)) * std::f32::consts::TAU;
            let dist =
                min_dist + hash_f32(snap.patrol_seed.wrapping_add(200)) * (max_dist - min_dist);
            let target = Vec3::new(
                snap.creature_pos.x + angle.cos() * dist,
                snap.ground_at_anchor,
                snap.creature_pos.z + angle.sin() * dist,
            );
            NodeResult::Success(CreatureIntent::MoveTo {
                target,
                speed: *speed,
                anim_name: anim,
            })
        }
        BehaviorNode::Flee { speed, anim } => {
            let flee_dir = if snap.nearest_player_dir.length_squared() > 0.001 {
                -snap.nearest_player_dir.normalize_or_zero()
            } else {
                let angle = hash_f32(snap.patrol_seed.wrapping_add(500)) * std::f32::consts::TAU;
                Vec3::new(angle.cos(), 0.0, angle.sin())
            };
            NodeResult::Success(CreatureIntent::Flee {
                direction: flee_dir,
                speed: *speed,
                anim_name: anim,
            })
        }
        BehaviorNode::Emote { anim, repeat } => NodeResult::Success(CreatureIntent::Emote {
            anim_name: anim,
            repeat: *repeat,
        }),
        BehaviorNode::Idle { min, max } => {
            let duration = min + hash_f32(snap.patrol_seed.wrapping_add(300)) * (max - min);
            NodeResult::Success(CreatureIntent::SetIdle { duration })
        }
    }
}
