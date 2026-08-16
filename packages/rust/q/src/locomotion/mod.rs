//! What a character is doing on its feet, decided independently of how it is drawn.

#[cfg(feature = "client")]
pub mod bridge;

/// Ground speeds a gait's clips were authored at, and the blend-space ring the gait
/// sits on.
#[derive(Clone, Copy, Debug)]
pub struct Gait {
    pub radius: f32,
    pub fwd: f32,
    pub lateral: f32,
    pub back: f32,
}

/// Walk on the inner ring, jog on the outer.
pub const GAITS: [Gait; 2] = [
    Gait {
        radius: 1.0,
        fwd: 1.01,
        lateral: 0.64,
        back: 1.07,
    },
    Gait {
        radius: 2.0,
        fwd: 5.36,
        lateral: 3.21,
        back: 4.36,
    },
];

/// Crouch has one ring of its own rather than a rung on the standing ladder, since
/// nothing blends between a crouch and a jog without passing through a stand.
pub const CROUCH_GAIT: Gait = Gait {
    radius: 1.0,
    fwd: 0.56,
    lateral: 0.51,
    back: 0.69,
};

/// Which clip set owns the body.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Stance {
    Move = 0,
    Jump = 1,
    ClimbLow = 2,
    ClimbHigh = 3,
    Crouch = 4,
    Roll = 5,
    Land = 6,
    Turn90Left = 7,
    Turn90Right = 8,
    Turn180Left = 9,
    Turn180Right = 10,
}

impl Stance {
    pub fn from_u8(value: u8) -> Self {
        match value {
            1 => Self::Jump,
            2 => Self::ClimbLow,
            3 => Self::ClimbHigh,
            4 => Self::Crouch,
            5 => Self::Roll,
            6 => Self::Land,
            7 => Self::Turn90Left,
            8 => Self::Turn90Right,
            9 => Self::Turn180Left,
            10 => Self::Turn180Right,
            _ => Self::Move,
        }
    }

    /// Whether this stance is a standing turn, which is the one thing that moves the body
    /// without any velocity under it.
    pub fn is_turn(self) -> bool {
        matches!(
            self,
            Self::Turn90Left | Self::Turn90Right | Self::Turn180Left | Self::Turn180Right
        )
    }
}

/// Top speeds and blend rates.
#[derive(Clone, Copy, Debug)]
pub struct Tuning {
    /// Top speed running forward.
    pub speed: f32,
    pub back_speed: f32,
    pub strafe_speed: f32,
    /// How fast the ring position chases the heading, per second.
    pub blend_sharpness: f32,
    /// Playback rescaling bounds.
    pub time_scale_min: f32,
    pub time_scale_max: f32,
    /// Rise above which a climb uses the tall clip instead of the short one.
    pub climb_split: f32,
    pub jump_velocity: f32,
    /// Capped so a fall that never lands cannot wind gravity up without bound.
    pub terminal_fall: f32,
    /// Horizontal speed shed per tick when nothing is asking for movement.
    pub stop_rate: f32,
    /// Crouched top speeds, kept near what the crouch clips were authored for so the
    /// rescaling stays inside its bounds.
    pub crouch_speed: f32,
    pub crouch_back_speed: f32,
    pub crouch_strafe_speed: f32,
    /// How long a roll owns the body, and how fast it carries it.
    pub roll_time: f32,
    pub roll_speed: f32,
    /// Airborne this long before the rig is told to leave the move state, so a step off
    /// a kerb or a frame of float on a slope does not fire the whole jump chain.
    pub air_grace: f32,
    /// How long the recovery after a landing holds the body. The landing clip is a
    /// single pose rather than a ring, so every frame of it spent travelling is a frame
    /// of skating -- it is deliberately far shorter than the clip was authored at.
    pub land_time: f32,
    /// Ground speed that cancels the recovery outright. Walking out of a landing has to
    /// win over finishing the clip, or the feet slide for as long as it has left.
    pub land_cancel_speed: f32,
    /// How fast the body comes round on the spot, radians per second.
    pub turn_rate: f32,
    /// How fast it comes round while travelling. Deliberately far quicker: a run that
    /// turns at standing pace reads as ice, and the ring is already leaning through it.
    pub turn_rate_moving: f32,
    /// Ground speed above which facing follows travel instead of the aim.
    pub turn_idle_speed: f32,
    /// How far the aim has to leave the body before a standing turn is worth taking.
    /// Below it the body holds still, so looking around does not drag the feet with it.
    pub turn_deadzone: f32,
    /// Remaining error that finishes a standing turn. Paired with the deadzone this is
    /// hysteresis: without it the body would chatter in and out of a turn at the
    /// threshold.
    pub turn_settle: f32,
    /// Standing turn wider than this plays the half circle rather than the quarter.
    pub turn_half_split: f32,
}

impl Default for Tuning {
    fn default() -> Self {
        Self {
            speed: 5.0,
            back_speed: 2.0,
            strafe_speed: 2.2,
            blend_sharpness: 12.0,
            time_scale_min: 0.6,
            time_scale_max: 1.8,
            climb_split: 1.35,
            jump_velocity: 4.5,
            terminal_fall: 55.0,
            stop_rate: 5.0,
            crouch_speed: 0.85,
            crouch_back_speed: 0.65,
            crouch_strafe_speed: 0.70,
            roll_time: 0.85,
            roll_speed: 6.0,
            air_grace: 0.12,
            land_time: 0.32,
            land_cancel_speed: 0.5,
            turn_rate: 3.2,
            turn_rate_moving: 9.0,
            turn_idle_speed: 0.35,
            turn_deadzone: 0.79,
            turn_settle: 0.06,
            turn_half_split: 2.36,
        }
    }
}

