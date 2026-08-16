//! Godot adapter over [`super`].

use godot::prelude::*;

use super::{Facing, Intent, Locomotion, LocomotionState, Motion, Stance};

#[derive(GodotClass)]
#[class(no_init, base = RefCounted)]
pub struct QLocomotion {
    base: Base<RefCounted>,
    inner: Locomotion,
    state: LocomotionState,
    motion: Motion,
    facing: Facing,
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
    #[constant]
    pub const STANCE_CROUCH: i64 = Stance::Crouch as i64;
    #[constant]
    pub const STANCE_ROLL: i64 = Stance::Roll as i64;
    #[constant]
    pub const STANCE_LAND: i64 = Stance::Land as i64;
    #[constant]
    pub const STANCE_TURN_90_LEFT: i64 = Stance::Turn90Left as i64;
    #[constant]
    pub const STANCE_TURN_90_RIGHT: i64 = Stance::Turn90Right as i64;
    #[constant]
    pub const STANCE_TURN_180_LEFT: i64 = Stance::Turn180Left as i64;
    #[constant]
    pub const STANCE_TURN_180_RIGHT: i64 = Stance::Turn180Right as i64;

    #[func]
    fn create() -> Gd<Self> {
        Gd::from_init_fn(|base| Self {
            base,
            inner: Locomotion::default(),
            state: LocomotionState::default(),
            motion: Motion::default(),
            facing: Facing::default(),
        })
    }

    /// Where the body wants to go this tick, world space.
    #[func]
    fn wish_direction(&self, move_axis: Vector2, yaw: f32) -> Vector3 {
        let d = self.inner.wish_direction([move_axis.x, move_axis.y], yaw);
        Vector3::new(d[0], d[1], d[2])
    }

    /// The whole movement decision for one tick: gravity, the fall cap, whether a jump
    /// press is taken, and the speed for the heading.
    #[func]
    #[allow(clippy::too_many_arguments)]
    fn step_motion(
        &mut self,
        move_axis: Vector2,
        jump: bool,
        crouch: bool,
        roll: bool,
        velocity: Vector3,
        yaw: f32,
        grounded: bool,
        gravity_y: f32,
        delta: f32,
    ) -> Vector3 {
        self.motion = self.inner.step_motion(
            Intent {
                move_axis: [move_axis.x, move_axis.y],
                jump,
                crouch,
                roll,
            },
            [velocity.x, velocity.y, velocity.z],
            yaw,
            grounded,
            gravity_y,
            delta,
        );
        Vector3::new(
            self.motion.velocity[0],
            self.motion.velocity[1],
            self.motion.velocity[2],
        )
    }

    /// Whether the last [`Self::step_motion`] actually took a jump, rather than the
    /// caller re-deriving it from a press it already handed over.
    #[func]
    fn jumped(&self) -> bool {
        self.motion.jumped
    }

    #[func]
    fn set_jump_velocity(&mut self, value: f32) {
        self.inner.tuning.jump_velocity = value;
    }

    #[func]
    fn set_terminal_fall(&mut self, value: f32) {
        self.inner.tuning.terminal_fall = value;
    }

    /// `local_velocity` is in the character's own frame: +x right, +z backward.
    #[func]
    fn step(&mut self, local_velocity: Vector3, airborne: bool, delta: f32) {
        self.state = self.inner.step(
            [local_velocity.x, local_velocity.y, local_velocity.z],
            airborne,
            delta,
        );
    }

    /// Turns the body toward `world_velocity`, or toward `aim_yaw` when it is standing,
    /// and answers the world yaw to point it at.
    #[func]
    fn face(&mut self, world_velocity: Vector3, aim_yaw: f32, delta: f32) -> f32 {
        self.facing = self.inner.face(
            [world_velocity.x, world_velocity.y, world_velocity.z],
            aim_yaw,
            delta,
        );
        self.facing.yaw
    }

    /// What is left of the turn, radians, positive turning left.
    #[func]
    fn facing_error(&self) -> f32 {
        self.facing.error
    }

    /// Seconds the standing turn under way was committed to, and zero when there is none.
    #[func]
    fn turn_window(&self) -> f32 {
        self.facing.window
    }

    /// The yaw that faces `dir`.
    #[func]
    fn heading_of(dir: Vector3) -> f32 {
        Locomotion::heading_of([dir.x, dir.y, dir.z])
    }

    /// How fast the body comes round standing and travelling, and how far the aim has to
    /// leave it before a standing turn is taken at all.
    #[func]
    fn set_turning(&mut self, rate: f32, moving_rate: f32, deadzone: f32) {
        self.inner.tuning.turn_rate = rate;
        self.inner.tuning.turn_rate_moving = moving_rate;
        self.inner.tuning.turn_deadzone = deadzone;
    }

    #[func]
    fn blend(&self) -> Vector2 {
        Vector2::new(self.state.blend[0], self.state.blend[1])
    }

    /// The crouch ring's own position, live even while standing so the two spaces do not
    /// pop past one another as they cross-fade.
    #[func]
    fn crouch_blend(&self) -> Vector2 {
        Vector2::new(self.state.crouch_blend[0], self.state.crouch_blend[1])
    }

    #[func]
    fn is_rolling(&self) -> bool {
        self.inner.is_rolling()
    }

    /// Index into the rig's roll clips: 0 forward, 1 back, 2 left, 3 right.
    #[func]
    fn roll_variant(&self) -> i64 {
        self.inner.roll_variant() as i64
    }

    #[func]
    fn is_crouched(&self) -> bool {
        self.inner.is_crouched()
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
    fn set_crouch_speeds(&mut self, forward: f32, backward: f32, strafe: f32) {
        self.inner.tuning.crouch_speed = forward;
        self.inner.tuning.crouch_back_speed = backward;
        self.inner.tuning.crouch_strafe_speed = strafe;
    }

    #[func]
    fn set_roll(&mut self, time: f32, speed: f32) {
        self.inner.tuning.roll_time = time;
        self.inner.tuning.roll_speed = speed;
    }

    #[func]
    fn roll_time(&self) -> f32 {
        self.inner.tuning.roll_time
    }

    #[func]
    fn set_air_grace(&mut self, value: f32) {
        self.inner.tuning.air_grace = value;
    }

    /// How long the landing recovery holds the body, and the ground speed that cancels
    /// it outright.
    #[func]
    fn set_landing(&mut self, time: f32, cancel_speed: f32) {
        self.inner.tuning.land_time = time;
        self.inner.tuning.land_cancel_speed = cancel_speed;
    }

    #[func]
    fn is_landing(&self) -> bool {
        self.inner.is_landing()
    }

    #[func]
    fn set_time_scale_range(&mut self, min: f32, max: f32) {
        self.inner.tuning.time_scale_min = min;
        self.inner.tuning.time_scale_max = max;
    }
}
