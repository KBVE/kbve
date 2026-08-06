use std::collections::HashMap;

use rapier3d::control::{CharacterAutostep, CharacterLength, KinematicCharacterController};
use rapier3d::parry::query::DefaultQueryDispatcher;
use rapier3d::prelude::*;

use crate::constants::*;
use crate::tiles::{SOLID, SectorTiles};

/// Colliders for one sector, as the client worker builds them.
///
/// Walls are one cuboid per SOLID tile. Floors are merged into per-row runs
/// first: a collider per open tile would be ~2300 per 48x48 sector and ~18k
/// across the resident 3x3 ring, and rooms are rectangular so runs collapse
/// that to a handful of boxes per row.
pub fn sector_colliders(d: &SectorTiles) -> Vec<Collider> {
    let mut out = Vec::new();
    let hx = TILE / 2.0;
    let hy = WALL_H / 2.0;

    for r in 0..d.rows {
        for c in 0..d.cols {
            if d.at(c, r) & SOLID == 0 {
                continue;
            }
            out.push(
                ColliderBuilder::cuboid(hx, hy, hx)
                    .translation(vector![
                        (d.origin_col + c) as f32 * TILE + hx,
                        hy,
                        (d.origin_row + r) as f32 * TILE + hx
                    ])
                    .build(),
            );
        }
    }

    for r in 0..d.rows {
        let mut c = 0;
        while c < d.cols {
            if !d.has_floor(c, r) {
                c += 1;
                continue;
            }
            let mut end = c;
            while end + 1 < d.cols && d.has_floor(end + 1, r) {
                end += 1;
            }
            let len = (end - c + 1) as f32;
            out.push(
                ColliderBuilder::cuboid(len * TILE / 2.0, FLOOR_HALF, TILE / 2.0)
                    .translation(vector![
                        ((d.origin_col + c) as f32 + len / 2.0) * TILE,
                        -FLOOR_HALF,
                        (d.origin_row + r) as f32 * TILE + TILE / 2.0
                    ])
                    .build(),
            );
            c = end + 1;
        }
    }

    out
}

#[derive(Clone, Copy, Debug)]
pub struct CharacterHandle {
    pub body: RigidBodyHandle,
    pub collider: ColliderHandle,
}

/// The static world plus kinematic character capsules, stepped by rapier's
/// character controller exactly as the client worker steps it.
pub struct PhysicsWorld {
    bodies: RigidBodySet,
    colliders: ColliderSet,
    islands: IslandManager,
    broad_phase: BroadPhaseBvh,
    narrow_phase: NarrowPhase,
    impulse_joints: ImpulseJointSet,
    multibody_joints: MultibodyJointSet,
    ccd_solver: CCDSolver,
    pipeline: PhysicsPipeline,
    integration: IntegrationParameters,
    dispatcher: DefaultQueryDispatcher,
    controller: KinematicCharacterController,
    sectors: HashMap<(i32, i32), RigidBodyHandle>,
    grounded: bool,
}

impl Default for PhysicsWorld {
    fn default() -> Self {
        Self::new()
    }
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let controller = KinematicCharacterController {
            offset: CharacterLength::Absolute(KCC_OFFSET),
            snap_to_ground: Some(CharacterLength::Absolute(SNAP_TO_GROUND)),
            autostep: Some(CharacterAutostep {
                max_height: CharacterLength::Absolute(AUTOSTEP_MAX_HEIGHT),
                min_width: CharacterLength::Absolute(AUTOSTEP_MIN_WIDTH),
                include_dynamic_bodies: true,
            }),
            ..Default::default()
        };