/// What the controller is asking for this tick, which is all a server needs to be sent.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Intent {
    pub move_axis: [f32; 2],
    pub jump: bool,
    /// Held, so the stance lasts exactly as long as the key does.
    pub crouch: bool,
    /// An edge, not a level: the roll it starts runs to its own end.
    pub roll: bool,
}

/// Velocity the body should carry into its collide-and-slide, plus whatever the step
/// decided that the caller has to react to.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Motion {
    pub velocity: [f32; 3],
    /// True on the tick a jump was actually taken, so the caller does not have to
    /// re-derive whether the press was accepted.
    pub jumped: bool,
}

impl Default for Motion {
    fn default() -> Self {
        Self {
            velocity: [0.0; 3],
            jumped: false,
        }
    }
}

/// Which way the body is pointed, which is its own decision rather than a reading taken
/// off the last two positions.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Facing {
    /// World yaw, radians, zero facing -z.
    pub yaw: f32,
    /// Signed angle still to come round, positive turning left. What is left of a turn is
    /// what the ring leans through, so this is the whole of the lean.
    pub error: f32,
    /// Seconds the standing turn in progress was committed to, and zero when the body is
    /// not turning on the spot. A turn clip is authored at one length and used for every
    /// width of turn, so it only lands on the feet if it is replayed over this.
    pub window: f32,
}

/// The decision, as the rig and the wire both want it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LocomotionState {
    /// Position in the blend space, in the character's own frame: x right, y forward.
    pub blend: [f32; 2],
    /// The same heading solved against the crouch ring. Carried every tick rather than
    /// only while crouched, so the two spaces are both current while they cross-fade.
    pub crouch_blend: [f32; 2],
    pub time_scale: f32,
    pub stance: Stance,
}

impl Default for LocomotionState {
    fn default() -> Self {
        Self {
            blend: [0.0, 0.0],
            crouch_blend: [0.0, 0.0],
            time_scale: 1.0,
            stance: Stance::Move,
        }
    }
}

/// Per-character locomotion decision.
#[derive(Clone, Debug)]
pub struct Locomotion {
    pub tuning: Tuning,
    blend: [f32; 2],
    crouch_blend: [f32; 2],
    climbing: Option<Stance>,
    /// Whether the last motion step was taken crouched, which is what decides both the
    /// speed the body travels and the ring the rig reads.
    crouched: bool,
    /// Time left in the roll that owns the body, and the heading it was launched on.
    roll_t: f32,
    roll_dir: [f32; 3],
    air_t: f32,
    land_t: f32,
    facing: f32,
    /// The standing turn the body has committed to, held until it is turned out so that
    /// the aim wandering back inside the deadzone cannot abandon it half way round.
    turning: Option<Stance>,
    /// How wide that turn was when it was taken, which is what its clip is fitted to.
    turn_span: f32,
}

impl Default for Locomotion {
    fn default() -> Self {
        Self::new(Tuning::default())
    }
}

impl Locomotion {
    pub fn new(tuning: Tuning) -> Self {
        Self {
            tuning,
            blend: [0.0, 0.0],
            crouch_blend: [0.0, 0.0],
            climbing: None,
            crouched: false,
            roll_t: 0.0,
            roll_dir: [0.0, 0.0, -1.0],
            air_t: 0.0,
            land_t: 0.0,
            facing: 0.0,
            turning: None,
            turn_span: 0.0,
        }
    }

    pub fn is_landing(&self) -> bool {
        self.land_t > 0.0
    }

    /// Top speed for a heading, in whichever stance the body is currently in.
    pub fn gait_speed(&self, dir: [f32; 2]) -> f32 {
        let t = &self.tuning;
        let (fwd, back, strafe) = if self.crouched {
            (t.crouch_speed, t.crouch_back_speed, t.crouch_strafe_speed)
        } else {
            (t.speed, t.back_speed, t.strafe_speed)
        };
        if dir[1] < 0.0 {
            lerp(strafe, back, -dir[1])
        } else {
            lerp(strafe, fwd, dir[1])
        }
    }

    pub fn is_crouched(&self) -> bool {
        self.crouched
    }

    pub fn is_rolling(&self) -> bool {
        self.roll_t > 0.0
    }

    /// Where the body wants to go, in world space, from an intent and a heading.
    pub fn wish_direction(&self, move_axis: [f32; 2], yaw: f32) -> [f32; 3] {
        let local = [move_axis[0], -move_axis[1]];
        let length = (local[0] * local[0] + local[1] * local[1]).sqrt();
        if length < 0.0001 {
            return [0.0; 3];
        }
        let (sin, cos) = yaw.sin_cos();
        let x = cos * local[0] + sin * local[1];
        let z = -sin * local[0] + cos * local[1];
        let scale = 1.0 / length;
        [x * scale, 0.0, z * scale]
    }

