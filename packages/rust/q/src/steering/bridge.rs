//! Godot adapter over [`super`].

use godot::prelude::*;

use super::field::{BLOCKED, Deck, Field, Grid};
use super::{Config, Mode, Neighbour, Patrol, Sense, Vec2};

fn flat(v: Vector3) -> Vec2 {
    [v.x, v.z]
}

fn wide(v: Vec2) -> Vector3 {
    Vector3::new(v[0], 0.0, v[1])
}

fn mode_id(mode: Mode) -> i64 {
    match mode {
        Mode::Roaming => 0,
        Mode::Paused => 1,
        Mode::Following => 2,
        Mode::Holding => 3,
        Mode::Unsticking => 4,
        Mode::Waiting => 5,
    }
}

/// One creature's steering, driven a tick at a time.
#[derive(GodotClass)]
#[class(no_init, base = RefCounted)]
pub struct QPatrol {
    base: Base<RefCounted>,
    inner: Patrol,
    sense: Sense,
}

#[godot_api]
impl QPatrol {
    #[constant]
    pub const MODE_ROAMING: i64 = 0;
    #[constant]
    pub const MODE_PAUSED: i64 = 1;
    #[constant]
    pub const MODE_FOLLOWING: i64 = 2;
    #[constant]
    pub const MODE_HOLDING: i64 = 3;
    #[constant]
    pub const MODE_UNSTICKING: i64 = 4;
    #[constant]
    pub const MODE_WAITING: i64 = 5;

    /// `seed` decides this creature's wander. Give each one its own, and the
    /// same one on every machine that simulates it.
    #[func]
    fn create(home: Vector3, seed: i64) -> Gd<Self> {
        Gd::from_init_fn(|base| Self {
            base,
            inner: Patrol::new(flat(home), seed as u32, Config::default()),
            sense: Sense::default(),
        })
    }

    #[func]
    fn set_slot(&mut self, slot: i64, count: i64) {
        self.inner.slot = slot as i32;
        self.inner.count = count.max(1) as i32;
    }

    #[func]
    fn set_home(&mut self, home: Vector3) {
        self.inner.set_home(flat(home));
    }

    /// How far out a neighbour still matters, so the caller gathering them asks
    /// the same tuning that will judge them.
    #[func]
    fn separation(&self) -> f32 {
        self.inner.config.separation
    }

    /// A preset's rank shape, for placing a group before any of them are steering
    /// yet. Empty for a name that is not a preset.
    #[func]
    fn preset_info(preset: GString) -> VarDictionary {
        let mut out = VarDictionary::new();
        if let Some(config) = Config::preset(&preset.to_string()) {
            out.set("formation_distance", config.formation_distance);
            out.set("formation_spacing", config.formation_spacing);
            out.set("formation_columns", config.formation_columns as i64);
            out.set("rank_depth", config.rank_depth);
        }
        out
    }

    /// Takes the named tuning, so the numbers a creature runs on are the ones the
    /// steering tests run on. `false` for a name that is not a preset, rather than
    /// leaving the caller on default tuning it never asked for.
    #[func]
    fn use_preset(&mut self, preset: GString) -> bool {
        match Config::preset(&preset.to_string()) {
            Some(config) => {
                let radius = self.inner.config.radius;
                self.inner.config = config;
                self.inner.config.radius = radius;
                true
            }
            None => {
                godot_error!("QPatrol: no steering preset called '{preset}'");
                false
            }
        }
    }

    #[func]
    fn set_stuck_limits(&mut self, stuck_speed: f32, stuck_time: f32, unstick_time: f32) {
        let c = &mut self.inner.config;
        c.stuck_speed = stuck_speed;
        c.stuck_time = stuck_time;
        c.unstick_time = unstick_time;
    }

    /// What the body can see this tick. `travelled` is how far it actually got
    /// after `move_and_slide`, which is how the stuck check knows anything.
    ///
    /// `crowd` is flat `x, z, vx, vz, radius` per neighbour. Velocity is there
    /// because position alone cannot tell a creature it is about to walk into
    /// somebody -- only that somebody is nearby, which is a different question.
    #[func]
    fn observe(
        &mut self,
        position: Vector3,
        facing: Vector3,
        velocity: Vector3,
        travelled: f32,
        crowd: PackedFloat32Array,
    ) {
        self.sense.position = flat(position);
        self.sense.facing = flat(facing);
        self.sense.velocity = flat(velocity);
        self.sense.travelled = travelled;
        self.sense.neighbours.clear();
        self.sense
            .neighbours
            .extend(crowd.as_slice().chunks_exact(5).map(|c| Neighbour {
                position: [c[0], c[1]],
                velocity: [c[2], c[3]],
                radius: c[4],
            }));
    }

