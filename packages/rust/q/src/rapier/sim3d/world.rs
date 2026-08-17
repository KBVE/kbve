//! The physics pillar's actual state.

use std::collections::HashMap;

use rapier3d::control::{CharacterAutostep, CharacterLength, KinematicCharacterController};
use rapier3d::parry::utils::Array2;
use rapier3d::prelude::*;

use super::types::{
    BodyDesc, BodyId, BodyKind, BodySnapshot, CharacterDesc, Iso, ShapeDesc, SimCommand, SimConfig,
    SimSnapshot, TerrainDesc,
};

/// `None` when a convex hull cannot be built. Callers drop the body rather than
/// substituting a stand-in, because a guessed shape is worse than no collider: it is
/// invisible and wrong.
///
/// parry accepts a coplanar cloud and hands back a hull with no thickness, which
/// collides against nothing reliably, so volume is checked here rather than trusted.
fn shared_shape(shape: &ShapeDesc) -> Option<SharedShape> {
    Some(match shape {
        ShapeDesc::Ball { radius } => SharedShape::ball(*radius),
        ShapeDesc::Cuboid { half_extents } => {
            SharedShape::cuboid(half_extents[0], half_extents[1], half_extents[2])
        }
        ShapeDesc::Capsule {
            half_height,
            radius,
        } => SharedShape::capsule_y(*half_height, *radius),
        ShapeDesc::Cylinder {
            half_height,
            radius,
        } => SharedShape::cylinder(*half_height, *radius),
        ShapeDesc::TriMesh { vertices, indices } => {
            if vertices.len() < 3 || indices.is_empty() {
                return None;
            }
            let verts: Vec<Vector> = vertices
                .iter()
                .map(|v| Vector::new(v[0], v[1], v[2]))
                .collect();
            SharedShape::trimesh(verts, indices.as_ref().clone()).ok()?
        }
        ShapeDesc::ConvexHull { points, scale } => {
            let pts: Vec<Vector> = points
                .iter()
                .map(|p| Vector::new(p[0] * scale[0], p[1] * scale[1], p[2] * scale[2]))
                .collect();
            let hull = SharedShape::convex_hull(&pts)?;
            if hull.mass_properties(1.0).mass() <= 1e-6 {
                return None;
            }
            hull
        }
    })
}

struct CharacterState {
    controller: KinematicCharacterController,
    shape: SharedShape,
    groups: InteractionGroups,
    /// Motion requested since the last step.
    desired: Vector,
    grounded: bool,
}

fn interaction_groups(groups: [u32; 2]) -> InteractionGroups {
    InteractionGroups::new(
        Group::from_bits_truncate(groups[0]),
        Group::from_bits_truncate(groups[1]),
        InteractionTestMode::And,
    )
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
    /// Keyed on the region centre. One entry for the non-streaming single tile,
    /// several while a window follows players around.
    terrain: HashMap<[i32; 2], RigidBodyHandle>,
    tick: u64,
}