    /// Decides the velocity for one tick.
    pub fn step_motion(
        &mut self,
        intent: Intent,
        velocity: [f32; 3],
        yaw: f32,
        grounded: bool,
        gravity_y: f32,
        dt: f32,
    ) -> Motion {
        let mut out = velocity;
        let mut jumped = false;

        self.roll_t = (self.roll_t - dt).max(0.0);
        if intent.roll && grounded && self.roll_t <= 0.0 && self.climbing.is_none() {
            self.roll_t = self.tuning.roll_time;
            self.roll_dir = self.roll_heading(intent.move_axis, yaw);
        }
        let rolling = self.roll_t > 0.0;
        self.crouched = intent.crouch && grounded && !rolling;

        if !grounded {
            out[1] += gravity_y * dt;
            out[1] = out[1].max(-self.tuning.terminal_fall);
        }
        if intent.jump && grounded && !rolling {
            out[1] = self.tuning.jump_velocity;
            jumped = true;
        }

        let axis = intent.move_axis;
        let length = (axis[0] * axis[0] + axis[1] * axis[1]).sqrt();
        if rolling {
            out[0] = self.roll_dir[0] * self.tuning.roll_speed;
            out[2] = self.roll_dir[2] * self.tuning.roll_speed;
        } else if length > 0.0001 {
            let dir = self.wish_direction(axis, yaw);
            let speed = self.gait_speed([axis[0] / length, axis[1] / length]);
            out[0] = dir[0] * speed;
            out[2] = dir[2] * speed;
        } else {
            out[0] = move_toward(out[0], 0.0, self.tuning.stop_rate);
            out[2] = move_toward(out[2], 0.0, self.tuning.stop_rate);
        }

        Motion {
            velocity: out,
            jumped,
        }
    }

    /// A roll thrown with no stick on it goes where the body is looking, rather than
    /// rolling on the spot.
    fn roll_heading(&self, move_axis: [f32; 2], yaw: f32) -> [f32; 3] {
        let dir = self.wish_direction(move_axis, yaw);
        if dir[0].abs() + dir[2].abs() > 0.0001 {
            dir
        } else {
            self.wish_direction([0.0, 1.0], yaw)
        }
    }

    /// World yaw the body is pointed along.
    pub fn facing(&self) -> f32 {
        self.facing
    }

    /// The yaw that faces `dir`, which is the inverse of [`Self::wish_direction`].
    pub fn heading_of(dir: [f32; 3]) -> f32 {
        (-dir[0]).atan2(-dir[2])
    }

    /// Turns the body toward where it is going, or toward the aim when it is not going
    /// anywhere, and reports what is left of the turn.
    ///
    /// Travel wins over aim while moving because a body that pointed at the camera would
    /// strafe everywhere and never turn; aim wins while standing because that is the only
    /// way a turn can be taken before the movement it is preparing for rather than after.
    pub fn face(&mut self, world_velocity: [f32; 3], aim_yaw: f32, dt: f32) -> Facing {
        let speed =
            (world_velocity[0] * world_velocity[0] + world_velocity[2] * world_velocity[2]).sqrt();
        let moving = speed > self.tuning.turn_idle_speed;
        let target = if moving {
            Self::heading_of(world_velocity)
        } else {
            aim_yaw
        };
        let error = wrap_angle(target - self.facing);

        let mut window = 0.0;
        if moving {
            self.turning = None;
        } else {
            if self.turning.is_none() {
                if error.abs() < self.tuning.turn_deadzone {
                    return Facing {
                        yaw: self.facing,
                        error,
                        window: 0.0,
                    };
                }
                self.turning = Some(turn_stance(error, self.tuning.turn_half_split));
                self.turn_span = error.abs();
            } else if error.abs() <= self.tuning.turn_settle {
                self.turning = None;
                return Facing {
                    yaw: self.facing,
                    error,
                    window: 0.0,
                };
            }
            window = self.turn_span / self.tuning.turn_rate.max(0.01);
        }

        let step = if moving {
            self.tuning.turn_rate_moving
        } else {
            self.tuning.turn_rate
        } * dt;
        self.facing = wrap_angle(self.facing + error.clamp(-step, step));
        Facing {
            yaw: self.facing,
            error: wrap_angle(target - self.facing),
            window,
        }
    }

    /// Latches a climb, so a body the controller reports airborne mid-haul does not
    /// travel back out of the climb it is halfway through.
    pub fn begin_climb(&mut self, rise: f32) -> Stance {
        let stance = if rise <= self.tuning.climb_split {
            Stance::ClimbLow
        } else {
            Stance::ClimbHigh
        };
        self.climbing = Some(stance);
        stance
    }

    pub fn end_climb(&mut self) {
        self.climbing = None;
    }

    pub fn is_climbing(&self) -> bool {
        self.climbing.is_some()
    }

    /// `local_velocity` is in the character's own frame: +x right, +z backward.
    pub fn step(&mut self, local_velocity: [f32; 3], airborne: bool, dt: f32) -> LocomotionState {
        let flat = [local_velocity[0], -local_velocity[2]];
        let speed = (flat[0] * flat[0] + flat[1] * flat[1]).sqrt();
        let dir = if speed > 0.001 {
            [flat[0] / speed, flat[1] / speed]
        } else {
            [0.0, 0.0]
        };

        let radius = self.radius_for(speed, dir);
        let crouch_radius = self.crouch_radius_for(speed, dir);
        let weight = (self.tuning.blend_sharpness * dt).clamp(0.0, 1.0);
        self.blend = [
            lerp(self.blend[0], dir[0] * radius, weight),
            lerp(self.blend[1], dir[1] * radius, weight),
        ];
        self.crouch_blend = [
            lerp(self.crouch_blend[0], dir[0] * crouch_radius, weight),
            lerp(self.crouch_blend[1], dir[1] * crouch_radius, weight),
        ];

        let landed = !airborne && self.air_t > self.tuning.air_grace;
        self.air_t = if airborne { self.air_t + dt } else { 0.0 };
        if landed {
            self.land_t = self.tuning.land_time;
        } else {
            self.land_t = (self.land_t - dt).max(0.0);
        }
        if speed > self.tuning.land_cancel_speed {
            self.land_t = 0.0;
        }

        LocomotionState {
            blend: self.blend,
            crouch_blend: self.crouch_blend,
            time_scale: if self.crouched {
                self.crouch_time_scale(speed, dir)
            } else {
                self.time_scale(speed, dir, radius)
            },
            stance: match self.climbing {
                Some(climb) => climb,
                None if self.roll_t > 0.0 => Stance::Roll,
                None if self.air_t > self.tuning.air_grace => Stance::Jump,
                None if self.crouched => Stance::Crouch,
                None if self.land_t > 0.0 => Stance::Land,
                None => self.turning.unwrap_or(Stance::Move),
            },
        }
    }

