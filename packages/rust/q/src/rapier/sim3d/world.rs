//! The physics pillar's actual state. Engine-agnostic on purpose — this is the
//! same code path the authoritative server steps, so it must build headless.

use std::collections::HashMap;

use rapier3d::control::{CharacterAutostep, CharacterLength, KinematicCharacterController};
use rapier3d::parry::utils::Array2;
use rapier3d::prelude::*;

use super::types::{
    BodyDesc, BodyId, BodyKind, BodySnapshot, CharacterDesc, Iso, ShapeDesc, SimCommand, SimConfig,
    SimSnapshot, TerrainDesc,
};

fn shared_shape(shape: &ShapeDesc) -> SharedShape {
    match *shape {
        ShapeDesc::Ball { radius } => SharedShape::ball(radius),
        ShapeDesc::Cuboid { half_extents } => {
            SharedShape::cuboid(half_extents[0], half_extents[1], half_extents[2])
        }
        ShapeDesc::Capsule {
            half_height,
            radius,
        } => SharedShape::capsule_y(half_height, radius),
    }
}

struct CharacterState {
    controller: KinematicCharacterController,
    shape: SharedShape,
    /// Motion requested since the last step. Accumulated, then cleared once
    /// consumed, so intent from frames that outran the sim is not lost.
    desired: Vector,
    grounded: bool,
}

fn to_pose(iso: &Iso) -> Pose {
    let [x, y, z, w] = iso.rot;
    let mut pose = Pose::from_translation(Vector::new(iso.pos[0], iso.pos[1], iso.pos[2]));
    pose.rotation = Rotation::from_xyzw(x, y, z, w);
    pose
}

fn from_pose(pose: &Pose) -> Iso {
    let (t, r) = (pose.translation, pose.rotation);
    Iso {
        pos: [t.x, t.y, t.z],
        rot: [r.x, r.y, r.z, r.w],
    }
}

pub struct SimWorld {
    physics: PhysicsWorld,
    index: HashMap<BodyId, RigidBodyHandle>,
    characters: HashMap<BodyId, CharacterState>,
    terrain: Option<RigidBodyHandle>,
    tick: u64,
}

