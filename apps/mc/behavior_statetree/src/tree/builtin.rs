//! Built-in behavior tree leaf nodes.

use crate::types::{NpcCommand, NpcObservation};

use super::node::{BehaviorNode, NodeStatus};

/// Wander randomly within a radius of the NPC's current position.
pub struct Wander {
    pub radius: f64,
}

impl BehaviorNode for Wander {
    fn evaluate(&self, observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>) {
        let [x, y, z] = observation.position;
        // Simple deterministic offset based on tick for reproducibility
        let angle = (observation.tick as f64 * 0.1) % std::f64::consts::TAU;
        let target = [
            x + angle.cos() * self.radius,
            y,
            z + angle.sin() * self.radius,
        ];
        (NodeStatus::Success, vec![NpcCommand::MoveTo { target }])
    }
}

/// Flee from the nearest hostile entity.
pub struct Flee {
    pub flee_distance: f64,
}

impl BehaviorNode for Flee {
    fn evaluate(&self, observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>) {
        let nearest_hostile = observation
            .nearby_entities
            .iter()
            .filter(|e| e.is_hostile)
            .min_by(|a, b| {
                let da = dist_sq(&observation.position, &a.position);
                let db = dist_sq(&observation.position, &b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        let Some(hostile) = nearest_hostile else {
            return (NodeStatus::Failure, vec![]);
        };

        let [nx, ny, nz] = observation.position;
        let [hx, _hy, hz] = hostile.position;
        let dx = nx - hx;
        let dz = nz - hz;
        let dist = (dx * dx + dz * dz).sqrt().max(0.001);
        let target = [
            nx + (dx / dist) * self.flee_distance,
            ny,
            nz + (dz / dist) * self.flee_distance,
        ];

        (NodeStatus::Success, vec![NpcCommand::MoveTo { target }])
    }
}

/// Attack the nearest hostile entity if within range.
pub struct AttackNearest {
    pub range: f64,
}

impl BehaviorNode for AttackNearest {
    fn evaluate(&self, observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>) {
        let nearest_hostile = observation
            .nearby_entities
            .iter()
            .filter(|e| e.is_hostile)
            .filter(|e| dist_sq(&observation.position, &e.position).sqrt() <= self.range)
            .min_by(|a, b| {
                let da = dist_sq(&observation.position, &a.position);
                let db = dist_sq(&observation.position, &b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        match nearest_hostile {
            Some(hostile) => (
                NodeStatus::Success,
                vec![NpcCommand::Attack {
                    target_entity: hostile.entity_id,
                }],
            ),
            None => (NodeStatus::Failure, vec![]),
        }
    }
}

/// Check if the NPC's health is below a threshold (condition node).
pub struct IsHealthLow {
    pub threshold: f32,
}

impl BehaviorNode for IsHealthLow {
    fn evaluate(&self, observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>) {
        if observation.health < self.threshold {
            (NodeStatus::Success, vec![])
        } else {
            (NodeStatus::Failure, vec![])
        }
    }
}

/// Idle for a number of ticks.
pub struct Idle {
    pub ticks: u32,
}

impl BehaviorNode for Idle {
    fn evaluate(&self, _observation: &NpcObservation) -> (NodeStatus, Vec<NpcCommand>) {
        (
            NodeStatus::Success,
            vec![NpcCommand::Idle { ticks: self.ticks }],
        )
    }
}

fn dist_sq(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx * dx + dy * dy + dz * dz
}