    /// The crouch ring is a single circle, so the heading only has to be scaled into it
    /// rather than solved between two rungs.
    pub fn crouch_radius_for(&self, speed: f32, dir: [f32; 2]) -> f32 {
        let authored = Self::authored(&CROUCH_GAIT, dir).max(0.01);
        CROUCH_GAIT.radius * (speed / authored).clamp(0.0, 1.0)
    }

    /// Under the authored speed the ring pulls toward the crouch idle instead, so only
    /// the overspeed is taken out on playback.
    pub fn crouch_time_scale(&self, speed: f32, dir: [f32; 2]) -> f32 {
        let authored = Self::authored(&CROUCH_GAIT, dir).max(0.01);
        if speed <= authored {
            return 1.0;
        }
        (speed / authored).clamp(self.tuning.time_scale_min, self.tuning.time_scale_max)
    }

    /// Ground speed the blended clip covers in this direction, which is what the ring
    /// radius has to be solved against.
    fn authored(gait: &Gait, dir: [f32; 2]) -> f32 {
        let toward = if dir[1] >= 0.0 { gait.fwd } else { gait.back };
        lerp(gait.lateral, toward, dir[1].abs())
    }

    /// Inverse of the ring layout: the radius whose blended clip is authored for this
    /// speed, so the gait matches the ground instead of being scaled into place.
    pub fn radius_for(&self, speed: f32, dir: [f32; 2]) -> f32 {
        let slow = Self::authored(&GAITS[0], dir);
        let fast = Self::authored(&GAITS[1], dir);
        if speed <= slow {
            return GAITS[0].radius * (speed / slow.max(0.01));
        }
        let t = (speed - slow) / (fast - slow).max(0.01);
        lerp(GAITS[0].radius, GAITS[1].radius, t.clamp(0.0, 1.0))
    }

    pub fn time_scale(&self, speed: f32, dir: [f32; 2], radius: f32) -> f32 {
        if speed < 0.05 {
            return 1.0;
        }
        let slow = Self::authored(&GAITS[0], dir);
        let fast = Self::authored(&GAITS[1], dir);
        let expected = lerp(slow, fast, (radius - GAITS[0].radius).clamp(0.0, 1.0));
        (speed / expected.max(0.01)).clamp(self.tuning.time_scale_min, self.tuning.time_scale_max)
    }
}

/// Which turn clip covers `error`, by side and by width.
fn turn_stance(error: f32, half_split: f32) -> Stance {
    match (error > 0.0, error.abs() >= half_split) {
        (true, false) => Stance::Turn90Left,
        (false, false) => Stance::Turn90Right,
        (true, true) => Stance::Turn180Left,
        (false, true) => Stance::Turn180Right,
    }
}

/// Into -pi..pi, so the body always turns the short way round.
fn wrap_angle(radians: f32) -> f32 {
    let turn = std::f32::consts::TAU;
    let shifted = (radians + std::f32::consts::PI).rem_euclid(turn);
    shifted - std::f32::consts::PI
}

fn lerp(from: f32, to: f32, t: f32) -> f32 {
    from + (to - from) * t
}

