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

/// Which clip set owns the body.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Stance {
    Move = 0,
    Jump = 1,
    ClimbLow = 2,
    ClimbHigh = 3,
}

impl Stance {
    pub fn from_u8(value: u8) -> Self {
        match value {
            1 => Self::Jump,
            2 => Self::ClimbLow,
            3 => Self::ClimbHigh,
            _ => Self::Move,
        }
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
        }
    }
}

/// What the controller is asking for this tick, which is all a server needs to be sent.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Intent {
    pub move_axis: [f32; 2],
    pub jump: bool,
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

/// The decision, as the rig and the wire both want it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LocomotionState {
    /// Position in the blend space, in the character's own frame: x right, y forward.
    pub blend: [f32; 2],
    pub time_scale: f32,
    pub stance: Stance,
}

impl Default for LocomotionState {
    fn default() -> Self {
        Self {
            blend: [0.0, 0.0],
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
    climbing: Option<Stance>,
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
            climbing: None,
        }
    }

    /// Top speed for a heading.
    pub fn gait_speed(&self, dir: [f32; 2]) -> f32 {
        if dir[1] < 0.0 {
            lerp(self.tuning.strafe_speed, self.tuning.back_speed, -dir[1])
        } else {
            lerp(self.tuning.strafe_speed, self.tuning.speed, dir[1])
        }
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

        if !grounded {
            out[1] += gravity_y * dt;
            out[1] = out[1].max(-self.tuning.terminal_fall);
        }
        if intent.jump && grounded {
            out[1] = self.tuning.jump_velocity;
            jumped = true;
        }

        let axis = intent.move_axis;
        let length = (axis[0] * axis[0] + axis[1] * axis[1]).sqrt();
        if length > 0.0001 {
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
        let target = [dir[0] * radius, dir[1] * radius];
        let weight = (self.tuning.blend_sharpness * dt).clamp(0.0, 1.0);
        self.blend = [
            lerp(self.blend[0], target[0], weight),
            lerp(self.blend[1], target[1], weight),
        ];

        LocomotionState {
            blend: self.blend,
            time_scale: self.time_scale(speed, dir, radius),
            stance: match self.climbing {
                Some(climb) => climb,
                None if airborne => Stance::Jump,
                None => Stance::Move,
            },
        }
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

    #[test]
    fn airborne_reads_as_jump_but_a_climb_outranks_it() {
        let mut l = loco();
        assert_eq!(l.step([0.0; 3], false, 0.016).stance, Stance::Move);
        assert_eq!(l.step([0.0; 3], true, 0.016).stance, Stance::Jump);

        assert_eq!(l.begin_climb(1.0), Stance::ClimbLow);
        assert_eq!(l.step([0.0; 3], true, 0.016).stance, Stance::ClimbLow);
        l.end_climb();
        assert_eq!(l.step([0.0; 3], true, 0.016).stance, Stance::Jump);

        assert_eq!(l.begin_climb(2.0), Stance::ClimbHigh);
        l.end_climb();
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
                jump: false,
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
                    jump: false,
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

    #[test]
    fn stance_survives_a_byte() {
        for stance in [
            Stance::Move,
            Stance::Jump,
            Stance::ClimbLow,
            Stance::ClimbHigh,
        ] {
            assert_eq!(Stance::from_u8(stance as u8), stance);
        }
    }
}