impl SimWorld {
    pub fn new(config: &SimConfig) -> Self {
        let mut physics = PhysicsWorld::new();
        physics.integration_parameters.dt = config.timestep() as Real;
        physics.gravity = Vector::new(config.gravity[0], config.gravity[1], config.gravity[2]);
        Self {
            physics,
            index: HashMap::new(),
            characters: HashMap::new(),
            terrain: None,
            tick: 0,
        }
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn body_count(&self) -> usize {
        self.index.len()
    }

    pub fn apply(&mut self, cmd: SimCommand) {
        match cmd {
            SimCommand::SetTerrain(desc) => self.set_terrain(&desc),
            SimCommand::Spawn { id, desc } => self.spawn(id, &desc),
            SimCommand::Despawn { id } => self.despawn(id),
            SimCommand::SetKinematicTarget { id, iso } => {
                if let Some(rb) = self
                    .index
                    .get(&id)
                    .and_then(|h| self.physics.bodies.get_mut(*h))
                {
                    rb.set_next_kinematic_position(to_pose(&iso));
                }
            }
            SimCommand::ApplyImpulse { id, impulse } => {
                if let Some(rb) = self
                    .index
                    .get(&id)
                    .and_then(|h| self.physics.bodies.get_mut(*h))
                {
                    rb.apply_impulse(Vector::new(impulse[0], impulse[1], impulse[2]), true);
                }
            }
            SimCommand::SetGravity(g) => {
                self.physics.gravity = Vector::new(g[0], g[1], g[2]);
            }
            SimCommand::SpawnCharacter { id, desc } => self.spawn_character(id, &desc),
            SimCommand::MoveCharacter { id, translation } => {
                if let Some(ch) = self.characters.get_mut(&id) {
                    ch.desired += Vector::new(translation[0], translation[1], translation[2]);
                }
            }
        }
    }

    /// Replaces any previous terrain.
    ///
    /// Two layout conversions happen here and both are easy to get backwards.
    /// The source grid is row-major with the row index walking +Z and the
    /// column index walking +X — Godot's `HeightMapShape3D` order, which is
    /// what `QTerrain::cpu_heights` hands out. Parry wants an `Array2` that is
    /// *column*-major (`flat = i + j * nrows`) indexed `[z][x]`, so the copy
    /// below is a transpose, not a memcpy. The `terrain_plateau_runs_along_*`
    /// tests pin it, because a swapped grid still yields a plausible surface.
    fn set_terrain(&mut self, desc: &TerrainDesc) {
        let res = desc.resolution as usize;
        if res < 2 || desc.heights.len() < res * res {
            return;
        }
        if let Some(old) = self.terrain.take() {
            self.physics.remove_body(old);
        }

        let mut data = vec![0.0; res * res];
        for z in 0..res {
            for x in 0..res {
                data[z + x * res] = desc.heights[z * res + x];
            }
        }
        let heights = Array2::new(res, res, data);

        let span = desc.extent * 2.0;
        let (body, _) = self.physics.insert(
            RigidBodyBuilder::fixed(),
            ColliderBuilder::heightfield(heights, Vector::new(span, 1.0, span)).friction(1.0),
        );
        self.terrain = Some(body);
    }

    fn spawn(&mut self, id: BodyId, desc: &BodyDesc) {
        if self.index.contains_key(&id) {
            self.despawn(id);
        }

        let mut body = match desc.kind {
            BodyKind::Dynamic => RigidBodyBuilder::dynamic(),
            BodyKind::Fixed => RigidBodyBuilder::fixed(),
            BodyKind::KinematicPosition => RigidBodyBuilder::kinematic_position_based(),
        }
        .pose(to_pose(&desc.iso))
        .linear_damping(desc.linear_damping);
        if let Some(mass) = desc.mass {
            body = body.additional_mass(mass);
        }

        let collider = match desc.shape {
            ShapeDesc::Ball { radius } => ColliderBuilder::ball(radius),
            ShapeDesc::Cuboid { half_extents } => {
                ColliderBuilder::cuboid(half_extents[0], half_extents[1], half_extents[2])
            }
            ShapeDesc::Capsule {
                half_height,
                radius,
            } => ColliderBuilder::capsule_y(half_height, radius),
        }
        .restitution(desc.restitution)
        .friction(desc.friction);

        let (handle, _) = self.physics.insert(body, collider);
        self.index.insert(id, handle);
    }

    fn spawn_character(&mut self, id: BodyId, desc: &CharacterDesc) {
        if self.index.contains_key(&id) {
            self.despawn(id);
        }

        let shape = shared_shape(&desc.shape);
        let (handle, _) = self.physics.insert(
            RigidBodyBuilder::kinematic_position_based().pose(to_pose(&desc.iso)),
            ColliderBuilder::new(shape.clone()),
        );

        let controller = KinematicCharacterController {
            offset: CharacterLength::Absolute(desc.offset),
            max_slope_climb_angle: desc.max_slope_climb_deg.to_radians(),
            min_slope_slide_angle: desc.min_slope_slide_deg.to_radians(),
            autostep: desc.autostep.map(|a| CharacterAutostep {
                max_height: CharacterLength::Absolute(a.max_height),
                min_width: CharacterLength::Absolute(a.min_width),
                include_dynamic_bodies: a.include_dynamic,
            }),
            snap_to_ground: desc.snap_to_ground.map(CharacterLength::Absolute),
            ..Default::default()
        };

        self.index.insert(id, handle);
        self.characters.insert(
            id,
            CharacterState {
                controller,
                shape,
                desired: Vector::ZERO,
                grounded: false,
            },
        );
    }

    fn despawn(&mut self, id: BodyId) {
        self.characters.remove(&id);
        if let Some(handle) = self.index.remove(&id) {
            self.physics.remove_body(handle);
        }
    }

    /// Resolves each character's requested motion against the world before the
    /// solver runs.
    ///
    /// Split into a read pass and a write pass because `move_shape` needs a
    /// `QueryPipeline` borrowed from the physics world while the result has to
    /// be written back into it — the two cannot overlap.
    fn step_characters(&mut self) {
        if self.characters.is_empty() {
            return;
        }
        let dt = self.physics.integration_parameters.dt;

        let mut moves = Vec::with_capacity(self.characters.len());
        for (id, ch) in &self.characters {
            let Some(handle) = self.index.get(id) else {
                continue;
            };
            let Some(rb) = self.physics.bodies.get(*handle) else {
                continue;
            };
            let pose = *rb.position();
            // Excluding the character's own body matters: without it the shape
            // cast immediately hits the collider it started inside and the
            // character never moves.
            let queries = self
                .physics
                .query_pipeline_with_filter(QueryFilter::new().exclude_rigid_body(*handle));
            let movement = ch.controller.move_shape(
                dt,
                &queries,
                ch.shape.as_ref(),
                &pose,
                ch.desired,
                |_| {},
            );
            moves.push((*id, *handle, pose, movement.translation, movement.grounded));
        }

        for (id, handle, mut pose, translation, grounded) in moves {
            pose.translation += translation;
            if let Some(rb) = self.physics.bodies.get_mut(handle) {
                rb.set_next_kinematic_position(pose);
            }
            if let Some(ch) = self.characters.get_mut(&id) {
                ch.grounded = grounded;
                ch.desired = Vector::ZERO;
            }
        }
    }

    pub fn step(&mut self) {
        self.step_characters();
        self.physics.step();
        self.tick += 1;
    }

    /// Writes into a caller-owned snapshot so the steady state reuses one
    /// buffer rather than allocating a fresh `Vec` every tick.
    ///
    /// Fixed bodies are **excluded**. They cannot move — a fixed body that
    /// needs to move is a kinematic body — so replicating them would spend
    /// bandwidth restating level geometry many times a second, forever. At
    /// roughly 42 bytes per body that is the difference between a snapshot
    /// that fits one datagram and one that fragments; peers are expected to
    /// build static geometry locally from the shared seed, exactly as they do
    /// for terrain.
    pub fn snapshot_into(&self, out: &mut SimSnapshot) {
        out.tick = self.tick;
        out.sim_time = self.tick as f64 * self.physics.integration_parameters.dt as f64;
        out.bodies.clear();
        out.bodies.reserve(self.index.len());
        for (id, handle) in &self.index {
            let Some(rb) = self.physics.bodies.get(*handle) else {
                continue;
            };
            if rb.is_fixed() {
                continue;
            }
            let v = rb.linvel();
            out.bodies.push(BodySnapshot {
                id: *id,
                iso: from_pose(rb.position()),
                linvel: [v.x, v.y, v.z],
                grounded: self.characters.get(id).is_some_and(|c| c.grounded),
            });
        }
        // `HashMap` iteration order is arbitrary and reshuffles as the table
        // grows; sorting is what lets `SimSnapshot::body` bisect.
        out.bodies.sort_unstable_by_key(|b| b.id);
    }

    pub fn snapshot(&self) -> SimSnapshot {
        let mut out = SimSnapshot::default();
        self.snapshot_into(&mut out);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// Builds a grid in the same row-major, row-walks-+Z order `QTerrain` uses.
    fn terrain(res: usize, extent: f32, f: impl Fn(f32, f32) -> f32) -> TerrainDesc {
        let step = extent * 2.0 / (res - 1) as f32;
        let mut heights = vec![0.0f32; res * res];
        for row in 0..res {
            let z = -extent + row as f32 * step;
            for col in 0..res {
                let x = -extent + col as f32 * step;
                heights[row * res + col] = f(x, z);
            }
        }
        TerrainDesc {
            heights: Arc::new(heights),
            resolution: res as u32,
            extent,
        }
    }

    fn settle(world: &mut SimWorld, steps: usize) {
        for _ in 0..steps {
            world.step();
        }
    }

    fn pos(world: &SimWorld, id: BodyId) -> [f32; 3] {
        world.snapshot().body(id).expect("body missing").iso.pos
    }

    fn drop_ball(world: &mut SimWorld, id: BodyId, at: [f32; 3]) {
        world.apply(SimCommand::Spawn {
            id,
            desc: BodyDesc {
                shape: ShapeDesc::Ball { radius: 0.5 },
                iso: Iso::at(at[0], at[1], at[2]),
                ..Default::default()
            },
        });
    }

    #[test]
    fn dynamic_body_falls_under_gravity() {
        let mut world = SimWorld::new(&SimConfig::default());
        drop_ball(&mut world, BodyId(1), [0.0, 10.0, 0.0]);
        settle(&mut world, 30);
        assert!(pos(&world, BodyId(1))[1] < 10.0, "body should have fallen");
    }

    #[test]
    fn body_rests_on_flat_terrain() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(33, 64.0, |_, _| 0.0)));
        drop_ball(&mut world, BodyId(1), [0.0, 6.0, 0.0]);
        settle(&mut world, 300);

