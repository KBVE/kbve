//! Skeleton archetype-specific behavior tree leaf nodes.
//!
//! Each archetype has unique abilities:
//! - **Melee**: builds scaffolding to climb cliffs when stuck
//! - **Mage**: teleports past obstacles
//! - **Archer**: shoots arrows from range, seeks vantage points

use crate::types::{BehaviorContext, BehaviorNode, NodeStatus, NpcCommand, NpcObservation};

// ---------------------------------------------------------------------------
// Shared condition: is the NPC stuck at a cliff?
// ---------------------------------------------------------------------------

/// Condition node: check if the NPC is stuck (position hasn't changed)
/// AND the target is above them (cliff). Reads from `flow_hint`.
pub struct IsStuckAtCliff;

impl BehaviorNode<NpcObservation, NpcCommand> for IsStuckAtCliff {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        // Check if we have an approach target that's significantly above us
        let Some(target) = observation.flow_hint.approach_target else {
            return (NodeStatus::Failure, vec![]);
        };

        let mob_y = observation.position[1];
        let target_y = target[1];

        // Target is above us by more than 1.5 blocks — cliff situation
        if target_y - mob_y > 1.5 {
            (NodeStatus::Success, vec![])
        } else {
            (NodeStatus::Failure, vec![])
        }
    }
}

// ---------------------------------------------------------------------------
// Melee: build scaffolding
// ---------------------------------------------------------------------------

/// Action node: place scaffolding at the mob's feet to climb up.
/// Emits a `PlaceBlock` command with "scaffolding" at (mob_x, mob_y, mob_z).
/// The scaffold auto-removes after `cleanup_ticks`.
pub struct BuildScaffold {
    /// Ticks until the placed scaffolding is auto-removed by Java.
    pub cleanup_ticks: u32,
}

impl BehaviorNode<NpcObservation, NpcCommand> for BuildScaffold {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let [x, y, z] = observation.position;

        // Place scaffolding at the mob's current position (one block above feet)
        let block_pos = [x.floor() as i64, y.ceil() as i64, z.floor() as i64];

        (
            NodeStatus::Success,
            vec![
                NpcCommand::PlaceBlock {
                    block_pos,
                    block_type: "scaffolding".to_string(),
                    cleanup_ticks: self.cleanup_ticks,
                },
                // After placing, move up onto the scaffold
                NpcCommand::MoveTo {
                    target: [x, y + 1.0, z],
                    speed: 1.0,
                },
            ],
        )
    }
}

// ---------------------------------------------------------------------------
// Mage: teleport
// ---------------------------------------------------------------------------

/// Action node: teleport to the approach target position.
/// Used when the mage can't walk to the target (cliff, wall, etc.).
pub struct TeleportToTarget;

impl BehaviorNode<NpcObservation, NpcCommand> for TeleportToTarget {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let Some(target) = observation.flow_hint.approach_target else {
            return (NodeStatus::Failure, vec![]);
        };

        (NodeStatus::Success, vec![NpcCommand::Teleport { target }])
    }
}

/// Condition node: check if a player is nearby but unreachable by walking
/// (flow field distance is much larger than straight-line distance, or
/// the target is above/below). Triggers teleport.
pub struct IsPathBlocked;

impl BehaviorNode<NpcObservation, NpcCommand> for IsPathBlocked {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let Some(flow_dist) = observation.flow_hint.player_distance else {
            return (NodeStatus::Failure, vec![]);
        };

        // Find straight-line distance to nearest hostile (player)
        let nearest_straight = observation
            .nearby_entities
            .iter()
            .filter(|e| e.is_hostile)
            .map(|e| {
                let dx = e.position[0] - observation.position[0];
                let dy = e.position[1] - observation.position[1];
                let dz = e.position[2] - observation.position[2];
                ((dx * dx + dy * dy + dz * dz).sqrt()) as u32
            })
            .min();

        let Some(straight_dist) = nearest_straight else {
            return (NodeStatus::Failure, vec![]);
        };

        // If flow distance is 3x+ the straight-line distance, path is blocked
        // (detour around walls/water). Or if we're within 16 blocks straight
        // but flow says 40+, something is in the way.
        if flow_dist > straight_dist * 3 && straight_dist < 20 {
            (NodeStatus::Success, vec![])
        } else {
            (NodeStatus::Failure, vec![])
        }
    }
}

// ---------------------------------------------------------------------------
// Archer: ranged attacks + vantage seeking
// ---------------------------------------------------------------------------

/// Action node: shoot an arrow at the nearest hostile player in range.
pub struct ShootAtTarget {
    /// Maximum range for shooting (blocks).
    pub range: f64,
    /// Arrow power (0.0-1.0).
    pub power: f32,
}

impl BehaviorNode<NpcObservation, NpcCommand> for ShootAtTarget {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let range_sq = self.range * self.range;

        let nearest = observation
            .nearby_entities
            .iter()
            .filter(|e| e.is_hostile)
            .filter(|e| {
                let dx = e.position[0] - observation.position[0];
                let dy = e.position[1] - observation.position[1];
                let dz = e.position[2] - observation.position[2];
                dx * dx + dy * dy + dz * dz <= range_sq
            })
            .min_by(|a, b| {
                let da = dist_sq(&observation.position, &a.position);
                let db = dist_sq(&observation.position, &b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        match nearest {
            Some(target) => (
                NodeStatus::Success,
                vec![NpcCommand::ShootArrow {
                    target_entity: target.entity_id,
                    power: self.power,
                }],
            ),
            None => (NodeStatus::Failure, vec![]),
        }
    }
}

/// Action node: move to a position that maintains distance from the target.
/// Archers don't want to close to melee — they back away if too close
/// and hold position if at optimal range.
pub struct MaintainRange {
    /// Ideal distance to keep from the target (blocks).
    pub ideal_range: f64,
    /// Minimum distance — back up if closer than this.
    pub min_range: f64,
}

impl BehaviorNode<NpcObservation, NpcCommand> for MaintainRange {
    fn evaluate(
        &self,
        observation: &NpcObservation,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcCommand>) {
        let nearest = observation
            .nearby_entities
            .iter()
            .filter(|e| e.is_hostile)
            .min_by(|a, b| {
                let da = dist_sq(&observation.position, &a.position);
                let db = dist_sq(&observation.position, &b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        let Some(target) = nearest else {
            return (NodeStatus::Failure, vec![]);
        };

        let dx = observation.position[0] - target.position[0];
        let dz = observation.position[2] - target.position[2];
        let dist = (dx * dx + dz * dz).sqrt();

        if dist < self.min_range {
            // Too close — back away
            let norm = dist.max(0.001);
            let retreat = [
                observation.position[0] + (dx / norm) * self.ideal_range,
                observation.position[1],
                observation.position[2] + (dz / norm) * self.ideal_range,
            ];
            (
                NodeStatus::Success,
                vec![NpcCommand::MoveTo {
                    target: retreat,
                    speed: 1.3,
                }],
            )
        } else if dist > self.ideal_range * 1.5 {
            // Too far — close the gap slightly (use flow field if available)
            if let Some(approach) = observation.flow_hint.approach_target {
                (
                    NodeStatus::Success,
                    vec![NpcCommand::MoveTo {
                        target: approach,
                        speed: 1.0,
                    }],
                )
            } else {
                (NodeStatus::Failure, vec![])
            }
        } else {
            // In the sweet spot — hold position, let ShootAtTarget handle offense
            (NodeStatus::Success, vec![NpcCommand::Idle { ticks: 10 }])
        }
    }
}

fn dist_sq(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx * dx + dy * dy + dz * dz
}