    /// This body's own radius, so what counts as a collision is measured rather
    /// than assumed. Godot builds the capsule, so Godot is what knows. Everything
    /// else about how it dodges comes from the preset.
    #[func]
    fn set_body(&mut self, radius: f32) {
        self.inner.config.radius = radius.max(0.05);
    }

    /// The leader is an obstacle as well as a destination.
    #[func]
    fn observe_leader(&mut self, position: Vector3, facing: Vector3, speed: f32) {
        self.sense.leader = Some(flat(position));
        self.sense.leader_facing = flat(facing);
        self.sense.leader_speed = speed;
    }

    #[func]
    fn clear_leader(&mut self) {
        self.sense.leader = None;
    }

    /// The direction a flow field wants this creature to take, and whether the
    /// field can route to the leader at all.
    ///
    /// `reachable` false is not the same as having no route: it means the field
    /// looked and there is no way through. Steering straight at the leader then
    /// is how a creature ends up leaning on a riverbank until they move.
    #[func]
    fn observe_route(&mut self, route: Vector3, reachable: bool) {
        let flat = flat(route);
        self.sense.route = if flat[0].abs() + flat[1].abs() > 1e-4 {
            Some(flat)
        } else {
            None
        };
        self.sense.route_blocked = !reachable;
    }

    #[func]
    fn clear_route(&mut self) {
        self.sense.route = None;
        self.sense.route_blocked = false;
    }

    /// Returns `wish`, `face` and `mode`.
    #[func]
    fn step(&mut self, delta: f32) -> VarDictionary {
        let step = self.inner.step(&self.sense, delta);
        let mut out = VarDictionary::new();
        out.set("wish", wide(step.wish));
        out.set("face", wide(step.face));
        out.set("mode", mode_id(step.mode));
        out
    }

    #[func]
    fn target(&self) -> Vector3 {
        wide(self.inner.target())
    }

    #[func]
    fn mode(&self) -> i64 {
        mode_id(self.inner.mode())
    }
}

/// One goal's flow field, shared by every creature heading for it.
#[derive(GodotClass)]
#[class(no_init, base = RefCounted)]
pub struct QFlowField {
    base: Base<RefCounted>,
    inner: Field,
}

#[godot_api]
impl QFlowField {
    /// A grid of `cells` squares of `cell_size`, centred on the world origin.
    #[func]
    fn create(extent: f32, cell_size: f32) -> Gd<Self> {
        let cells = ((extent * 2.0) / cell_size.max(0.1)).ceil().max(1.0) as usize;
        let grid = Grid::new([-extent, -extent], cell_size, cells, cells);
        Gd::from_init_fn(|base| Self {
            base,
            inner: Field::new(grid),
        })
    }

    /// Reads the terrain the field sits on, closing water and anything too steep.
    #[func]
    fn stamp_terrain(
        &mut self,
        heights: PackedFloat32Array,
        res: i64,
        extent: f32,
        water_level: f32,
        max_slope: f32,
    ) {
        self.inner.stamp_terrain(
            heights.as_slice(),
            res.max(0) as usize,
            extent,
            water_level,
            max_slope,
        );
    }

    /// Closes a disc, which is how a rock or a tree reaches the field.
    #[func]
    fn block_disc(&mut self, centre: Vector3, radius: f32) {
        self.inner.grid.block_disc(flat(centre), radius);
    }

    /// Raises cost without closing it: ground that is crossable but unwelcome.
    #[func]
    fn stamp_disc(&mut self, centre: Vector3, radius: f32, cost: i64) {
        self.inner
            .grid
            .stamp_disc(flat(centre), radius, cost.clamp(0, 254) as u8);
    }

    /// Takes scatter -- trees, rocks -- as flat `x, y, radius` triples and adds
    /// it by how much of each cell it fills.
    ///
    /// Blocking the cell a trunk stands in would wall off ground a mech walks
    /// through daily, and `block_disc` on something narrower than a cell mostly
    /// misses. This gets both: a lone tree is cost, a thicket is a wall.
    #[func]
    fn stamp_obstacles(&mut self, discs: PackedFloat32Array, block_ratio: f32, cost_scale: f32) {
        self.inner
            .grid
            .stamp_coverage(discs.as_slice(), block_ratio, cost_scale);
    }