fn move_toward(from: f32, to: f32, delta: f32) -> f32 {
    if (to - from).abs() <= delta {
        to
    } else {
        from + (to - from).signum() * delta
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FWD: [f32; 2] = [0.0, 1.0];
    const BACK: [f32; 2] = [0.0, -1.0];
    const SIDE: [f32; 2] = [1.0, 0.0];

    fn loco() -> Locomotion {
        Locomotion::default()
    }

    /// A clip played at the speed it was authored for must not be rescaled at all.
    #[test]
    fn authored_speeds_need_no_rescaling() {
        let l = loco();
        for (dir, speed) in [
            (FWD, GAITS[0].fwd),
            (FWD, GAITS[1].fwd),
            (BACK, GAITS[0].back),
            (BACK, GAITS[1].back),
            (SIDE, GAITS[0].lateral),
            (SIDE, GAITS[1].lateral),
        ] {
            let radius = l.radius_for(speed, dir);
            let scale = l.time_scale(speed, dir, radius);
            assert!(
                (scale - 1.0).abs() < 0.02,
                "dir {dir:?} at {speed} rescaled to {scale}"
            );
        }
    }

    #[test]
    fn authored_speeds_land_on_their_own_ring() {
        let l = loco();
        for (dir, gait) in [
            (FWD, 0),
            (BACK, 0),
            (SIDE, 0),
            (FWD, 1),
            (BACK, 1),
            (SIDE, 1),
        ] {
            let speed = Locomotion::authored(&GAITS[gait], dir);
            let radius = l.radius_for(speed, dir);
            assert!(
                (radius - GAITS[gait].radius).abs() < 0.02,
                "dir {dir:?} at {speed} landed on ring {radius}, wanted {}",
                GAITS[gait].radius
            );
        }
    }

    /// Backward is not forward mirrored.
    #[test]
    fn backward_is_not_forward_mirrored() {
        let l = loco();
        let speed = 3.0;
        assert_ne!(l.radius_for(speed, FWD), l.radius_for(speed, BACK));
        assert!(l.radius_for(speed, BACK) > l.radius_for(speed, FWD));
    }

    #[test]
    fn standing_still_sits_at_the_idle_point() {
        let l = loco();
        assert_eq!(l.radius_for(0.0, FWD), 0.0);
        assert_eq!(l.time_scale(0.0, FWD, 0.0), 1.0);
    }

    #[test]
    fn rescaling_is_bounded() {
        let l = loco();
        for speed in [0.0, 0.2, 1.0, 5.0, 40.0, 1000.0] {
            let radius = l.radius_for(speed, FWD);
            let scale = l.time_scale(speed, FWD, radius);
            assert!(
                scale >= l.tuning.time_scale_min && scale <= l.tuning.time_scale_max,
                "{speed} produced {scale}"
            );
        }
    }

    #[test]
    fn ring_never_leaves_the_blend_space() {
        let l = loco();
        for speed in [0.0, 1.0, 5.0, 100.0] {
            for dir in [FWD, BACK, SIDE, [0.707, 0.707], [-0.707, -0.707]] {
                let r = l.radius_for(speed, dir);
                assert!(r >= 0.0 && r <= GAITS[1].radius + 0.001, "{speed} -> {r}");
            }
        }
    }

    fn drive(l: &mut Locomotion, velocity: [f32; 3], aim: f32, seconds: f32) -> Facing {
        let dt = 1.0 / 60.0;
        let mut out = Facing::default();
        for _ in 0..(seconds / dt) as usize {
            out = l.face(velocity, aim, dt);
        }
        out
    }

    /// The one that matters: the yaw a body is given has to be the yaw that sends it where
    /// it is going. Read the other way round by mistake it is off by half a turn, which is
    /// a character sprinting backwards -- exactly what the online avatar did.
    #[test]
    fn the_heading_of_a_direction_faces_that_direction() {
        let l = loco();
        for axis in [FWD, BACK, SIDE, [-1.0, 0.0], [0.6, -0.8]] {
            for yaw in [0.0, 0.7, -2.4, 3.0] {
                let dir = l.wish_direction(axis, yaw);
                let round_trip = l.wish_direction(FWD, Locomotion::heading_of(dir));
                assert!(
                    dir[0] * round_trip[0] + dir[2] * round_trip[2] > 0.999,
                    "{axis:?}@{yaw}: {dir:?} came back as {round_trip:?}"
                );
            }
        }
    }

    #[test]
    fn facing_settles_on_the_way_the_body_travels() {
        let mut l = loco();
        let out = drive(&mut l, [5.0, 0.0, 0.0], 0.0, 2.0);
        let dir = l.wish_direction(FWD, out.yaw);
        assert!(dir[0] > 0.999, "travelling +x the body faced {dir:?}");
        assert!(out.error.abs() < 0.01, "left {} to turn", out.error);
    }

    /// Looking around is not walking around: a small camera move must not drag the feet.
    #[test]
    fn a_standing_body_ignores_a_glance() {
        let mut l = loco();
        let out = drive(&mut l, [0.0; 3], 0.5, 2.0);
        assert_eq!(out.yaw, 0.0, "a half-radian glance turned the body");
        assert_eq!(out.window, 0.0);
    }

    #[test]
    fn a_standing_body_turns_to_a_committed_look() {
        let mut l = loco();
        let mut state = LocomotionState::default();
        let mut saw = Stance::Move;
        for _ in 0..30 {
            l.face([0.0; 3], 1.4, 1.0 / 60.0);
            state = l.step([0.0; 3], false, 1.0 / 60.0);
            if state.stance.is_turn() {
                saw = state.stance;
            }
        }
        assert_eq!(saw, Stance::Turn90Left, "turning left played {saw:?}");
        let out = drive(&mut l, [0.0; 3], 1.4, 2.0);
        assert!((out.yaw - 1.4).abs() < 0.02, "settled at {}", out.yaw);
        assert!(!state.stance.is_turn() || out.window > 0.0);
    }

    #[test]
    fn a_wide_turn_takes_the_half_circle() {
        let mut l = loco();
        l.face([0.0; 3], 3.0, 1.0 / 60.0);
        let state = l.step([0.0; 3], false, 1.0 / 60.0);
        assert_eq!(state.stance, Stance::Turn180Left);
    }

    /// The aim wandering back inside the deadzone mid-turn must not abandon it, or the
    /// body stops half way round and stays there.
    #[test]
    fn a_turn_once_taken_is_finished() {
        let mut l = loco();
        l.face([0.0; 3], 1.4, 1.0 / 60.0);
        let out = drive(&mut l, [0.0; 3], 0.6, 2.0);
        assert!((out.yaw - 0.6).abs() < 0.02, "abandoned at {}", out.yaw);
    }

    #[test]
    fn the_body_turns_the_short_way_round() {
        let mut l = loco();
        let out = drive(&mut l, [0.0; 3], -3.0, 0.1);
        assert!(out.yaw < 0.0, "went the long way, reaching {}", out.yaw);
    }

    /// While the body is still coming round, its travel is across it rather than along it
    /// -- which is the whole of the lean, and why the ring is fed the facing frame.
    #[test]
    fn a_turn_in_progress_leaves_the_body_travelling_sideways() {
        let mut l = loco();
        let out = l.face([5.0, 0.0, 0.0], 0.0, 1.0 / 60.0);
        assert!(out.error.abs() > 1.0, "no lean left: {}", out.error);
    }

    /// +z is backward in the input frame.
    #[test]
    fn forward_velocity_blends_forward() {
        let mut l = loco();
        let mut state = LocomotionState::default();
        for _ in 0..200 {
            state = l.step([0.0, 0.0, -1.01], false, 1.0 / 60.0);
        }
        assert!(state.blend[1] > 0.9, "blend {:?}", state.blend);
        assert!(state.blend[0].abs() < 0.01);
    }

    #[test]
    fn blend_eases_rather_than_snapping() {
        let mut l = loco();
        let first = l.step([0.0, 0.0, -5.36], false, 1.0 / 60.0);
        assert!(
            first.blend[1] < 0.5,
            "one frame jumped straight to {:?}",
            first.blend
        );
        for _ in 0..300 {
            l.step([0.0, 0.0, -5.36], false, 1.0 / 60.0);
        }
        let settled = l.step([0.0, 0.0, -5.36], false, 1.0 / 60.0);
        assert!(settled.blend[1] > 1.9, "settled at {:?}", settled.blend);
    }

    /// Airborne past the grace window, since a single frame off the floor is not a jump.
    fn airborne(l: &mut Locomotion) -> Stance {
        let mut stance = Stance::Move;
        for _ in 0..20 {
            stance = l.step([0.0; 3], true, 0.016).stance;
        }
        stance
    }

    #[test]
    fn airborne_reads_as_jump_but_a_climb_outranks_it() {
        let mut l = loco();
        assert_eq!(l.step([0.0; 3], false, 0.016).stance, Stance::Move);
        assert_eq!(airborne(&mut l), Stance::Jump);

        l.step([0.0; 3], false, 0.016);
        assert_eq!(l.begin_climb(1.0), Stance::ClimbLow);
        assert_eq!(airborne(&mut l), Stance::ClimbLow);
        l.end_climb();
        assert_eq!(airborne(&mut l), Stance::Jump);

        assert_eq!(l.begin_climb(2.0), Stance::ClimbHigh);
        l.end_climb();
    }

    /// A step off a kerb is a frame or two of float, and firing the take-off clip for it
    /// is exactly the hitch the grace window exists to swallow.
    #[test]
    fn a_frame_of_float_is_not_a_jump() {
        let mut l = loco();
        for _ in 0..4 {
            assert_eq!(l.step([0.0; 3], true, 0.016).stance, Stance::Move);
        }
    }

    #[test]
    fn gait_speed_separates_the_three_headings() {
        let l = loco();
        assert_eq!(l.gait_speed(FWD), l.tuning.speed);
        assert_eq!(l.gait_speed(BACK), l.tuning.back_speed);
        assert_eq!(l.gait_speed(SIDE), l.tuning.strafe_speed);
        let diag = l.gait_speed([0.707, 0.707]);
        assert!(diag > l.tuning.strafe_speed && diag < l.tuning.speed);
        let back_diag = l.gait_speed([0.707, -0.707]);
        assert!(back_diag < l.tuning.strafe_speed && back_diag > l.tuning.back_speed);
    }

    /// One frame for the whole module: y forward, everywhere.
    #[test]
    fn gait_speed_and_the_ring_agree_on_which_way_is_forward() {
        let mut l = loco();
        let fastest = l.gait_speed(FWD);
        let state = l.step([0.0, 0.0, -fastest], false, 1.0);
        assert!(
            state.blend[1] > 0.0,
            "gait_speed's fastest heading blended to {:?}",
            state.blend
        );
    }

    /// Godot's forward is -z.
    #[test]
    fn forward_at_rest_yaw_is_negative_z() {
        let l = loco();
        let dir = l.wish_direction(FWD, 0.0);
        assert!(dir[2] < -0.99, "forward went to {dir:?}");
        assert!(dir[0].abs() < 0.001);
    }

    #[test]
    fn right_at_rest_yaw_is_positive_x() {
        let l = loco();
        let dir = l.wish_direction(SIDE, 0.0);
        assert!(dir[0] > 0.99, "right went to {dir:?}");
        assert!(dir[2].abs() < 0.001);
    }

    /// A quarter turn left puts the body's forward down -x.
    #[test]
    fn yaw_turns_the_heading_the_way_the_body_faces() {
        let l = loco();
        let dir = l.wish_direction(FWD, std::f32::consts::FRAC_PI_2);
        assert!(dir[0] < -0.99, "quarter turn sent forward to {dir:?}");
        assert!(dir[2].abs() < 0.001);
    }

    #[test]
    fn wish_direction_is_unit_or_zero() {
        let l = loco();
        for axis in [FWD, BACK, SIDE, [1.0, 1.0], [-3.0, 2.0]] {
            for yaw in [0.0, 0.7, -2.4, 6.0] {
                let d = l.wish_direction(axis, yaw);
                let len = (d[0] * d[0] + d[2] * d[2]).sqrt();
                assert!((len - 1.0).abs() < 0.001, "{axis:?}@{yaw} -> {d:?}");
            }
        }
        assert_eq!(l.wish_direction([0.0, 0.0], 1.0), [0.0; 3]);
    }

    #[test]
    fn gravity_only_accumulates_off_the_floor() {
        let mut l = loco();
        let grounded = l.step_motion(Intent::default(), [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        assert_eq!(grounded.velocity[1], 0.0);
        let airborne = l.step_motion(Intent::default(), [0.0; 3], 0.0, false, -9.8, 1.0 / 60.0);
        assert!(airborne.velocity[1] < 0.0);
    }

    #[test]
    fn falling_is_capped() {
        let mut l = loco();
        let mut v = [0.0; 3];
        for _ in 0..6000 {
            v = l
                .step_motion(Intent::default(), v, 0.0, false, -9.8, 1.0 / 60.0)
                .velocity;
        }
        assert!(
            v[1] >= -l.tuning.terminal_fall - 0.001,
            "fell away to {}",
            v[1]
        );
    }

    /// A jump press only counts with the floor under you, and the caller is told which
    /// it was rather than having to work it out again.
    #[test]
    fn jump_needs_the_floor() {
        let mut l = loco();
        let intent = Intent {
            move_axis: [0.0, 0.0],
            jump: true,
            ..Intent::default()
        };
        let taken = l.step_motion(intent, [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        assert!(taken.jumped);
        assert_eq!(taken.velocity[1], l.tuning.jump_velocity);

        let refused = l.step_motion(intent, [0.0; 3], 0.0, false, -9.8, 1.0 / 60.0);
        assert!(!refused.jumped);
        assert!(refused.velocity[1] < 0.0);
    }

    #[test]
    fn releasing_the_stick_stops_the_body() {
        let mut l = loco();
        let moving = l.step_motion(
            Intent {
                move_axis: FWD,
                ..Intent::default()
            },
            [0.0; 3],
            0.0,
            true,
            -9.8,
            1.0 / 60.0,
        );
        assert!((moving.velocity[2] + l.tuning.speed).abs() < 0.001);
        let stopped = l.step_motion(
            Intent::default(),
            moving.velocity,
            0.0,
            true,
            -9.8,
            1.0 / 60.0,
        );
        assert_eq!(stopped.velocity[0], 0.0);
        assert_eq!(stopped.velocity[2], 0.0);
    }

    /// The speed the body travels and the ring the rig blends over come from the same
    /// table, so a heading cannot move at one speed and animate at another.
    #[test]
    fn travelled_speed_matches_the_ring_it_animates_on() {
        let mut l = loco();
        for axis in [FWD, BACK, SIDE] {
            let motion = l.step_motion(
                Intent {
                    move_axis: axis,
                    ..Intent::default()
                },
                [0.0; 3],
                0.0,
                true,
                -9.8,
                1.0 / 60.0,
            );
            let travelled = (motion.velocity[0] * motion.velocity[0]
                + motion.velocity[2] * motion.velocity[2])
                .sqrt();
            assert!(
                (travelled - l.gait_speed(axis)).abs() < 0.001,
                "{axis:?} travelled {travelled}"
            );
        }
    }

    /// A landing worth recovering from: airborne past the grace window, then floor.
    fn land(l: &mut Locomotion, local_velocity: [f32; 3]) -> Stance {
        airborne(l);
        l.step(local_velocity, false, 1.0 / 60.0).stance
    }

    #[test]
    fn a_landing_recovers_then_hands_the_body_back() {
        let mut l = loco();
        assert_eq!(land(&mut l, [0.0; 3]), Stance::Land);
        assert!(l.is_landing());
        let mut ticks = 0;
        while l.is_landing() && ticks < 600 {
            l.step([0.0; 3], false, 1.0 / 60.0);
            ticks += 1;
        }
        let held = ticks as f32 / 60.0;
        assert!(held <= l.tuning.land_time + 0.02, "recovery ran {held}s");
        assert_eq!(l.step([0.0; 3], false, 1.0 / 60.0).stance, Stance::Move);
    }

    /// The landing clip is one pose, not a ring, so any ground covered while it plays is
    /// covered by a skating foot. Travelling has to end it on the spot.
    #[test]
    fn moving_out_of_a_landing_cancels_the_recovery() {
        let mut l = loco();
        assert_eq!(land(&mut l, [0.0; 3]), Stance::Land);
        let stance = l
            .step([0.0, 0.0, -l.tuning.speed], false, 1.0 / 60.0)
            .stance;
        assert_eq!(stance, Stance::Move, "the recovery outlasted the stick");
        assert!(!l.is_landing());
    }

    #[test]
    fn landing_already_running_never_recovers_at_all() {
        let mut l = loco();
        let running = l.tuning.speed;
        assert_eq!(land(&mut l, [0.0, 0.0, -running]), Stance::Move);
        assert!(!l.is_landing());
    }

    /// The grace window is what tells a landing from a bump, so a bump must not fire the
    /// recovery either.
    #[test]
    fn a_frame_of_float_lands_without_a_recovery() {
        let mut l = loco();
        l.step([0.0; 3], true, 0.016);
        assert_eq!(l.step([0.0; 3], false, 0.016).stance, Stance::Move);
        assert!(!l.is_landing());
    }

    #[test]
    fn a_crouch_outranks_a_landing() {
        let mut l = loco();
        airborne(&mut l);
        l.step_motion(held(true, [0.0; 2]), [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        assert_eq!(l.step([0.0; 3], false, 1.0 / 60.0).stance, Stance::Crouch);
    }

    fn held(crouch: bool, axis: [f32; 2]) -> Intent {
        Intent {
            move_axis: axis,
            crouch,
            ..Intent::default()
        }
    }

    /// Crouching is a stance, not a speed multiplier bolted on afterwards: the body has
    /// to actually travel slower for the crouch clips to keep their feet.
    #[test]
    fn crouching_slows_the_body_and_switches_the_stance() {
        let mut l = loco();
        let standing = l.step_motion(held(false, FWD), [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        let crouched = l.step_motion(held(true, FWD), [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        assert!(crouched.velocity[2].abs() < standing.velocity[2].abs());
        assert!((crouched.velocity[2].abs() - l.tuning.crouch_speed).abs() < 0.001);
        assert_eq!(l.step([0.0; 3], false, 0.016).stance, Stance::Crouch);
        assert!(l.is_crouched());
    }

    #[test]
    fn crouching_needs_the_floor() {
        let mut l = loco();
        l.step_motion(held(true, FWD), [0.0; 3], 0.0, false, -9.8, 1.0 / 60.0);
        assert!(!l.is_crouched());
        assert_eq!(airborne(&mut l), Stance::Jump);
    }

    /// Every crouch heading has to sit inside its own ring, or the space extrapolates
    /// past the clips it was built from.
    #[test]
    fn the_crouch_ring_is_never_left() {
        let l = loco();
        for speed in [0.0, 0.3, 0.85, 4.0, 100.0] {
            for dir in [FWD, BACK, SIDE, [0.707, 0.707]] {
                let r = l.crouch_radius_for(speed, dir);
                assert!(
                    r >= 0.0 && r <= CROUCH_GAIT.radius + 0.001,
                    "{speed} -> {r}"
                );
            }
        }
    }

    #[test]
    fn a_crouch_clip_at_its_authored_speed_is_not_rescaled() {
        let l = loco();
        for (dir, speed) in [
            (FWD, CROUCH_GAIT.fwd),
            (BACK, CROUCH_GAIT.back),
            (SIDE, CROUCH_GAIT.lateral),
        ] {
            assert!((l.crouch_time_scale(speed, dir) - 1.0).abs() < 0.001);
            assert!((l.crouch_radius_for(speed, dir) - CROUCH_GAIT.radius).abs() < 0.001);
        }
    }

    /// The crouch top speeds have to stay close enough to the authored ones that the
    /// rescaling never saturates, since a saturated scale is a skating foot.
    #[test]
    fn crouch_top_speeds_do_not_saturate_the_rescaling() {
        let l = loco();
        for (dir, speed) in [
            (FWD, l.tuning.crouch_speed),
            (BACK, l.tuning.crouch_back_speed),
            (SIDE, l.tuning.crouch_strafe_speed),
        ] {
            let scale = l.crouch_time_scale(speed, dir);
            assert!(
                scale < l.tuning.time_scale_max,
                "{dir:?} saturated at {scale}"
            );
        }
    }

    /// A roll owns the body for its whole length: the stick is ignored, the heading is
    /// the one it was thrown on, and a jump cannot cut it short.
    #[test]
    fn a_roll_keeps_its_heading_and_outranks_the_stick() {
        let mut l = loco();
        let start = Intent {
            move_axis: FWD,
            roll: true,
            ..Intent::default()
        };
        let first = l.step_motion(start, [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        assert!(l.is_rolling());
        assert!((first.velocity[2] + l.tuning.roll_speed).abs() < 0.001);
        assert_eq!(l.step([0.0; 3], false, 0.016).stance, Stance::Roll);

        let fought = Intent {
            move_axis: BACK,
            jump: true,
            crouch: true,
            ..Intent::default()
        };
        let mid = l.step_motion(fought, first.velocity, 0.0, true, -9.8, 1.0 / 60.0);
        assert!(!mid.jumped, "a jump cut the roll short");
        assert!(mid.velocity[2] < 0.0, "the stick turned the roll around");
        assert!(!l.is_crouched(), "a roll became a crouch mid-way");
    }

    #[test]
    fn a_roll_ends_and_can_be_thrown_again() {
        let mut l = loco();
        let press = Intent {
            move_axis: FWD,
            roll: true,
            ..Intent::default()
        };
        l.step_motion(press, [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        for _ in 0..60 {
            l.step_motion(Intent::default(), [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        }
        assert!(!l.is_rolling(), "the roll never ended");
        assert_eq!(l.step([0.0; 3], false, 0.016).stance, Stance::Move);
        l.step_motion(press, [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        assert!(l.is_rolling());
    }

    /// A roll thrown with no stick on it goes where the body faces rather than nowhere.
    #[test]
    fn a_standing_roll_goes_forward() {
        let mut l = loco();
        let press = Intent {
            roll: true,
            ..Intent::default()
        };
        let m = l.step_motion(press, [0.0; 3], 0.0, true, -9.8, 1.0 / 60.0);
        assert!((m.velocity[2] + l.tuning.roll_speed).abs() < 0.001, "{m:?}");
    }

    #[test]
    fn a_roll_needs_the_floor() {
        let mut l = loco();
        let press = Intent {
            roll: true,
            ..Intent::default()
        };
        l.step_motion(press, [0.0; 3], 0.0, false, -9.8, 1.0 / 60.0);
        assert!(!l.is_rolling());
    }

    #[test]
    fn stance_survives_a_byte() {
        for stance in [
            Stance::Move,
            Stance::Jump,
            Stance::ClimbLow,
            Stance::ClimbHigh,
            Stance::Crouch,
            Stance::Roll,
            Stance::Land,
        ] {
            assert_eq!(Stance::from_u8(stance as u8), stance);
        }
    }
}
