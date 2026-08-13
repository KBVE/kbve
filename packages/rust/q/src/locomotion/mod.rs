//! What a character is doing on its feet, decided independently of how it is
//! drawn.
//!
//! Engine-agnostic on purpose, the same way `sim3d` is: no Godot, no Bevy, no
//! rendering. Which gait a speed belongs to, how fast the clip has to run to
//! stop the feet sliding, and whether the body is walking, airborne or climbing
//! are all simulation answers, so an authoritative server has to be able to
//! reach the identical ones from the identical inputs. [`bridge`] is the only
//! file here allowed to name a Godot type.
//!
//! What this module deliberately does not decide: crossfades, blend weights per
//! bone, and foot placement. Those are presentation, they depend on frame rate
//! and on client-side terrain sampling, and no two clients need to agree on
//! them. They stay in the rig.

#[cfg(feature = "client")]
pub mod bridge;

/// Ground speeds a gait's clips were authored at, and the blend-space ring the
/// gait sits on.
///
/// `fwd`/`lateral`/`back` were measured off the clips rather than guessed:
/// forward and lateral from root motion in the `_RM` builds, backward by timing
/// the stance foot through the rig's own frame. Backward is not forward
/// mirrored, and sideways covers barely half the ground forward does, so all
/// three are carried separately.
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

/// Which clip set owns the body. The rig maps these onto its state machine; the
/// wire format maps them onto a single byte.
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

/// Top speeds and blend rates. Separated from [`Locomotion`] so a server can
/// hold one shared copy per character archetype.
#[derive(Clone, Copy, Debug)]
pub struct Tuning {
    /// Top speed running forward.
    pub speed: f32,
    pub back_speed: f32,
    pub strafe_speed: f32,
    /// How fast the ring position chases the heading, per second.
    pub blend_sharpness: f32,
    /// Playback rescaling bounds. Outside these the correction reads worse than
    /// the sliding it fixes.
    pub time_scale_min: f32,
    pub time_scale_max: f32,
    /// Rise above which a climb uses the tall clip instead of the short one.
    pub climb_split: f32,
}

impl Default for Tuning {
    fn default() -> Self {
        Self {
            speed: 5.0,
            // Held low enough that neither heading rides onto its jog clip, and
            // close together so a diagonal is not visibly quicker than either
            // heading it is made of.
            back_speed: 2.0,
            strafe_speed: 2.2,
            blend_sharpness: 12.0,
            time_scale_min: 0.6,
            time_scale_max: 1.8,
            climb_split: 1.35,
        }
    }
}

/// The decision, as the rig and the wire both want it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LocomotionState {
    /// Position in the blend space, in the character's own frame: x right,
    /// y forward.
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

/// Per-character locomotion decision. Holds the smoothed ring position, which is
/// why it is a value that gets stepped rather than a set of free functions.
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

    /// Top speed for a heading. `dir` is normalised in this module's frame: x
    /// right, y forward. Godot's input vector calls +y backward, so a caller
    /// reading one has to flip it, the same single flip [`Self::step`] makes.
    ///
    /// The two halves are blended separately rather than through `dir.y`'s
    /// magnitude. Collapsing them treats a backpedal as a forward run.
    ///
    /// A diagonal lands between its two headings, so backing away at an angle is
    /// quicker than backing away straight. That follows from sideways and
    /// backward differing at all, and matches the blend done over the same ring.
    pub fn gait_speed(&self, dir: [f32; 2]) -> f32 {
        if dir[1] < 0.0 {
            lerp(self.tuning.strafe_speed, self.tuning.back_speed, -dir[1])
        } else {
            lerp(self.tuning.strafe_speed, self.tuning.speed, dir[1])
        }
    }

    /// Latches a climb, so a body the controller reports airborne mid-haul does
    /// not travel back out of the climb it is halfway through.
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
        // +z is backward in the source frame and the ring's y is forward, so the
        // sign flips exactly once, here.
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

    /// Ground speed the blended clip covers in this direction, which is what the
    /// ring radius has to be solved against.
    fn authored(gait: &Gait, dir: [f32; 2]) -> f32 {
        let toward = if dir[1] >= 0.0 { gait.fwd } else { gait.back };
        lerp(gait.lateral, toward, dir[1].abs())
    }

    /// Inverse of the ring layout: the radius whose blended clip is authored for
    /// this speed, so the gait matches the ground instead of being scaled into
    /// place. Rings are not evenly spaced in speed, hence the piecewise solve.
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

#[cfg(test)]
mod tests {
    use super::*;

    const FWD: [f32; 2] = [0.0, 1.0];
    const BACK: [f32; 2] = [0.0, -1.0];
    const SIDE: [f32; 2] = [1.0, 0.0];

    fn loco() -> Locomotion {
        Locomotion::default()
    }

    /// A clip played at the speed it was authored for must not be rescaled at
    /// all. If this drifts, the feet slide at exactly the speeds the gait table
    /// was measured to cover.
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

    /// Backward is not forward mirrored. Collapsing them is what had a backpedal
    /// solved against the forward clips and skating the difference.
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

    /// +z is backward in the input frame. A sign slip here points the character
    /// at the clip for the opposite heading, which is the one bug in this file
    /// that looks like an animation problem.
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
        // A diagonal lands between its two headings rather than on either.
        let diag = l.gait_speed([0.707, 0.707]);
        assert!(diag > l.tuning.strafe_speed && diag < l.tuning.speed);
        let back_diag = l.gait_speed([0.707, -0.707]);
        assert!(back_diag < l.tuning.strafe_speed && back_diag > l.tuning.back_speed);
    }

    /// One frame for the whole module: y forward, everywhere. Porting this out of
    /// the controller, where Godot's input vector calls +y backward, is exactly
    /// where the two conventions get crossed without anything failing to compile.
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
