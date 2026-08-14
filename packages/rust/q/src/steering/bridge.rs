//! Godot adapter over [`super`].

use godot::prelude::*;

use super::{Config, Mode, Patrol, Sense, Vec2};

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

    /// Applies the exported tuning in one call, so the node stays the one place
    /// the numbers are written down.
    #[func]
    #[allow(clippy::too_many_arguments)]
    fn configure(
        &mut self,
        speed: f32,
        max_speed: f32,
        roam_radius: f32,
        arrive_distance: f32,
        separation: f32,
        separation_strength: f32,
        personal_space: f32,
        formation_distance: f32,
        formation_spacing: f32,
        formation_columns: i64,
        rank_depth: f32,
        hold_radius: f32,
    ) {
        let c = &mut self.inner.config;
        c.speed = speed;
        c.max_speed = max_speed;
        c.roam_radius = roam_radius;
        c.arrive_distance = arrive_distance;
        c.separation = separation;
        c.separation_strength = separation_strength;
        c.personal_space = personal_space;
        c.formation_distance = formation_distance;
        c.formation_spacing = formation_spacing;
        c.formation_columns = formation_columns as i32;
        c.rank_depth = rank_depth;
        c.hold_radius = hold_radius;
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
    #[func]
    fn observe(
        &mut self,
        position: Vector3,
        facing: Vector3,
        travelled: f32,
        neighbours: PackedVector3Array,
    ) {
        self.sense.position = flat(position);
        self.sense.facing = flat(facing);
        self.sense.travelled = travelled;
        self.sense.neighbours.clear();
        self.sense
            .neighbours
            .extend(neighbours.as_slice().iter().map(|v| flat(*v)));
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