        let y = pos(&world, BodyId(1))[1];
        assert!(
            (y - 0.5).abs() < 0.2,
            "ball of radius 0.5 should rest near y=0.5, got {y}"
        );
    }

    /// Pins the row/col -> Z/X mapping empirically, because a transposed
    /// heightfield still yields a plausible-looking surface.
    ///
    /// The probe terrain is a plateau over the +X half and flat elsewhere: a
    /// ball resting at x=+40 must sit 5m higher than one at x=-40. If rows and
    /// columns were swapped the plateau would run along Z instead, and both
    /// probes — which share z=0 — would settle at the same low height.
    ///
    /// Plateaus rather than a ramp on purpose: a sphere on a constant slope
    /// rolls for the whole settle window, so a ramp measures how long the test
    /// waited rather than which way the grid is oriented.
    #[test]
    fn terrain_plateau_runs_along_x_as_authored() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |x, _z| {
            if x > 20.0 { 5.0 } else { 0.0 }
        })));

        drop_ball(&mut world, BodyId(1), [40.0, 12.0, 0.0]);
        drop_ball(&mut world, BodyId(2), [-40.0, 7.0, 0.0]);
        settle(&mut world, 300);

        let on_plateau = pos(&world, BodyId(1))[1];
        let on_flat = pos(&world, BodyId(2))[1];
        assert!(
            (on_plateau - 5.5).abs() < 0.3,
            "x=+40 is on the plateau, expected y≈5.5, got {on_plateau}"
        );
        assert!(
            (on_flat - 0.5).abs() < 0.3,
            "x=-40 is off the plateau, expected y≈0.5, got {on_flat}"
        );
    }

    /// The mirror of the above: Z is the axis a transpose would swap into X,
    /// so probe it directly with a plateau over the +Z half.
    #[test]
    fn terrain_plateau_runs_along_z_as_authored() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_x, z| {
            if z > 20.0 { 5.0 } else { 0.0 }
        })));

        drop_ball(&mut world, BodyId(1), [0.0, 12.0, 40.0]);
        drop_ball(&mut world, BodyId(2), [0.0, 7.0, -40.0]);
        settle(&mut world, 300);

        let on_plateau = pos(&world, BodyId(1))[1];
        let on_flat = pos(&world, BodyId(2))[1];
        assert!(
            (on_plateau - 5.5).abs() < 0.3,
            "z=+40 is on the plateau, expected y≈5.5, got {on_plateau}"
        );
        assert!(
            (on_flat - 0.5).abs() < 0.3,
            "z=-40 is off the plateau, expected y≈0.5, got {on_flat}"
        );
    }

    #[test]
    fn kinematic_target_moves_body_and_ignores_gravity() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::Spawn {
            id: BodyId(7),
            desc: BodyDesc {
                kind: BodyKind::KinematicPosition,
                shape: ShapeDesc::Capsule {
                    half_height: 0.5,
                    radius: 0.3,
                },
                iso: Iso::at(0.0, 5.0, 0.0),
                ..Default::default()
            },
        });
        world.apply(SimCommand::SetKinematicTarget {
            id: BodyId(7),
            iso: Iso::at(3.0, 5.0, 0.0),
        });
        settle(&mut world, 2);

        let p = pos(&world, BodyId(7));
        assert!(
            (p[0] - 3.0).abs() < 0.01,
            "x should reach target, got {p:?}"
        );
        assert!((p[1] - 5.0).abs() < 0.01, "y must not fall, got {p:?}");
    }

    #[test]
    fn despawn_removes_body_from_snapshot() {
        let mut world = SimWorld::new(&SimConfig::default());
        drop_ball(&mut world, BodyId(1), [0.0, 1.0, 0.0]);
        drop_ball(&mut world, BodyId(2), [0.0, 1.0, 0.0]);
        world.apply(SimCommand::Despawn { id: BodyId(1) });
        world.step();

        let snap = world.snapshot();
        assert_eq!(world.body_count(), 1);
        assert!(snap.body(BodyId(1)).is_none());
        assert!(snap.body(BodyId(2)).is_some());
    }

    /// Static level geometry must not ride the wire. It cannot move, and at
    /// ~42 bytes each it is what pushes a snapshot past a single datagram.
    #[test]
    fn fixed_bodies_are_excluded_from_snapshots() {
        let mut world = SimWorld::new(&SimConfig::default());
        drop_ball(&mut world, BodyId(1), [0.0, 5.0, 0.0]);
        world.apply(SimCommand::Spawn {
            id: BodyId(2),
            desc: BodyDesc {
                kind: BodyKind::Fixed,
                shape: ShapeDesc::Cuboid {
                    half_extents: [1.0; 3],
                },
                ..Default::default()
            },
        });
        world.apply(SimCommand::SpawnCharacter {
            id: BodyId(3),
            desc: CharacterDesc::default(),
        });
        world.step();

        let snap = world.snapshot();
        assert_eq!(world.body_count(), 3, "all three still exist in the sim");
        assert!(snap.body(BodyId(1)).is_some(), "dynamic replicates");
        assert!(snap.body(BodyId(3)).is_some(), "characters replicate");
        assert!(snap.body(BodyId(2)).is_none(), "fixed must not replicate");
        assert_eq!(snap.bodies.len(), 2);
    }

    #[test]
    fn snapshot_bodies_are_sorted_for_bisection() {
        let mut world = SimWorld::new(&SimConfig::default());
        for id in [9u32, 3, 7, 1, 5] {
            drop_ball(&mut world, BodyId(id), [id as f32, 1.0, 0.0]);
        }
        world.step();

        let snap = world.snapshot();
        assert!(snap.bodies.windows(2).all(|w| w[0].id < w[1].id));
        for id in [9u32, 3, 7, 1, 5] {
            assert!(snap.body(BodyId(id)).is_some(), "lookup failed for {id}");
        }
    }

    #[test]
    fn respawning_same_id_replaces_rather_than_duplicates() {
        let mut world = SimWorld::new(&SimConfig::default());
        drop_ball(&mut world, BodyId(1), [0.0, 1.0, 0.0]);
        drop_ball(&mut world, BodyId(1), [5.0, 1.0, 0.0]);

        assert_eq!(world.body_count(), 1);
        assert_eq!(world.snapshot().bodies.len(), 1);
        assert!((pos(&world, BodyId(1))[0] - 5.0).abs() < 0.01);
    }

    #[test]
    fn replacing_terrain_leaves_a_single_ground_body() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(33, 64.0, |_, _| 0.0)));
        world.apply(SimCommand::SetTerrain(terrain(33, 64.0, |_, _| 5.0)));
        drop_ball(&mut world, BodyId(1), [0.0, 12.0, 0.0]);
        settle(&mut world, 400);

        // Resting on the new surface (y=5) proves the old one was removed
        // rather than left behind as a second collider.
        let y = pos(&world, BodyId(1))[1];
        assert!((y - 5.5).abs() < 0.3, "expected rest near y=5.5, got {y}");
    }

    /// Capsule half_height 0.6 + radius 0.35 puts the resting centre 0.95
    /// above whatever it is standing on.
    const CH_RIDE: f32 = 0.95;

    fn spawn_character(world: &mut SimWorld, id: BodyId, at: [f32; 3]) {
        world.apply(SimCommand::SpawnCharacter {
            id,
            desc: CharacterDesc {
                iso: Iso::at(at[0], at[1], at[2]),
                ..Default::default()
            },
        });
    }

    fn ledge(world: &mut SimWorld, id: BodyId, top: f32) {
        world.apply(SimCommand::Spawn {
            id,
            desc: BodyDesc {
                kind: BodyKind::Fixed,
                shape: ShapeDesc::Cuboid {
                    half_extents: [2.0, top / 2.0, 2.0],
                },
                iso: Iso::at(2.5, top / 2.0, 0.0),
                ..Default::default()
            },
        });
    }

    /// Walks with a downward bias each tick — the controller does not apply
    /// gravity, exactly as `move_and_slide` does not.
    fn walk(world: &mut SimWorld, id: BodyId, dx: f32, ticks: usize) {
        for _ in 0..ticks {
            world.apply(SimCommand::MoveCharacter {
                id,
                translation: [dx, -0.05, 0.0],
            });
            world.step();
        }
    }

    fn grounded(world: &SimWorld, id: BodyId) -> bool {
        world
            .snapshot()
            .body(id)
            .expect("character missing")
            .grounded
    }

    #[test]
    fn character_walks_across_flat_ground_and_stays_grounded() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        spawn_character(&mut world, BodyId(1), [0.0, 2.0, 0.0]);

        walk(&mut world, BodyId(1), 0.0, 90);
        assert!(grounded(&world, BodyId(1)), "should have landed");
        let start = pos(&world, BodyId(1));
        assert!(
            (start[1] - CH_RIDE).abs() < 0.15,
            "should rest at ~{CH_RIDE}, got {}",
            start[1]
        );

        walk(&mut world, BodyId(1), 0.0667, 60);
        let end = pos(&world, BodyId(1));
        assert!(
            end[0] - start[0] > 3.0,
            "expected ~4 units of travel, got {}",
            end[0] - start[0]
        );
        assert!(grounded(&world, BodyId(1)), "should still be grounded");
    }

    /// KNOWN FAILURE — rapier's autostep does not engage in this setup.
    ///
    /// The character reaches the ledge and then oscillates: it rises ~0.05 from
    /// riding the capsule's rounded edge against the box corner, `snap_to_ground`
    /// pulls it straight back, and it repeats forever, never gaining the 0.3.
    /// Reproduce with `diag_autostep`.
    ///
    /// Ruled out: our parameterisation (rapier's own `CharacterAutostep::default()`
    /// with `Relative` lengths behaves identically), and snap/autostep fighting
    /// (disabling `snap_to_ground` stops the oscillation but it still never
    /// climbs — it just slides back down instead).
    ///
    /// Suspected cause: `handle_stairs` bails at its "can we go up" shape cast,
    /// which uses `target_distance: offset` and so counts the wall the character
    /// is already flush against as an obstruction. Small per-tick motion means
    /// every tick after first contact starts flush, so the check never passes.
    /// Un-ignore once this is resolved — walls and slopes already work.
    #[test]
    #[ignore = "rapier autostep does not engage; see doc comment and diag_autostep"]
    fn character_autosteps_onto_a_low_ledge() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        ledge(&mut world, BodyId(9), 0.3);
        spawn_character(&mut world, BodyId(1), [-1.0, 2.0, 0.0]);

        walk(&mut world, BodyId(1), 0.0, 90);
        walk(&mut world, BodyId(1), 0.0667, 120);

        let p = pos(&world, BodyId(1));
        assert!(
            p[0] > 1.0,
            "should have stepped onto the ledge, got x={}",
            p[0]
        );
        assert!(
            (p[1] - (CH_RIDE + 0.3)).abs() < 0.2,
            "should be standing on the 0.3 ledge (~{}), got y={}",
            CH_RIDE + 0.3,
            p[1]
        );
    }

    #[test]
    fn character_is_blocked_by_a_wall_above_the_autostep_budget() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        ledge(&mut world, BodyId(9), 3.0);
        spawn_character(&mut world, BodyId(1), [-1.0, 2.0, 0.0]);

        walk(&mut world, BodyId(1), 0.0, 90);
        walk(&mut world, BodyId(1), 0.0667, 180);

        let p = pos(&world, BodyId(1));
        assert!(
            p[0] < 0.5,
            "a 3m wall must stop the character, got x={}",
            p[0]
        );
        assert!(
            p[1] < CH_RIDE + 0.5,
            "character must not climb the wall, got y={}",
            p[1]
        );
    }

    #[test]
    fn character_in_open_air_is_not_grounded() {
        let mut world = SimWorld::new(&SimConfig::default());
        spawn_character(&mut world, BodyId(1), [0.0, 50.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 10);

        assert!(
            !grounded(&world, BodyId(1)),
            "nothing to stand on, must report airborne"
        );
        assert!(pos(&world, BodyId(1))[1] < 50.0, "should have descended");
    }

    #[test]
    fn character_movement_requests_accumulate_between_steps() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        spawn_character(&mut world, BodyId(1), [0.0, 2.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 90);

        // Two requests before a single step must both land — a frame that
        // outruns the sim should add intent, not overwrite it.
        let before = pos(&world, BodyId(1))[0];
        for _ in 0..2 {
            world.apply(SimCommand::MoveCharacter {
                id: BodyId(1),
                translation: [0.5, 0.0, 0.0],
            });
        }
        world.step();

        let moved = pos(&world, BodyId(1))[0] - before;
        assert!(
            moved > 0.8,
            "both 0.5 requests should apply (~1.0), got {moved}"
        );
    }

    #[test]
    #[ignore = "diagnostic"]
    fn diag_autostep() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        ledge(&mut world, BodyId(9), 0.3);
        spawn_character(&mut world, BodyId(1), [-1.0, 2.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 90);

        for i in 0..40 {
            world.apply(SimCommand::MoveCharacter {
                id: BodyId(1),
                translation: [0.0667, -0.05, 0.0],
            });
            let h = world.index[&BodyId(1)];
            let ch = &world.characters[&BodyId(1)];
            let pose = *world.physics.bodies.get(h).unwrap().position();
            let q = world
                .physics
                .query_pipeline_with_filter(QueryFilter::new().exclude_rigid_body(h));
            let mut wall = false;
            let mv = ch.controller.move_shape(
                world.physics.integration_parameters.dt,
                &q,
                ch.shape.as_ref(),
                &pose,
                ch.desired,
                |c| {
                    wall = true;
                    eprintln!(
                        "    hit n1={:?} toi={}",
                        c.hit.normal1, c.hit.time_of_impact
                    );
                },
            );
            eprintln!(
                "i={i} x={:.3} y={:.3} tr=({:.4},{:.4}) grounded={} hit={wall}",
                pose.translation.x,
                pose.translation.y,
                mv.translation.x,
                mv.translation.y,
                mv.grounded
            );
            world.step();
        }
    }

    #[test]
    fn rotation_survives_the_iso_round_trip() {
        // 90 degrees about Y, as xyzw.
        let h = std::f32::consts::FRAC_1_SQRT_2;
        let mut world = SimWorld::new(&SimConfig::default());
        // Kinematic rather than fixed: fixed bodies are not replicated, so a
        // fixed body would never appear in the snapshot to check.
        world.apply(SimCommand::Spawn {
            id: BodyId(1),
            desc: BodyDesc {
                kind: BodyKind::KinematicPosition,
                iso: Iso {
                    pos: [0.0, 0.0, 0.0],
                    rot: [0.0, h, 0.0, h],
                },
                ..Default::default()
            },
        });
        world.step();

        let rot = world.snapshot().body(BodyId(1)).unwrap().iso.rot;
        // Sign may flip (q and -q are the same rotation), so compare magnitudes.
        assert!((rot[1].abs() - h).abs() < 1e-4, "got {rot:?}");
        assert!((rot[3].abs() - h).abs() < 1e-4, "got {rot:?}");
        assert!(rot[0].abs() < 1e-4 && rot[2].abs() < 1e-4, "got {rot:?}");
    }
}