        Self {
            bodies: RigidBodySet::new(),
            colliders: ColliderSet::new(),
            islands: IslandManager::new(),
            broad_phase: BroadPhaseBvh::new(),
            narrow_phase: NarrowPhase::new(),
            impulse_joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            pipeline: PhysicsPipeline::new(),
            integration: IntegrationParameters::default(),
            dispatcher: DefaultQueryDispatcher,
            controller,
            sectors: HashMap::new(),
            grounded: false,
        }
    }

    pub fn add_sector(&mut self, key: (i32, i32), d: &SectorTiles) {
        if self.sectors.contains_key(&key) {
            return;
        }
        let body = self.bodies.insert(RigidBodyBuilder::fixed().build());
        for collider in sector_colliders(d) {
            self.colliders
                .insert_with_parent(collider, body, &mut self.bodies);
        }
        self.sectors.insert(key, body);
        self.settle();
    }

    pub fn remove_sector(&mut self, key: (i32, i32)) {
        let Some(body) = self.sectors.remove(&key) else {
            return;
        };
        self.bodies.remove(
            body,
            &mut self.islands,
            &mut self.colliders,
            &mut self.impulse_joints,
            &mut self.multibody_joints,
            true,
        );
        self.settle();
    }

    pub fn collider_count(&self) -> usize {
        self.colliders.len()
    }

    /// Spawns the character capsule with its feet at `foot`.
    pub fn spawn_character(&mut self, foot: Vector<f32>) -> CharacterHandle {
        let body = self.bodies.insert(
            RigidBodyBuilder::kinematic_position_based()
                .translation(vector![foot.x, foot.y + CAPSULE_CENTRE_Y, foot.z])
                .build(),
        );
        let collider = self.colliders.insert_with_parent(
            ColliderBuilder::capsule_y(PLAYER_HALF, PLAYER_RADIUS).build(),
            body,
            &mut self.bodies,
        );
        self.settle();
        CharacterHandle { body, collider }
    }

    /// One substep of character movement. `desired_x`/`desired_z` are horizontal
    /// velocities; gravity is applied here. Kinematic bodies are excluded from
    /// the sweep so two characters never shove each other, matching the client's
    /// `QueryFilterFlags.EXCLUDE_KINEMATIC`.
    pub fn step_character(&mut self, ch: &CharacterHandle, desired_x: f32, desired_z: f32, dt: f32) {
        let translation = *self.bodies[ch.body].translation();
        let wanted = vector![desired_x * dt, -GRAVITY * dt, desired_z * dt];
        let shape = self.colliders[ch.collider].shared_shape().clone();

        let filter = QueryFilter::exclude_kinematic();
        let queries = self.broad_phase.as_query_pipeline(
            &self.dispatcher,
            &self.bodies,
            &self.colliders,
            filter,
        );

        let movement = self.controller.move_shape(
            dt,
            &queries,
            shape.as_ref(),
            &Isometry::from(translation),
            wanted,
            |_| {},
        );

        self.grounded = movement.grounded;
        // Teleport rather than setting a next kinematic target: the target only
        // lands on the next physics step, so a second substep in the same step
        // would read the same stale translation and overwrite the first's result
        // instead of accumulating it, silently halving the speed.
        self.bodies[ch.body].set_translation(translation + movement.translation, true);
        self.settle();
    }

    pub fn grounded(&self) -> bool {
        self.grounded
    }

    /// Foot position of the character.
    pub fn foot_position(&self, ch: &CharacterHandle) -> Vector<f32> {
        let t = self.bodies[ch.body].translation();
        vector![t.x, t.y - CAPSULE_CENTRE_Y, t.z]
    }

    /// Advances the pipeline with a zero timestep so the broad-phase BVH picks
    /// up inserted, removed or teleported colliders before the next query.
    fn settle(&mut self) {
        let mut params = self.integration;
        params.dt = 0.0;
        self.pipeline.step(
            &vector![0.0, 0.0, 0.0],
            &params,
            &mut self.islands,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.impulse_joints,
            &mut self.multibody_joints,
            &mut self.ccd_solver,
            &(),
            &(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::motor::{FixedStep, approach};
    use crate::tiles::{FLOOR, PIT, WALL};

    const N: i32 = 8;

    fn open_sector() -> SectorTiles {
        SectorTiles::filled(N, N, 0, 0, FLOOR)
    }

    /// Walks the capsule for `secs` at a constant horizontal intent, using the
    /// same substep cadence and acceleration curve as the client worker.
    fn walk(world: &mut PhysicsWorld, ch: &CharacterHandle, vx: f32, vz: f32, secs: f32) {
        let mut stepper = FixedStep::default();
        let mut vel = (0.0f32, 0.0f32);
        let frames = (secs / (1.0 / 60.0)).round() as i32;
        for _ in 0..frames {
            stepper.run(1.0 / 60.0, |dt| {
                vel.0 = approach(vel.0, vx, MOTOR_ACCEL, dt);
                vel.1 = approach(vel.1, vz, MOTOR_ACCEL, dt);
                world.step_character(ch, vel.0, vel.1, dt);
            });
        }
    }

    #[test]
    fn floors_merge_into_row_runs_not_per_tile_colliders() {
        let colliders = sector_colliders(&open_sector());
        // One run per row, no walls. Per-tile would be N*N = 64.
        assert_eq!(colliders.len(), N as usize);
    }

    #[test]
    fn a_pit_splits_a_row_run_and_emits_no_slab_over_it() {
        let mut d = open_sector();
        d.set(4, 0, PIT);
        let runs = sector_colliders(&d).len();
        // Row 0 splits into two runs; the other N-1 rows stay whole.
        assert_eq!(runs, (N + 1) as usize);
    }

    #[test]
    fn a_solid_tile_emits_a_wall_cuboid_at_the_tile_centre() {
        let mut d = open_sector();
        d.set(3, 5, WALL);
        let colliders = sector_colliders(&d);
        let wall = colliders
            .iter()
            .find(|c| c.translation().y > 0.0)
            .expect("a wall collider sits above the floor slabs");
        assert!((wall.translation().x - (3.0 * TILE + TILE / 2.0)).abs() < 1e-4);
        assert!((wall.translation().z - (5.0 * TILE + TILE / 2.0)).abs() < 1e-4);
        assert!((wall.translation().y - WALL_H / 2.0).abs() < 1e-4);
    }

    #[test]
    fn the_capsule_rests_on_the_floor_instead_of_sinking_or_hovering() {
        let mut world = PhysicsWorld::new();
        world.add_sector((0, 0), &open_sector());
        let ch = world.spawn_character(vector![TILE * 1.5, 0.0, TILE * 1.5]);
        walk(&mut world, &ch, 0.0, 0.0, 1.0);
        let foot = world.foot_position(&ch);
        assert!(
            foot.y.abs() < 0.05,
            "foot drifted off the floor plane: y = {}",
            foot.y
        );
        assert!(world.grounded(), "capsule should report grounded on a slab");
    }

    #[test]
    fn constant_intent_travels_about_the_expected_distance() {
        let mut world = PhysicsWorld::new();
        world.add_sector((0, 0), &open_sector());
        let start_x = TILE * 1.5;
        let ch = world.spawn_character(vector![start_x, 0.0, TILE * 1.5]);
        walk(&mut world, &ch, WALK_SPEED, 0.0, 2.0);
        let travelled = world.foot_position(&ch).x - start_x;
        // 2s at 1.8 m/s minus the acceleration ramp; the ramp costs well under
        // one step's worth at accel 12.
        assert!(
            travelled > 3.3 && travelled < 3.6,
            "expected ~3.5m of travel, got {travelled}"
        );
    }

    #[test]
    fn a_wall_stops_the_capsule_at_its_radius_plus_the_controller_offset() {
        let mut d = open_sector();
        for r in 0..N {
            d.set(4, r, WALL);
        }
        let mut world = PhysicsWorld::new();
        world.add_sector((0, 0), &d);
        let ch = world.spawn_character(vector![TILE * 1.5, 0.0, TILE * 1.5]);
        walk(&mut world, &ch, RUN_SPEED, 0.0, 4.0);

        // Literal, not recomputed from the constants under test: wall face at
        // x=12.0, capsule radius 0.35, controller offset 0.02. Deriving it from
        // PLAYER_RADIUS/KCC_OFFSET would make the assertion move with the bug.
        let expected = 11.63;
        let x = world.foot_position(&ch).x;
        assert!(
            (x - expected).abs() < 0.05,
            "expected to stop at {expected}, stopped at {x}"
        );
    }

    #[test]
    fn a_pit_is_walked_into_and_fallen_through_rather_than_blocked() {
        // PIT is not SOLID, so it emits no wall and no floor slab: the player
        // walks in and drops. A pit that blocked movement would mean the slab
        // gap and the collision test disagree.
        let mut d = open_sector();
        for r in 0..N {
            for c in 4..N {
                d.set(c, r, PIT);
            }
        }
        let mut world = PhysicsWorld::new();
        world.add_sector((0, 0), &d);
        let ch = world.spawn_character(vector![TILE * 1.5, 0.0, TILE * 1.5]);
        walk(&mut world, &ch, RUN_SPEED, 0.0, 3.0);

        let foot = world.foot_position(&ch);
        assert!(
            foot.x > 4.0 * TILE,
            "should have crossed into the pit at x=12, stopped at {}",
            foot.x
        );
        assert!(foot.y < -1.0, "should have fallen, y = {}", foot.y);
        assert!(!world.grounded(), "should not report grounded over a pit");
    }

    #[test]
    fn sectors_can_be_added_and_removed_without_leaking_colliders() {
        let mut world = PhysicsWorld::new();
        assert_eq!(world.collider_count(), 0);
        world.add_sector((0, 0), &open_sector());
        let with_one = world.collider_count();
        assert_eq!(with_one, N as usize);
        world.add_sector((1, 0), &SectorTiles::filled(N, N, N, 0, FLOOR));
        assert_eq!(world.collider_count(), with_one * 2);
        world.remove_sector((1, 0));
        assert_eq!(world.collider_count(), with_one);
    }
}
