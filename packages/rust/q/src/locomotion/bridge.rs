//! Godot adapter over [`super`]. The one file in the locomotion stack allowed to
//! name a Godot type, so the decision itself stays compilable into the headless
//! server unchanged.
//!
//! RefCounted rather than a node: it is per-character state the controller owns,
//! not something with a place in the scene.

use godot::prelude::*;

use super::{Locomotion, LocomotionState, Stance};

#[derive(GodotClass)]
#[class(no_init, base = RefCounted)]
pub struct QLocomotion {
    base: Base<RefCounted>,
    inner: Locomotion,
    state: LocomotionState,
}

#[godot_api]
impl QLocomotion {
    #[constant]
    pub const STANCE_MOVE: i64 = Stance::Move as i64;
    #[constant]
    pub const STANCE_JUMP: i64 = Stance::Jump as i64;
    #[constant]
    pub const STANCE_CLIMB_LOW: i64 = Stance::ClimbLow as i64;
    #[constant]
    pub const STANCE_CLIMB_HIGH: i64 = Stance::ClimbHigh as i64;

    #[func]
    fn create() -> Gd<Self> {
        Gd::from_init_fn(|base| Self {
            base,
            inner: Locomotion::default(),
            state: LocomotionState::default(),
        })
    }

    /// `local_velocity` is in the character's own frame: +x right, +z backward.
    /// Advances the decision and caches it for the getters below, so a frame
    /// costs one crossing rather than one per field.
    #[func]
    fn step(&mut self, local_velocity: Vector3, airborne: bool, delta: f32) {
        self.state = self.inner.step(
            [local_velocity.x, local_velocity.y, local_velocity.z],
            airborne,
            delta,
        );
    }

    #[func]
    fn blend(&self) -> Vector2 {
        Vector2::new(self.state.blend[0], self.state.blend[1])
    }

    #[func]
    fn time_scale(&self) -> f32 {
        self.state.time_scale
    }

    #[func]
    fn stance(&self) -> i64 {
        self.state.stance as i64
    }

    /// Top speed for a heading, `dir` normalised with y positive going backward.
    #[func]
    fn gait_speed(&self, dir: Vector2) -> f32 {
        self.inner.gait_speed([dir.x, dir.y])
    }

    #[func]
    fn begin_climb(&mut self, rise: f32) -> i64 {
        self.inner.begin_climb(rise) as i64
    }

    #[func]
    fn end_climb(&mut self) {
        self.inner.end_climb();
    }

    #[func]
    fn is_climbing(&self) -> bool {
        self.inner.is_climbing()
    }

    #[func]
    fn set_speeds(&mut self, forward: f32, backward: f32, strafe: f32) {
        self.inner.tuning.speed = forward;
        self.inner.tuning.back_speed = backward;
        self.inner.tuning.strafe_speed = strafe;
    }

    #[func]
    fn set_blend_sharpness(&mut self, value: f32) {
        self.inner.tuning.blend_sharpness = value;
    }

    #[func]
    fn set_time_scale_range(&mut self, min: f32, max: f32) {
        self.inner.tuning.time_scale_min = min;
        self.inner.tuning.time_scale_max = max;
    }
}
