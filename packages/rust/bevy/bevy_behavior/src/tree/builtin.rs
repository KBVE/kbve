//! Built-in behavior tree leaf nodes.
//!
//! Generic over any observation type that implements the relevant
//! observation traits ([`Positioned`], [`Healthed`], [`Aware`],
//! [`Ticked`]) plus any action type that can be constructed from the
//! provided factory closures. This keeps the leaves game-agnostic while
//! each game supplies its own command enum (MC's `NpcCommand`,
//! Isometric's `BattleAction`, etc.).

use crate::cooldown::BehaviorContext;
use crate::observation::{Aware, Healthed, Positioned, Ticked, dist_sq};

use super::{BehaviorNode, NodeStatus};

/// Succeeds if health is below `threshold` (absolute HP, not a fraction).
///
/// Pure condition node — emits no commands.
pub struct IsHealthLow {
    /// Absolute HP value below which the node succeeds.
    pub threshold: f32,
}

impl<O, A> BehaviorNode<O, A> for IsHealthLow
where
    O: Healthed + Send + Sync,
    A: Send + Sync,
{
    fn evaluate(&self, observation: &O, _ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
        if observation.current_health() < self.threshold {
            (NodeStatus::Success, vec![])
        } else {
            (NodeStatus::Failure, vec![])
        }
    }
}

/// Succeeds if any hostile entity is within the observation's nearby list.
///
/// Pure condition node — emits no commands.
pub struct HasHostileNearby;

impl<O, A> BehaviorNode<O, A> for HasHostileNearby
where
    O: Aware + Send + Sync,
    A: Send + Sync,
{
    fn evaluate(&self, observation: &O, _ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
        if observation.nearby_entities().iter().any(|e| e.is_hostile) {
            (NodeStatus::Success, vec![])
        } else {
            (NodeStatus::Failure, vec![])
        }
    }
}

/// Wander randomly within `radius` of the current position.
///
/// The caller supplies `make_move` — a closure that turns a target
/// position and walking-speed multiplier into the game's action type.
///
/// Wander is deterministic per tick — the angle derives from
/// `tick * 0.1`, so the same NPC at the same tick always picks the
/// same target. Pair with a per-NPC seed if you want randomness.
pub struct Wander<F> {
    /// Maximum displacement from the current position.
    pub radius: f64,
    /// Factory turning `(target_pos, speed_mult)` into the game's
    /// action type.
    pub make_move: F,
}

impl<O, A, F> BehaviorNode<O, A> for Wander<F>
where
    O: Positioned + Ticked + Send + Sync,
    A: Send + Sync,
    F: Fn([f64; 3], f64) -> A + Send + Sync,
{
    fn evaluate(&self, observation: &O, _ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
        let [x, y, z] = observation.position();
        let angle = (observation.tick() as f64 * 0.1) % std::f64::consts::TAU;
        let target = [
            x + angle.cos() * self.radius,
            y,
            z + angle.sin() * self.radius,
        ];
        (NodeStatus::Success, vec![(self.make_move)(target, 1.0)])
    }
}

/// Flee from the nearest hostile entity.
///
/// Picks the closest hostile in `observation.nearby_entities()` and
/// emits a single move command toward a point `flee_distance` units
/// away in the opposite direction (XZ plane only — Y is preserved so
/// flat-ground games don't try to fly).
///
/// `make_move` converts `(target_pos, speed_mult)` into the game's
/// action type.
///
/// # Returns
///
/// [`NodeStatus::Success`] with one move command when a hostile is
/// found; [`NodeStatus::Failure`] when there are no hostiles nearby.
pub struct Flee<F> {
    /// Distance to flee in the direction away from the nearest hostile.
    pub flee_distance: f64,
    /// Factory turning `(target_pos, speed_mult)` into the game's
    /// action type. Speed multiplier is `1.4` (sprint).
    pub make_move: F,
}

