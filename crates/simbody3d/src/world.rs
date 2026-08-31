use std::collections::HashMap;

use rapier3d::control::{CharacterAutostep, CharacterLength, KinematicCharacterController};
use rapier3d::parry::query::DefaultQueryDispatcher;
use rapier3d::prelude::*;

use crate::config::{SimbodyConfig, WorldConfig};
use crate::tiles::{SectorTiles, TileMask};

/// Static colliders for one block of tiles.
///
/// Walls are one cuboid per solid tile. Floors are merged into per-row runs
/// first: a collider per open tile would be ~2300 for a 48x48 sector and ~18k
/// across a resident 3x3 ring, and rooms are typically rectangular so runs
/// collapse that to a handful of boxes per row.
pub fn sector_colliders(d: &SectorTiles, world: &WorldConfig, mask: &TileMask) -> Vec<Collider> {
    let mut out = Vec::new();
    let tile = world.tile;
    let hx = tile / 2.0;
    let hy = world.wall_height / 2.0;

    for r in 0..d.rows {
        for c in 0..d.cols {
            if !mask.is_solid(d.at(c, r)) {
                continue;
            }
            out.push(
                ColliderBuilder::cuboid(hx, hy, hx)
                    .translation(vector![
                        (d.origin_col + c) as f32 * tile + hx,
                        hy,
                        (d.origin_row + r) as f32 * tile + hx
                    ])
                    .build(),
            );
        }
    }

    for r in 0..d.rows {
        let mut c = 0;
        while c < d.cols {
            if !mask.has_floor(d.at(c, r)) {
                c += 1;
                continue;
            }
            let mut end = c;
            while end + 1 < d.cols && mask.has_floor(d.at(end + 1, r)) {
                end += 1;
            }
            let len = (end - c + 1) as f32;
            out.push(
                ColliderBuilder::cuboid(len * tile / 2.0, world.floor_half, tile / 2.0)
                    .translation(vector![
                        ((d.origin_col + c) as f32 + len / 2.0) * tile,
                        -world.floor_half,
                        (d.origin_row + r) as f32 * tile + tile / 2.0
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
    grounded: bool,
}

impl CharacterHandle {
    pub fn grounded(&self) -> bool {
        self.grounded
    }
}

/// Static tile geometry plus kinematic character capsules, resolved by rapier's
/// character controller.
pub struct PhysicsWorld {
    config: SimbodyConfig,
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
}

impl PhysicsWorld {
    pub fn new(config: SimbodyConfig) -> Self {
        let ch = &config.character;
        let controller = KinematicCharacterController {
            offset: CharacterLength::Absolute(ch.offset),
            snap_to_ground: ch.snap_to_ground.map(CharacterLength::Absolute),
            autostep: Some(CharacterAutostep {
                max_height: CharacterLength::Absolute(ch.autostep_max_height),
                min_width: CharacterLength::Absolute(ch.autostep_min_width),
                include_dynamic_bodies: ch.autostep_dynamic_bodies,
            }),
            ..Default::default()
        };

        Self {
            config,
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
        }
    }

    pub fn config(&self) -> &SimbodyConfig {
        &self.config
    }

    pub fn add_sector(&mut self, key: (i32, i32), d: &SectorTiles) {
        if self.sectors.contains_key(&key) {
            return;
        }
        let body = self.bodies.insert(RigidBodyBuilder::fixed().build());
        for collider in sector_colliders(d, &self.config.world, &self.config.mask) {
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

    pub fn sector_count(&self) -> usize {
        self.sectors.len()
    }

    /// Spawns a character capsule with its feet at `foot`.
    pub fn spawn_character(&mut self, foot: Vector<f32>) -> CharacterHandle {
        let ch = &self.config.character;
        let body = self.bodies.insert(
            RigidBodyBuilder::kinematic_position_based()
                .translation(vector![foot.x, foot.y + ch.centre_offset(), foot.z])
                .build(),
        );
        let collider = self.colliders.insert_with_parent(
            ColliderBuilder::capsule_y(ch.half_height, ch.radius).build(),
            body,
            &mut self.bodies,
        );
        self.settle();
        CharacterHandle {
            body,
            collider,
            grounded: false,
        }
    }

    /// One substep of character movement. `desired_x`/`desired_z` are horizontal
    /// velocities; gravity is applied here. Kinematic bodies are excluded from
    /// the sweep so two characters never shove each other.
    pub fn step_character(
        &mut self,
        ch: &mut CharacterHandle,
        desired_x: f32,
        desired_z: f32,
        dt: f32,
    ) {
        let translation = *self.bodies[ch.body].translation();
        let wanted = vector![
            desired_x * dt,
            -self.config.character.gravity * dt,
            desired_z * dt
        ];
        let shape = self.colliders[ch.collider].shared_shape().clone();

        let queries = self.broad_phase.as_query_pipeline(
            &self.dispatcher,
            &self.bodies,
            &self.colliders,
            QueryFilter::exclude_kinematic(),
        );

        let movement = self.controller.move_shape(
            dt,
            &queries,
            shape.as_ref(),
            &Isometry::from(translation),
            wanted,
            |_| {},
        );

        ch.grounded = movement.grounded;
        // Teleport rather than setting a next kinematic target: the target only
        // lands on the next physics step, so a second substep in the same step
        // would read the same stale translation and overwrite the first's
        // result instead of accumulating it, silently halving the speed.
        self.bodies[ch.body].set_translation(translation + movement.translation, true);
        self.settle();
    }

    /// Foot position of a character.
    pub fn foot_position(&self, ch: &CharacterHandle) -> Vector<f32> {
        let t = self.bodies[ch.body].translation();
        vector![
            t.x,
            t.y - self.config.character.centre_offset(),
            t.z
        ]
    }

    pub fn teleport_character(&mut self, ch: &CharacterHandle, foot: Vector<f32>) {
        let centre = self.config.character.centre_offset();
        self.bodies[ch.body].set_translation(vector![foot.x, foot.y + centre, foot.z], true);
        self.settle();
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

#[cfg(all(test, feature = "presets"))]
mod tests {
    use super::*;
    use crate::motor::{FixedStep, approach};
    use crate::presets::herbmail_tiles::{FLOOR, PIT, WALL};
    use crate::presets::herbmail;

    const N: i32 = 8;

    fn open_sector() -> SectorTiles {
        SectorTiles::filled(N, N, 0, 0, FLOOR)
    }

    fn world() -> PhysicsWorld {
        PhysicsWorld::new(herbmail())
    }

    /// Walks the capsule for `secs` at a constant horizontal intent, using the
    /// configured substep cadence and acceleration curve.
    fn walk(world: &mut PhysicsWorld, ch: &mut CharacterHandle, vx: f32, vz: f32, secs: f32) {
        let cfg = *world.config();
        let mut stepper = FixedStep::from_config(cfg.step);
        let mut vel = (0.0f32, 0.0f32);
        let frames = (secs / (1.0 / 60.0)).round() as i32;
        for _ in 0..frames {
            stepper.run(1.0 / 60.0, |dt| {
                vel.0 = approach(vel.0, vx, cfg.character.accel, dt);
                vel.1 = approach(vel.1, vz, cfg.character.accel, dt);
                world.step_character(ch, vel.0, vel.1, dt);
            });
        }
    }

    #[test]
    fn floors_merge_into_row_runs_not_per_tile_colliders() {
        let cfg = herbmail();
        let colliders = sector_colliders(&open_sector(), &cfg.world, &cfg.mask);
        // One run per row, no walls. Per-tile would be N*N = 64.
        assert_eq!(colliders.len(), N as usize);
    }

    #[test]
    fn a_floorless_tile_splits_a_row_run_and_emits_no_slab_over_it() {
        let cfg = herbmail();
        let mut d = open_sector();
        d.set(4, 0, PIT);
        let runs = sector_colliders(&d, &cfg.world, &cfg.mask).len();
        // Row 0 splits into two runs; the other N-1 rows stay whole.
        assert_eq!(runs, (N + 1) as usize);
    }

    #[test]
    fn a_solid_tile_emits_a_wall_cuboid_at_the_tile_centre() {
        let cfg = herbmail();
        let mut d = open_sector();
        d.set(3, 5, WALL);
        let colliders = sector_colliders(&d, &cfg.world, &cfg.mask);
        let wall = colliders
            .iter()
            .find(|c| c.translation().y > 0.0)
            .expect("a wall collider sits above the floor slabs");
        assert!((wall.translation().x - 10.5).abs() < 1e-4);
        assert!((wall.translation().z - 16.5).abs() < 1e-4);
        assert!((wall.translation().y - 4.5).abs() < 1e-4);
    }

    #[test]
    fn the_tile_mask_decides_what_blocks_rather_than_a_fixed_flag_set() {
        // A consumer whose bitfield puts "solid" on a different bit gets walls
        // there and nowhere else. This is what makes the crate reusable.
        let mut cfg = herbmail();
        cfg.mask = TileMask {
            solid: 1 << 7,
            no_floor: 1 << 6,
        };
        let mut d = SectorTiles::filled(N, N, 0, 0, 0);
        // herbmail's SOLID bit must now mean nothing.
        d.set(2, 2, 1 << 0);
        let walls = sector_colliders(&d, &cfg.world, &cfg.mask)
            .iter()
            .filter(|c| c.translation().y > 0.0)
            .count();
        assert_eq!(walls, 0);

        d.set(2, 2, 1 << 7);
        let walls = sector_colliders(&d, &cfg.world, &cfg.mask)
            .iter()
            .filter(|c| c.translation().y > 0.0)
            .count();
        assert_eq!(walls, 1);
    }

    #[test]
    fn the_capsule_rests_on_the_floor_instead_of_sinking_or_hovering() {
        let mut w = world();
        w.add_sector((0, 0), &open_sector());
        let mut ch = w.spawn_character(vector![4.5, 0.0, 4.5]);
        walk(&mut w, &mut ch, 0.0, 0.0, 1.0);
        let foot = w.foot_position(&ch);
        assert!(
            foot.y.abs() < 0.05,
            "foot drifted off the floor plane: y = {}",
            foot.y
        );
        assert!(ch.grounded(), "capsule should report grounded on a slab");
    }

    #[test]
    fn constant_intent_travels_about_the_expected_distance() {
        let mut w = world();
        w.add_sector((0, 0), &open_sector());
        let mut ch = w.spawn_character(vector![4.5, 0.0, 4.5]);
        walk(&mut w, &mut ch, 1.8, 0.0, 2.0);
        let travelled = w.foot_position(&ch).x - 4.5;
        // 2s at 1.8 m/s minus the acceleration ramp, which costs well under one
        // step's worth at accel 12.
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
        let mut w = world();
        w.add_sector((0, 0), &d);
        let mut ch = w.spawn_character(vector![4.5, 0.0, 4.5]);
        walk(&mut w, &mut ch, 4.5, 0.0, 4.0);

        // Literal, not recomputed from the config under test: wall face at
        // x=12.0, capsule radius 0.35, controller offset 0.02. Deriving it from
        // the config would make the assertion move with the bug.
        let expected = 11.63;
        let x = w.foot_position(&ch).x;
        assert!(
            (x - expected).abs() < 0.05,
            "expected to stop at {expected}, stopped at {x}"
        );
    }

    #[test]
    fn a_floorless_region_is_walked_into_and_fallen_through_rather_than_blocked() {
        let mut d = open_sector();
        for r in 0..N {
            for c in 4..N {
                d.set(c, r, PIT);
            }
        }
        let mut w = world();
        w.add_sector((0, 0), &d);
        let mut ch = w.spawn_character(vector![4.5, 0.0, 4.5]);
        walk(&mut w, &mut ch, 4.5, 0.0, 3.0);

        let foot = w.foot_position(&ch);
        assert!(
            foot.x > 12.0,
            "should have crossed into the pit at x=12, stopped at {}",
            foot.x
        );
        assert!(foot.y < -1.0, "should have fallen, y = {}", foot.y);
        assert!(!ch.grounded(), "should not report grounded over a pit");
    }

    #[test]
    fn sectors_can_be_added_and_removed_without_leaking_colliders() {
        let mut w = world();
        assert_eq!(w.collider_count(), 0);
        w.add_sector((0, 0), &open_sector());
        let with_one = w.collider_count();
        assert_eq!(with_one, N as usize);
        w.add_sector((1, 0), &SectorTiles::filled(N, N, N, 0, FLOOR));
        assert_eq!(w.collider_count(), with_one * 2);
        assert_eq!(w.sector_count(), 2);
        w.remove_sector((1, 0));
        assert_eq!(w.collider_count(), with_one);
        assert_eq!(w.sector_count(), 1);
    }

    #[test]
    fn an_unmounted_neighbour_reads_as_solid_rather_than_walkable() {
        // Out-of-bounds must not become a hole a player can walk out through.
        let cfg = herbmail();
        let d = open_sector();
        assert!(cfg.mask.is_solid(d.at(-1, 0)));
        assert!(cfg.mask.is_solid(d.at(N, 0)));
        assert!(!cfg.mask.has_floor(d.at(-1, 0)));
    }
}