    /// What the field ended up with: `cells`, `blocked` and `reachable`. Worth
    /// printing once after a build, because a field that closed too much routes
    /// nothing and looks exactly like a field that was never built.
    #[func]
    fn stats(&self) -> VarDictionary {
        let g = &self.inner.grid;
        let mut blocked = 0i64;
        let mut reachable = 0i64;
        for y in 0..g.height {
            for x in 0..g.width {
                if g.cost(x, y) == BLOCKED {
                    blocked += 1;
                } else if self.inner.distance_at(g.centre_of(x, y)).is_finite() {
                    reachable += 1;
                }
            }
        }
        let mut out = VarDictionary::new();
        out.set("cells", (g.width * g.height) as i64);
        out.set("blocked", blocked);
        out.set("reachable", reachable);
        out
    }

    /// Reopens a line of cells across ground the terrain closed, for a bridge.
    ///
    /// Must be called after `inflate`, or the clearance grown off the riverbank
    /// closes the crossing straight back up.
    #[func]
    fn open_path(&mut self, from: Vector3, to: Vector3, half_width: f32, cost: i64) {
        self.inner
            .grid
            .open_path(flat(from), flat(to), half_width, cost.clamp(1, 254) as u8);
    }

    /// Closes a band of cells along a line, for a structure that is mostly wall.
    ///
    /// Must be called before `inflate` and before `open_path`: a bridge is a
    /// solid causeway carrying one walkable line, so the band goes down first and
    /// the line is cut back out of it afterwards.
    #[func]
    fn block_path(&mut self, from: Vector3, to: Vector3, half_width: f32) {
        self.inner.grid.block_path(flat(from), flat(to), half_width);
    }

    /// Tells the field that a stretch of it is a raised walkway, so a body under
    /// the thing stops being told to walk on through.
    ///
    /// The grid is flat and cannot tell a deck from the riverbed beneath it. This
    /// is the one exception, and `surface_y` is what separates the two.
    #[func]
    fn set_deck(&mut self, from: Vector3, to: Vector3, half_width: f32, surface_y: f32, drop: f32) {
        self.inner.set_deck(Some(Deck {
            from: flat(from),
            to: flat(to),
            half_width,
            surface_y,
            drop,
        }));
    }

    #[func]
    fn clear_deck(&mut self) {
        self.inner.set_deck(None);
    }

    /// Whether this point is inside a walkway's footprint but below its surface.
    /// True means every flat answer the field gives here is about ground the body
    /// cannot reach, and it should be steered out rather than onward.
    #[func]
    fn under_deck(&self, at: Vector3) -> bool {
        self.inner.under_deck([at.x, at.y, at.z])
    }

    /// Grows every obstacle by a body radius, so the routes it hands out fit
    /// the thing following them.
    #[func]
    fn inflate(&mut self, radius: f32) {
        self.inner.grid.inflate(radius);
    }

    #[func]
    fn clear(&mut self) {
        self.inner.grid.fill(1);
    }

    #[func]
    fn build(&mut self, goal: Vector3) {
        self.inner.build(flat(goal));
    }

    /// Rebuilds only when the goal has moved far enough to matter. A full
    /// integration is far too slow to run every frame for a walking target.
    #[func]
    fn rebuild_if_moved(&mut self, goal: Vector3, slack: f32) -> bool {
        self.inner.rebuild_if_moved(flat(goal), slack)
    }

    /// Which way to walk from here, or zero where the field cannot help and the
    /// caller should steer straight at its target instead.
    #[func]
    fn direction_at(&self, at: Vector3) -> Vector3 {
        match self.inner.direction_at(flat(at)) {
            Some(dir) => wide(dir),
            None => Vector3::ZERO,
        }
    }

    /// Cost-weighted distance to the goal, or -1 where it cannot be reached.
    #[func]
    fn distance_at(&self, at: Vector3) -> f32 {
        let d = self.inner.distance_at(flat(at));
        if d.is_finite() { d } else { -1.0 }
    }

    #[func]
    fn is_blocked(&self, at: Vector3) -> bool {
        let g = &self.inner.grid;
        if g.outside(flat(at)) {
            return true;
        }
        let (x, y) = g.cell_of(flat(at));
        g.cost(x, y) == BLOCKED
    }
}