impl<O, A, F> BehaviorNode<O, A> for Flee<F>
where
    O: Positioned + Aware + Send + Sync,
    A: Send + Sync,
    F: Fn([f64; 3], f64) -> A + Send + Sync,
{
    fn evaluate(&self, observation: &O, _ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
        let pos = observation.position();
        let nearest_hostile = observation
            .nearby_entities()
            .iter()
            .filter(|e| e.is_hostile)
            .min_by(|a, b| {
                let da = dist_sq(&pos, &a.position);
                let db = dist_sq(&pos, &b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        let Some(hostile) = nearest_hostile else {
            return (NodeStatus::Failure, vec![]);
        };

        let [nx, ny, nz] = pos;
        let [hx, _hy, hz] = hostile.position;
        let dx = nx - hx;
        let dz = nz - hz;
        let dist = (dx * dx + dz * dz).sqrt().max(0.001);
        let target = [
            nx + (dx / dist) * self.flee_distance,
            ny,
            nz + (dz / dist) * self.flee_distance,
        ];

        (NodeStatus::Success, vec![(self.make_move)(target, 1.4)])
    }
}

/// Attack the nearest hostile entity within `range`.
///
/// `make_attack` converts a target `entity_id` into the game's action
/// type.
///
/// # Returns
///
/// [`NodeStatus::Success`] with one attack command when a hostile is
/// in range; [`NodeStatus::Failure`] otherwise.
pub struct AttackNearest<F> {
    /// Maximum distance at which the NPC will engage.
    pub range: f64,
    /// Factory turning `entity_id` into the game's action type.
    pub make_attack: F,
}

impl<O, A, F> BehaviorNode<O, A> for AttackNearest<F>
where
    O: Positioned + Aware + Send + Sync,
    A: Send + Sync,
    F: Fn(u64) -> A + Send + Sync,
{
    fn evaluate(&self, observation: &O, _ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
        let pos = observation.position();
        let nearest = observation
            .nearby_entities()
            .iter()
            .filter(|e| e.is_hostile)
            .filter(|e| dist_sq(&pos, &e.position).sqrt() <= self.range)
            .min_by(|a, b| {
                let da = dist_sq(&pos, &a.position);
                let db = dist_sq(&pos, &b.position);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

        match nearest {
            Some(hostile) => (
                NodeStatus::Success,
                vec![(self.make_attack)(hostile.entity_id)],
            ),
            None => (NodeStatus::Failure, vec![]),
        }
    }
}

/// Call for help when health drops below threshold and hostiles are nearby.
///
/// Checks both the per-NPC and the global cooldown via [`BehaviorContext`]
/// before emitting. On success, marks both cooldowns fired so callers
/// don't spam the broadcast.
///
/// `make_actions` produces the game-specific commands (chat broadcast +
/// spawn reinforcements, etc.).
///
/// # Returns
///
/// [`NodeStatus::Success`] with the actions from `make_actions` when:
/// hostiles are nearby AND health is below `health_threshold` AND both
/// cooldowns are ready. Otherwise [`NodeStatus::Failure`].
pub struct CallAllies<F> {
    /// Absolute HP value below which the NPC will broadcast.
    pub health_threshold: f32,
    /// Factory producing the broadcast actions (chat, spawn allies, etc.).
    pub make_actions: F,
}

impl<O, A, F> BehaviorNode<O, A> for CallAllies<F>
where
    O: Healthed + Aware + Send + Sync,
    A: Send + Sync,
    F: Fn() -> Vec<A> + Send + Sync,
{
    fn evaluate(&self, observation: &O, ctx: &mut BehaviorContext<'_>) -> (NodeStatus, Vec<A>) {
        let has_hostiles = observation.nearby_entities().iter().any(|e| e.is_hostile);

        if !has_hostiles || observation.current_health() >= self.health_threshold {
            return (NodeStatus::Failure, vec![]);
        }

        let tick = ctx.current_tick;
        if !ctx.per_npc.can_fire(tick) || !ctx.global.can_fire(tick) {
            return (NodeStatus::Failure, vec![]);
        }

        ctx.per_npc.mark_fired(tick);
        ctx.global.mark_fired(tick);

        (NodeStatus::Success, (self.make_actions)())
    }
}