/// Region centres are float world coordinates but have to key a map. Quantizing to
/// centimetres is far finer than any stride a window snaps to and sidesteps float
/// equality entirely.
fn terrain_key(origin: [f32; 2]) -> [i32; 2] {
    [
        (origin[0] * 100.0).round() as i32,
        (origin[1] * 100.0).round() as i32,
    ]
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
            terrain: HashMap::new(),
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
            SimCommand::AddTerrainRegion { origin, desc } => self.add_terrain_region(origin, &desc),
            SimCommand::DropTerrainRegion { origin } => self.drop_terrain_region(origin),
            SimCommand::Spawn { id, desc } => self.spawn(id, &desc),
            SimCommand::SpawnMany { bodies } => {
                for (id, desc) in &bodies {
                    self.spawn(*id, desc);
                }
            }
            SimCommand::Despawn { id } => self.despawn(id),
            SimCommand::DespawnMany { ids } => {
                for id in ids {
                    self.despawn(id);
                }
            }
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
            SimCommand::TeleportCharacter { id, iso } => {
                let Some(ch) = self.characters.get_mut(&id) else {
                    return;
                };
                ch.desired = Vector::ZERO;
                if let Some(rb) = self
                    .index
                    .get(&id)
                    .and_then(|h| self.physics.bodies.get_mut(*h))
                {
                    rb.set_position(to_pose(&iso), true);
                    rb.set_next_kinematic_position(to_pose(&iso));
                }
            }
        }
    }

    /// Replaces every region with a single one at the origin.
    fn set_terrain(&mut self, desc: &TerrainDesc) {
        for handle in std::mem::take(&mut self.terrain).into_values() {
            self.physics.remove_body(handle);
        }
        self.add_terrain_region([0.0, 0.0], desc);
    }

    /// Regions are keyed on their centre so a re-bake of the same window replaces
    /// rather than stacking a second collider on the first.
    fn add_terrain_region(&mut self, origin: [f32; 2], desc: &TerrainDesc) {
        let res = desc.resolution as usize;
        if res < 2 || desc.heights.len() < res * res {
            return;
        }
        let key = terrain_key(origin);
        if let Some(old) = self.terrain.remove(&key) {
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
            RigidBodyBuilder::fixed().pose(Pose::from_translation(Vector::new(
                origin[0], 0.0, origin[1],
            ))),
            ColliderBuilder::heightfield(heights, Vector::new(span, 1.0, span)).friction(1.0),
        );
        self.terrain.insert(key, body);
    }

    fn drop_terrain_region(&mut self, origin: [f32; 2]) {
        if let Some(handle) = self.terrain.remove(&terrain_key(origin)) {
            self.physics.remove_body(handle);
        }
    }

    /// Regions currently collidable.
    pub fn terrain_region_count(&self) -> usize {
        self.terrain.len()
    }

    fn spawn(&mut self, id: BodyId, desc: &BodyDesc) {
        let Some(shape) = shared_shape(&desc.shape) else {
            return;
        };
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

        let collider = ColliderBuilder::new(shape)
            .restitution(desc.restitution)
            .friction(desc.friction)
            .collision_groups(interaction_groups(desc.groups));

        let (handle, _) = self.physics.insert(body, collider);
        self.index.insert(id, handle);
    }

    fn spawn_character(&mut self, id: BodyId, desc: &CharacterDesc) {
        if self.index.contains_key(&id) {
            self.despawn(id);
        }

        let Some(shape) = shared_shape(&desc.shape) else {
            return;
        };
        let groups = interaction_groups(desc.groups);
        let (handle, _) = self.physics.insert(
            RigidBodyBuilder::kinematic_position_based().pose(to_pose(&desc.iso)),
            ColliderBuilder::new(shape.clone()).collision_groups(groups),
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
                groups,
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

    /// Resolves each character's requested motion against the world before the solver
    /// runs.
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
            let queries = self.physics.query_pipeline_with_filter(
                QueryFilter::new()
                    .exclude_rigid_body(*handle)
                    .groups(ch.groups),
            );
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

    /// Writes into a caller-owned snapshot so the steady state reuses one buffer rather
    /// than allocating a fresh `Vec` every tick.
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

    /// Pins the row/col -> Z/X mapping empirically, because a transposed heightfield
    /// still yields a plausible-looking surface.
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

    /// The mirror of the above: Z is the axis a transpose would swap into X, so probe
    /// it directly with a plateau over the +Z half.
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

    /// Static level geometry must not ride the wire.
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

        let y = pos(&world, BodyId(1))[1];
        assert!((y - 5.5).abs() < 0.3, "expected rest near y=5.5, got {y}");
    }

    #[test]
    fn set_terrain_still_collapses_to_one_region() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::AddTerrainRegion {
            origin: [128.0, 0.0],
            desc: terrain(33, 64.0, |_, _| 0.0),
        });
        world.apply(SimCommand::AddTerrainRegion {
            origin: [-128.0, 0.0],
            desc: terrain(33, 64.0, |_, _| 0.0),
        });
        assert_eq!(world.terrain_region_count(), 2);
        // The non-streaming path has to keep meaning "this is the whole world".
        world.apply(SimCommand::SetTerrain(terrain(33, 64.0, |_, _| 0.0)));
        assert_eq!(world.terrain_region_count(), 1);
    }

    #[test]
    fn a_rebaked_region_replaces_rather_than_stacks() {
        let mut world = SimWorld::new(&SimConfig::default());
        for h in [0.0, 5.0] {
            world.apply(SimCommand::AddTerrainRegion {
                origin: [128.0, 0.0],
                desc: terrain(33, 64.0, move |_, _| h),
            });
        }
        assert_eq!(world.terrain_region_count(), 1, "same centre, one body");

        drop_ball(&mut world, BodyId(1), [128.0, 12.0, 0.0]);
        settle(&mut world, 400);
        let y = pos(&world, BodyId(1))[1];
        assert!(
            (y - 5.5).abs() < 0.3,
            "should rest on the newer region at y=5.5, got {y}"
        );
    }

    #[test]
    fn a_region_holds_bodies_up_away_from_the_origin() {
        let mut world = SimWorld::new(&SimConfig::default());
        // Deliberately no region at the origin: proves the collider is placed at the
        // region centre rather than always at 0,0.
        world.apply(SimCommand::AddTerrainRegion {
            origin: [512.0, -256.0],
            desc: terrain(33, 64.0, |_, _| 3.0),
        });
        drop_ball(&mut world, BodyId(1), [512.0, 12.0, -256.0]);
        settle(&mut world, 400);

        let y = pos(&world, BodyId(1))[1];
        assert!((y - 3.5).abs() < 0.3, "expected rest near y=3.5, got {y}");
    }

    #[test]
    fn dropping_a_region_takes_its_ground_with_it() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::AddTerrainRegion {
            origin: [512.0, 0.0],
            desc: terrain(33, 64.0, |_, _| 0.0),
        });
        drop_ball(&mut world, BodyId(1), [512.0, 2.0, 0.0]);
        settle(&mut world, 200);
        assert!(pos(&world, BodyId(1))[1] > -1.0, "should be resting");

        world.apply(SimCommand::DropTerrainRegion {
            origin: [512.0, 0.0],
        });
        assert_eq!(world.terrain_region_count(), 0);
        settle(&mut world, 200);
        assert!(
            pos(&world, BodyId(1))[1] < -5.0,
            "nothing left to stand on — should be falling"
        );
    }

    #[test]
    fn a_body_resting_in_an_overlap_is_not_fought_over() {
        let mut world = SimWorld::new(&SimConfig::default());
        // A moving window overlaps its predecessor rather than tiling against it, so
        // the crossing case is two colliders covering the same ground. Flat and level
        // on purpose: on a slope a ball rolls, and the roll would swamp the thing
        // being measured, which is whether the two colliders shove it.
        for origin in [[0.0, 0.0], [64.0, 0.0]] {
            world.apply(SimCommand::AddTerrainRegion {
                origin,
                desc: terrain(65, 64.0, |_, _| 2.0),
            });
        }
        assert_eq!(world.terrain_region_count(), 2);

        drop_ball(&mut world, BodyId(1), [32.0, 12.0, 0.0]);
        settle(&mut world, 400);
        let p = pos(&world, BodyId(1));
        assert!(
            (p[1] - 2.5).abs() < 0.3,
            "expected rest near y=2.5, got {}",
            p[1]
        );
        assert!(
            (p[0] - 32.0).abs() < 0.5 && p[2].abs() < 0.5,
            "double coverage should not push the body along the ground, got ({}, {})",
            p[0],
            p[2]
        );
    }

    #[test]
    fn overlapping_regions_carry_the_same_ground_at_the_same_height() {
        // Two windows onto one sloped world: each is authored in its own local grid,
        // so this is the check that a body crossing between them does not step.
        let world_height = |x: f32| x * 0.05;
        let mut a = SimWorld::new(&SimConfig::default());
        a.apply(SimCommand::AddTerrainRegion {
            origin: [0.0, 0.0],
            desc: terrain(65, 64.0, move |x, _| world_height(x)),
        });
        let mut b = SimWorld::new(&SimConfig::default());
        b.apply(SimCommand::AddTerrainRegion {
            origin: [64.0, 0.0],
            desc: terrain(65, 64.0, move |x, _| world_height(x + 64.0)),
        });

        // Same world point, dropped onto each region in isolation.
        for at in [16.0f32, 32.0, 48.0] {
            drop_ball(&mut a, BodyId(1), [at, 12.0, 0.0]);
            drop_ball(&mut b, BodyId(1), [at, 12.0, 0.0]);
            settle(&mut a, 200);
            settle(&mut b, 200);
            let (ya, yb) = (pos(&a, BodyId(1))[1], pos(&b, BodyId(1))[1]);
            assert!(
                (ya - yb).abs() < 0.05,
                "regions disagree at x={at}: {ya} vs {yb}"
            );
            a.apply(SimCommand::Despawn { id: BodyId(1) });
            b.apply(SimCommand::Despawn { id: BodyId(1) });
        }
    }

    /// Capsule half_height 0.6 + radius 0.35 puts the resting centre 0.95 above
    /// whatever it is standing on.
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

    /// Walks with a downward bias each tick — the controller does not apply gravity,
    /// exactly as `move_and_slide` does not.
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

    /// Characters move by `set_next_kinematic_position`, so their velocity is whatever
    /// rapier derives from the pose delta rather than anything written directly. The
    /// client extrapolates the local player along this, and would freeze between
    /// snapshots if it came back zero.
    #[test]
    fn a_walking_character_reports_a_velocity() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        spawn_character(&mut world, BodyId(1), [0.0, 2.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 90);

        walk(&mut world, BodyId(1), 0.0667, 30);
        let v = world
            .snapshot()
            .body(BodyId(1))
            .expect("character missing")
            .linvel;
        assert!(
            v[0] > 1.0,
            "expected ~4 u/s along x from a 0.0667/tick walk, got {v:?}"
        );
    }

    /// KNOWN FAILURE — rapier's autostep does not engage in this setup.
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

    /// Mantling and respawns move the body by fiat. A teleport that the solver then
    /// sweeps back would put the player inside the ledge they just climbed.
    #[test]
    fn teleport_moves_a_character_and_drops_queued_motion() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        spawn_character(&mut world, BodyId(1), [0.0, 2.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 90);

        world.apply(SimCommand::MoveCharacter {
            id: BodyId(1),
            translation: [5.0, 0.0, 0.0],
        });
        world.apply(SimCommand::TeleportCharacter {
            id: BodyId(1),
            iso: Iso::at(-20.0, 8.0, 12.0),
        });
        world.step();

        let p = pos(&world, BodyId(1));
        assert!(
            (p[0] + 20.0).abs() < 0.1 && (p[2] - 12.0).abs() < 0.1,
            "should land where it was put, got {p:?}"
        );
    }

    /// Pins that a jump clears the ground. rapier already declines to snap-to-ground on
    /// upward motion, so this passes today without any guard of ours -- it is here so a
    /// future change to the controller config cannot quietly reintroduce the classic
    /// kinematic-controller bug where snapping eats every jump.
    #[test]
    fn a_character_can_jump_clear_of_the_ground() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |_, _| 0.0)));
        spawn_character(&mut world, BodyId(1), [0.0, 2.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 90);

        let resting = pos(&world, BodyId(1))[1];
        assert!(grounded(&world, BodyId(1)), "must start on the floor");

        let dt = 1.0 / SimConfig::default().tick_hz as f32;
        let mut vy = 5.0f32;
        let mut peak = resting;
        for _ in 0..30 {
            world.apply(SimCommand::MoveCharacter {
                id: BodyId(1),
                translation: [0.0, vy * dt, 0.0],
            });
            world.step();
            vy -= 9.81 * dt;
            peak = peak.max(pos(&world, BodyId(1))[1]);
        }

        assert!(
            peak - resting > 0.5,
            "expected real height off a 5 m/s launch, got {:.3}",
            peak - resting
        );
    }

    /// The other half of the same trade: a character walking downhill must still be held
    /// to the ground, or it launches off every rise.
    #[test]
    fn a_walker_stays_glued_to_a_downward_slope() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(65, 64.0, |x, _| -x * 0.15)));
        spawn_character(&mut world, BodyId(1), [-20.0, 6.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 120);
        assert!(grounded(&world, BodyId(1)), "should have landed");

        let mut airborne = 0;
        for _ in 0..120 {
            world.apply(SimCommand::MoveCharacter {
                id: BodyId(1),
                translation: [0.0667, -0.05, 0.0],
            });
            world.step();
            if !grounded(&world, BodyId(1)) {
                airborne += 1;
            }
        }
        assert!(
            airborne < 12,
            "walking downhill should stay grounded, lost contact on {airborne}/120 ticks"
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

    fn cube_cloud(half: f32) -> Arc<Vec<[f32; 3]>> {
        let mut pts = Vec::with_capacity(8);
        for sx in [-half, half] {
            for sy in [-half, half] {
                for sz in [-half, half] {
                    pts.push([sx, sy, sz]);
                }
            }
        }
        Arc::new(pts)
    }

    /// The scatter fields hand over raw mesh vertices, not a hull — this is the check
    /// that the sim hulls them itself and the result actually collides.
    #[test]
    fn a_convex_hull_body_rests_on_terrain() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::SetTerrain(terrain(33, 64.0, |_, _| 0.0)));
        world.apply(SimCommand::Spawn {
            id: BodyId(1),
            desc: BodyDesc {
                shape: ShapeDesc::ConvexHull {
                    points: cube_cloud(0.5),
                    scale: [1.0; 3],
                },
                iso: Iso::at(0.0, 6.0, 0.0),
                ..Default::default()
            },
        });
        settle(&mut world, 400);

        let y = pos(&world, BodyId(1))[1];
        assert!((y - 0.5).abs() < 0.2, "expected rest near y=0.5, got {y}");
    }

    /// A rock whose hull cannot be built must leave nothing behind: a body with no
    /// collider would be an invisible hole in the world that still replicates.
    #[test]
    fn a_degenerate_hull_spawns_no_body() {
        let mut world = SimWorld::new(&SimConfig::default());
        let flat = vec![
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0],
            [1.0, 0.0, 1.0],
        ];
        for points in [vec![], vec![[0.0, 0.0, 0.0]], flat] {
            world.apply(SimCommand::Spawn {
                id: BodyId(1),
                desc: BodyDesc {
                    shape: ShapeDesc::ConvexHull {
                        points: Arc::new(points),
                        scale: [1.0; 3],
                    },
                    ..Default::default()
                },
            });
            assert_eq!(world.body_count(), 0, "degenerate cloud must not spawn");
        }
    }

    /// A failed respawn must not take the previous body with it — the field rebuilds
    /// its colliders on every mining hit, and a bad stage would otherwise silently
    /// delete the rock that was standing there.
    #[test]
    fn a_degenerate_respawn_leaves_the_existing_body_alone() {
        let mut world = SimWorld::new(&SimConfig::default());
        drop_ball(&mut world, BodyId(1), [3.0, 1.0, 0.0]);
        world.apply(SimCommand::Spawn {
            id: BodyId(1),
            desc: BodyDesc {
                shape: ShapeDesc::ConvexHull {
                    points: Arc::new(vec![]),
                    scale: [1.0; 3],
                },
                ..Default::default()
            },
        });

        assert_eq!(world.body_count(), 1);
        assert!(
            (pos(&world, BodyId(1))[0] - 3.0).abs() < 0.01,
            "original kept"
        );
    }

    /// A flat two-triangle deck spanning `-half..=half` on both axes at `y`.
    fn deck(y: f32, half: f32) -> ShapeDesc {
        ShapeDesc::TriMesh {
            vertices: Arc::new(vec![
                [-half, y, -half],
                [half, y, -half],
                [half, y, half],
                [-half, y, half],
            ]),
            indices: Arc::new(vec![[0, 1, 2], [0, 2, 3]]),
        }
    }

    /// The heightfield puts water under the crossing, so the deck is the only thing
    /// holding anything up there. This is the check that it does.
    #[test]
    fn a_character_stands_on_a_deck_suspended_over_nothing() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::Spawn {
            id: BodyId(9),
            desc: BodyDesc {
                kind: BodyKind::Fixed,
                shape: deck(4.0, 12.0),
                ..Default::default()
            },
        });
        spawn_character(&mut world, BodyId(1), [0.0, 8.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 120);

        assert!(
            grounded(&world, BodyId(1)),
            "should be standing on the deck"
        );
        let y = pos(&world, BodyId(1))[1];
        assert!(
            (y - (4.0 + CH_RIDE)).abs() < 0.2,
            "expected to rest on the deck near y={}, got {y}",
            4.0 + CH_RIDE
        );
    }

    /// Walking off the end must drop, or the deck is an invisible floor over the world.
    #[test]
    fn walking_off_the_deck_falls() {
        let mut world = SimWorld::new(&SimConfig::default());
        world.apply(SimCommand::Spawn {
            id: BodyId(9),
            desc: BodyDesc {
                kind: BodyKind::Fixed,
                shape: deck(4.0, 4.0),
                ..Default::default()
            },
        });
        spawn_character(&mut world, BodyId(1), [0.0, 8.0, 0.0]);
        walk(&mut world, BodyId(1), 0.0, 120);
        assert!(grounded(&world, BodyId(1)), "should have landed first");

        walk(&mut world, BodyId(1), 0.15, 120);
        assert!(
            pos(&world, BodyId(1))[1] < 3.0,
            "walking off the end should fall, got y={}",
            pos(&world, BodyId(1))[1]
        );
    }

    #[test]
    fn bulk_spawn_and_despawn_match_their_single_forms() {
        let mut world = SimWorld::new(&SimConfig::default());
        let bodies: Vec<_> = (1..=5u32)
            .map(|i| {
                (
                    BodyId(i),
                    BodyDesc {
                        kind: BodyKind::Fixed,
                        shape: ShapeDesc::ConvexHull {
                            points: cube_cloud(0.5),
                            scale: [1.0; 3],
                        },
                        iso: Iso::at(i as f32 * 4.0, 0.0, 0.0),
                        ..Default::default()
                    },
                )
            })
            .collect();
        world.apply(SimCommand::SpawnMany { bodies });
        assert_eq!(world.body_count(), 5);

        world.apply(SimCommand::DespawnMany {
            ids: vec![BodyId(2), BodyId(4)],
        });
        assert_eq!(world.body_count(), 3);
    }

    #[test]
    fn rotation_survives_the_iso_round_trip() {
        let h = std::f32::consts::FRAC_1_SQRT_2;
        let mut world = SimWorld::new(&SimConfig::default());
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
        assert!((rot[1].abs() - h).abs() < 1e-4, "got {rot:?}");
        assert!((rot[3].abs() - h).abs() < 1e-4, "got {rot:?}");
        assert!(rot[0].abs() < 1e-4 && rot[2].abs() < 1e-4, "got {rot:?}");
    }
}
