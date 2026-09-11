//! The rig profile: which bones, hinges, limits and clips a body is built from.

use bevy::asset::io::Reader;
use bevy::asset::{AssetLoader, LoadContext};
use bevy::prelude::*;
use kinetree::{LimbLimits, RestHinge};
use serde::Deserialize;

pub const PROFILE: &str = "characters/quaternius_ubc/quaternius_ubc.rig.ron";

/// Everything the character systems need to know about one skeleton and its clip library.
#[derive(Asset, TypePath, Deserialize, Debug, Clone)]
pub struct RigProfile {
    pub model: String,
    pub library: String,
    pub armature: String,
    pub pelvis: String,
    pub ankle_height: f32,
    pub gait_set: String,
    /// Baked lower-body joint rotations, played back in place of the procedural stride when present.
    #[serde(default)]
    pub pose_set: Option<String>,
    pub legs: Vec<LimbSpec>,
    pub gaits: GaitClips,
    pub attacks: AttackClips,
    pub casts: CastClips,
    pub hit: String,
    pub death: String,
}

/// A two-bone limb by bone name, its hinge axis in the root bone's basis, and its flexion ceiling.
#[derive(Deserialize, Debug, Clone)]
pub struct LimbSpec {
    pub root: String,
    pub mid: String,
    pub tip: String,
    pub hinge: Option<[f32; 3]>,
    pub max_flexion_deg: f32,
}

impl LimbSpec {
    pub fn rest(&self) -> Option<RestHinge> {
        self.hinge
            .and_then(|axis| RestHinge::from_local_axis(Vec3::from_array(axis)))
    }

    pub fn limits(&self) -> LimbLimits {
        LimbLimits::flexion(self.max_flexion_deg.to_radians())
    }
}

/// Clip names for each gait, resolved against the library's named animations.
#[derive(Deserialize, Debug, Clone)]
pub struct GaitClips {
    pub idle: GaitClip,
    pub walk: GaitClip,
    pub jog: GaitClip,
    pub sprint: GaitClip,
    pub jump: GaitClip,
    pub back: GaitClip,
    pub left: GaitClip,
    pub right: GaitClip,
}

/// A locomotion clip and the fraction of it at which the left foot lands, so it can be phase-locked to a procedural stride.
#[derive(Deserialize, Debug, Clone)]
pub struct GaitClip {
    pub clip: String,
    #[serde(default)]
    pub contact: f32,
}

#[derive(Deserialize, Debug, Clone)]
pub struct AttackClips {
    pub jab: String,
    pub cross: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct CastClips {
    pub channel: String,
    pub release: String,
    pub poison: String,
}

pub const SAMPLES: usize = 32;

/// Rig-independent gait curves baked from mocap, in leg lengths, on a stride clock that starts at left-foot contact.
#[derive(Asset, TypePath, Deserialize, Debug, Clone)]
pub struct GaitSet {
    pub gaits: Vec<GaitCurve>,
}

/// One locomotion loop reduced to its stride.
#[derive(Deserialize, Debug, Clone)]
pub struct GaitCurve {
    pub name: String,
    pub source: String,
    /// Travel direction relative to facing, degrees, right positive.
    pub direction: f32,
    pub leg_length: f32,
    pub speed: f32,
    pub hip_height: f32,
    pub stride_period: f32,
    pub knee_flexion: (f32, f32),
    pub elbow_flexion: (f32, f32),
    pub bob: Vec<f32>,
    pub pelvis_yaw: Vec<f32>,
    pub pelvis_roll: Vec<f32>,
    pub feet: Vec<FootCurve>,
}

/// One foot's stride: when it lands and lifts, and where it is relative to the pelvis at every phase.
#[derive(Deserialize, Debug, Clone)]
pub struct FootCurve {
    pub contact: f32,
    pub duty: f32,
    pub lift: Vec<f32>,
    pub fwd: Vec<f32>,
    pub side: Vec<f32>,
    pub pitch: Vec<f32>,
}

impl GaitCurve {
    fn normalised_speed(&self) -> f32 {
        self.speed / self.leg_length
    }

    fn complete(&self) -> bool {
        let curves = [&self.bob, &self.pelvis_yaw, &self.pelvis_roll];
        curves.iter().all(|c| c.len() == SAMPLES)
            && self.feet.len() == 2
            && self.feet.iter().all(|f| {
                [&f.lift, &f.fwd, &f.side, &f.pitch]
                    .iter()
                    .all(|c| c.len() == SAMPLES)
            })
    }
}

/// A gait interpolated for one normalised speed and travel direction.
#[derive(Debug, Clone, Copy)]
pub struct GaitBlend {
    pub hip_height: f32,
    pub stride_period: f32,
    pub bob: [f32; SAMPLES],
    pub pelvis_yaw: [f32; SAMPLES],
    pub pelvis_roll: [f32; SAMPLES],
    pub feet: [FootBlend; 2],
}

#[derive(Debug, Clone, Copy)]
pub struct FootBlend {
    pub contact: f32,
    pub duty: f32,
    pub lift: [f32; SAMPLES],
    pub fwd: [f32; SAMPLES],
    pub side: [f32; SAMPLES],
    pub pitch: [f32; SAMPLES],
}

fn angle_between(a: f32, b: f32) -> f32 {
    ((a - b + 180.0).rem_euclid(360.0) - 180.0).abs()
}

fn mix(a: &[f32], b: &[f32], t: f32) -> [f32; SAMPLES] {
    let mut out = [0.0; SAMPLES];
    for (k, slot) in out.iter_mut().enumerate() {
        *slot = a[k] + (b[k] - a[k]) * t;
    }
    out
}

fn mix_foot(lo: &FootCurve, hi: &FootCurve, t: f32) -> FootBlend {
    FootBlend {
        contact: lo.contact + (hi.contact - lo.contact) * t,
        duty: lo.duty + (hi.duty - lo.duty) * t,
        lift: mix(&lo.lift, &hi.lift, t),
        fwd: mix(&lo.fwd, &hi.fwd, t),
        side: mix(&lo.side, &hi.side, t),
        pitch: mix(&lo.pitch, &hi.pitch, t),
    }
}

fn mix_blend(a: &GaitBlend, b: &GaitBlend, t: f32) -> GaitBlend {
    let feet = [0, 1].map(|i| FootBlend {
        contact: a.feet[i].contact + (b.feet[i].contact - a.feet[i].contact) * t,
        duty: a.feet[i].duty + (b.feet[i].duty - a.feet[i].duty) * t,
        lift: mix(&a.feet[i].lift, &b.feet[i].lift, t),
        fwd: mix(&a.feet[i].fwd, &b.feet[i].fwd, t),
        side: mix(&a.feet[i].side, &b.feet[i].side, t),
        pitch: mix(&a.feet[i].pitch, &b.feet[i].pitch, t),
    });
    GaitBlend {
        hip_height: a.hip_height + (b.hip_height - a.hip_height) * t,
        stride_period: a.stride_period + (b.stride_period - a.stride_period) * t,
        bob: mix(&a.bob, &b.bob, t),
        pelvis_yaw: mix(&a.pelvis_yaw, &b.pelvis_yaw, t),
        pelvis_roll: mix(&a.pelvis_roll, &b.pelvis_roll, t),
        feet,
    }
}

impl GaitSet {
    /// Interpolates the set at `speed_per_leg` for travel `direction` degrees off facing, mixing the two nearest direction lanes by angle.
    pub fn blend(&self, speed_per_leg: f32, direction: f32) -> Option<GaitBlend> {
        let mut lanes: Vec<f32> = self
            .gaits
            .iter()
            .filter(|g| g.complete() && g.speed > 0.05)
            .map(|g| g.direction)
            .collect();
        lanes.sort_by(f32::total_cmp);
        lanes.dedup_by(|a, b| (*a - *b).abs() < 0.5);
        if lanes.is_empty() {
            return None;
        }
        let mut best: Vec<(f32, f32)> = lanes
            .iter()
            .map(|d| (angle_between(*d, direction), *d))
            .collect();
        best.sort_by(|a, b| a.0.total_cmp(&b.0));
        let (near_dist, near) = best[0];
        let first = self.lane(speed_per_leg, near)?;
        let Some((far_dist, far)) = best.get(1).copied() else {
            return Some(first);
        };
        let span = angle_between(near, far);
        if near_dist + far_dist > span + 0.5 || span <= 0.5 {
            return Some(first);
        }
        let second = self.lane(speed_per_leg, far)?;
        Some(mix_blend(&first, &second, near_dist / span))
    }

    fn lane(&self, speed_per_leg: f32, direction: f32) -> Option<GaitBlend> {
        let mut lane: Vec<&GaitCurve> = self
            .gaits
            .iter()
            .filter(|g| g.complete())
            .filter(|g| g.speed <= 0.05 || angle_between(g.direction, direction) <= 0.5)
            .collect();
        lane.sort_by(|a, b| a.normalised_speed().total_cmp(&b.normalised_speed()));
        let (first, last) = (*lane.first()?, *lane.last()?);
        if speed_per_leg <= first.normalised_speed() {
            return Some(Self::mixed(first, first, 0.0, speed_per_leg));
        }
        if speed_per_leg >= last.normalised_speed() {
            return Some(Self::mixed(last, last, 0.0, speed_per_leg));
        }
        let upper = lane
            .iter()
            .position(|g| g.normalised_speed() >= speed_per_leg)?;
        let (lo, hi) = (lane[upper - 1], lane[upper]);
        let span = hi.normalised_speed() - lo.normalised_speed();
        let t = if span > f32::EPSILON {
            (speed_per_leg - lo.normalised_speed()) / span
        } else {
            1.0
        };
        Some(Self::mixed(lo, hi, t, speed_per_leg))
    }

    /// Mixes two curves of one lane, then runs the clock at the speed actually walked over the baked speed, so one stride covers exactly the ground the body does and a planted foot never skates.
    fn mixed(lo: &GaitCurve, hi: &GaitCurve, t: f32, speed_per_leg: f32) -> GaitBlend {
        let mut period = if lo.stride_period <= f32::EPSILON {
            hi.stride_period
        } else {
            lo.stride_period + (hi.stride_period - lo.stride_period) * t
        };
        let baked = lo.normalised_speed() + (hi.normalised_speed() - lo.normalised_speed()) * t;
        let ratio = if baked > 0.05 && speed_per_leg > 0.05 {
            (speed_per_leg / baked).clamp(0.5, 2.0)
        } else {
            1.0
        };
        period /= ratio;
        let stretch = 1.0;
        let feet = if lo.stride_period <= f32::EPSILON {
            [
                mix_foot(&hi.feet[0], &hi.feet[0], 0.0),
                mix_foot(&hi.feet[1], &hi.feet[1], 0.0),
            ]
        } else {
            [
                mix_foot(&lo.feet[0], &hi.feet[0], t),
                mix_foot(&lo.feet[1], &hi.feet[1], t),
            ]
        };
        let feet = feet.map(|mut f| {
            for v in f.fwd.iter_mut() {
                *v *= stretch;
            }
            f
        });
        GaitBlend {
            hip_height: lo.hip_height + (hi.hip_height - lo.hip_height) * t,
            stride_period: period,
            bob: mix(&lo.bob, &hi.bob, t),
            pelvis_yaw: mix(&lo.pelvis_yaw, &hi.pelvis_yaw, t),
            pelvis_roll: mix(&lo.pelvis_roll, &hi.pelvis_roll, t),
            feet,
        }
    }
}

/// Samples a wrapped stride curve at `phase` in 0..1.
pub fn at(curve: &[f32; SAMPLES], phase: f32) -> f32 {
    let x = phase.rem_euclid(1.0) * SAMPLES as f32;
    let i = x.floor() as usize % SAMPLES;
    let f = x - x.floor();
    curve[i] * (1.0 - f) + curve[(i + 1) % SAMPLES] * f
}

/// Rig-independent lower-body pose database: per clip, per frame, each role bone's rotation as a delta from its rest in a canonical frame (Y up, facing +Z), the pelvis relative to the root in leg lengths, root motion, and foot contacts.
#[derive(Asset, TypePath, Deserialize, Debug, Clone)]
pub struct PoseSet {
    pub bones: Vec<String>,
    pub clips: Vec<PoseClip>,
}

/// Airborne frames in a row that make a jump's flight rather than a running stride's.
const FLIGHT_FRAMES: usize = 9;

/// Weight of the root speed mismatch, per (m/s)², against the squared leg joint angles in a pose match.
const MATCH_SPEED: f32 = 0.5;

/// Longest run of missing contact frames closed at load, in frames of the bake.
const CONTACT_GAP: usize = 3;

/// Quaternion component difference under which two baked frames count as the same pose.
const SEAM_EPSILON: f32 = 1e-3;

#[derive(Deserialize, Debug, Clone)]
pub struct PoseClip {
    pub name: String,
    pub source: String,
    pub fps: f32,
    pub leg_length: f32,
    pub speed: f32,
    pub direction: f32,
    pub frames: Vec<PoseFrame>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PoseFrame {
    pub root: (f32, f32, f32),
    pub pelvis: (f32, f32, f32),
    pub rotations: Vec<(f32, f32, f32, f32)>,
    /// Unit direction from each bone to its child in the canonical frame, zero for leaves.
    #[serde(default)]
    pub directions: Vec<(f32, f32, f32)>,
    pub contact: (bool, bool),
}

impl PoseClip {
    /// Frame indices at which the left foot lands, in order.
    pub fn left_onsets(&self) -> Vec<usize> {
        let n = self.frames.len();
        (0..n)
            .filter(|&i| self.frames[i].contact.0 && !self.frames[(i + n - 1) % n].contact.0)
            .collect()
    }

    /// Drops trailing frames that repeat the frame before them or the first frame: an exported loop ends on a copy of its start, which would stall the pose for those frames every time round.
    pub fn trim_seam(&mut self) {
        let same = |a: &PoseFrame, b: &PoseFrame| {
            a.rotations.len() == b.rotations.len()
                && a.rotations.iter().zip(&b.rotations).all(|(p, q)| {
                    (p.0 - q.0).abs() < SEAM_EPSILON
                        && (p.1 - q.1).abs() < SEAM_EPSILON
                        && (p.2 - q.2).abs() < SEAM_EPSILON
                        && (p.3 - q.3).abs() < SEAM_EPSILON
                })
        };
        while self.frames.len() > 2 {
            let n = self.frames.len();
            if same(&self.frames[n - 1], &self.frames[n - 2])
                || same(&self.frames[n - 1], &self.frames[0])
            {
                self.frames.pop();
            } else {
                break;
            }
        }
    }

    /// Closes contact gaps of a few frames, which the bake leaves at the loop seam and where a foot rolls.
    pub fn mend_contacts(&mut self) {
        let n = self.frames.len();
        for foot in 0..2 {
            let down = |f: &PoseFrame| if foot == 0 { f.contact.0 } else { f.contact.1 };
            let mut fixes = Vec::new();
            for i in 0..n {
                if down(&self.frames[i]) || !down(&self.frames[(i + n - 1) % n]) {
                    continue;
                }
                let gap = (1..=CONTACT_GAP)
                    .find(|k| down(&self.frames[(i + k) % n]))
                    .unwrap_or(0);
                for k in 0..gap {
                    fixes.push((i + k) % n);
                }
            }
            for i in fixes {
                if foot == 0 {
                    self.frames[i].contact.0 = true;
                } else {
                    self.frames[i].contact.1 = true;
                }
            }
        }
    }

    /// Every stride of the loop as a frame window, landing to landing; the last one wraps round to the first.
    ///
    /// Played in turn they reproduce the whole capture, so no stride ever cuts from its own end back to its start. A landing that starts a window under half the usual length is the previous landing seen again across the seam, and is dropped.
    pub fn strides(&self) -> Vec<(usize, usize)> {
        let n = self.frames.len();
        let mut onsets = self.left_onsets();
        loop {
            let m = onsets.len();
            if m < 2 {
                break;
            }
            let spans: Vec<usize> = (0..m)
                .map(|k| (onsets[(k + 1) % m] + if k + 1 == m { n } else { 0 }) - onsets[k])
                .collect();
            let mut sorted = spans.clone();
            sorted.sort_unstable();
            let median = sorted[m / 2];
            match spans.iter().position(|&span| span * 2 < median) {
                Some(k) => {
                    onsets.remove((k + 1) % m);
                }
                None => break,
            }
        }
        match onsets.as_slice() {
            [] => vec![(0, n)],
            [a] => vec![(*a, *a + n)],
            all => {
                let mut out: Vec<(usize, usize)> = all.windows(2).map(|w| (w[0], w[1])).collect();
                out.push((all[all.len() - 1], all[0] + n));
                out
            }
        }
    }

    /// Where the root lands one loop later: the last frame's offset from the first plus the one frame step the seam hides.
    fn loop_shift(&self) -> Vec2 {
        let n = self.frames.len();
        if n < 2 {
            return Vec2::ZERO;
        }
        let first = self.frames[0].root;
        let last = self.frames[n - 1].root;
        Vec2::new(last.0 - first.0, last.1 - first.1) * (n as f32 / (n - 1) as f32)
    }

    /// Root position at frame index `i`, which may run past the end for a window that wraps the loop.
    fn root_at(&self, i: usize) -> Vec2 {
        let n = self.frames.len();
        let r = self.frames[i % n].root;
        let mut out = Vec2::new(r.0, r.1);
        if i >= n {
            out += self.loop_shift();
        }
        out
    }

    /// The fractional frame where the root has covered `phase` of the window's ground travel, so the pose is played by distance and a planted foot stays where the capture put it; none when the window barely moves.
    fn frame_at_distance(&self, start: usize, end: usize, phase: f32) -> Option<f32> {
        let mut dist = Vec::with_capacity(end - start + 1);
        let mut total = 0.0;
        dist.push(0.0);
        for i in start..end {
            total += self.root_at(i + 1).distance(self.root_at(i));
            dist.push(total);
        }
        if total < 0.05 {
            return None;
        }
        let want = phase * total;
        let k = dist
            .partition_point(|&d| d <= want)
            .clamp(1, dist.len() - 1);
        let (a, b) = (dist[k - 1], dist[k]);
        let f = if b > a { (want - a) / (b - a) } else { 0.0 };
        Some(start as f32 + (k - 1) as f32 + f)
    }

    /// Ground the root covers over one window, metres.
    fn travel(&self, (start, end): (usize, usize)) -> f32 {
        if self.frames.is_empty() {
            return 0.0;
        }
        self.root_at(end).distance(self.root_at(start))
    }

    /// Signed turn of the path per metre travelled, radians, left positive: the heading swept over the clip divided by its ground travel.
    pub fn curvature(&self) -> f32 {
        let n = self.frames.len();
        if n < 2 {
            return 0.0;
        }
        let swept = (self.frames[n - 1].root.2 - self.frames[0].root.2).to_radians();
        let mut travel = 0.0;
        for i in 0..n - 1 {
            travel += self.root_at(i + 1).distance(self.root_at(i));
        }
        if travel < 0.05 { 0.0 } else { -swept / travel }
    }

    /// Ground the root covers over one stride, metres, averaged over the loop.
    pub fn stride_length(&self) -> f32 {
        let windows = self.strides();
        windows.iter().map(|&w| self.travel(w)).sum::<f32>() / windows.len().max(1) as f32
    }

    /// Ground the root covers over the loop's `stride`-th window, metres, so the clock matches the frames it plays.
    pub fn stride_travel(&self, stride: u32) -> f32 {
        let windows = self.strides();
        self.travel(windows[stride as usize % windows.len()])
    }

    /// Seconds the loop's `stride`-th window takes at its own baked speed.
    pub fn stride_seconds(&self, stride: u32) -> f32 {
        let windows = self.strides();
        let (start, end) = windows[stride as usize % windows.len()];
        (end - start).max(1) as f32 / self.fps.max(1.0)
    }

    /// Speed in leg lengths per second, so a clip baked off one actor drives a rig of another size.
    pub fn normalized(&self) -> f32 {
        self.speed / self.leg_length.max(0.01)
    }

    /// Whether the clip plays once through rather than looping: a turn, pivot, start or stop.
    pub fn one_shot(&self) -> bool {
        [
            "_turn_", "_start_", "_stop_", "_pivot_", "_reface_", "jump_",
        ]
        .iter()
        .any(|p| self.name.contains(p))
    }

    /// Last frame index the clip can be sampled at.
    pub fn last_frame(&self) -> f32 {
        self.frames.len().saturating_sub(1) as f32
    }

    /// Body heading at fractional frame `x`, degrees right positive, relative to the first frame.
    pub fn heading_at(&self, x: f32) -> f32 {
        let n = self.frames.len();
        if n == 0 {
            return 0.0;
        }
        let x = x.clamp(0.0, self.last_frame());
        let i = x.floor() as usize;
        let j = (i + 1).min(n - 1);
        let f = x - i as f32;
        let a = self.frames[i].root.2;
        let b = self.frames[j].root.2;
        a + (b - a) * f - self.frames[0].root.2
    }

    /// Root velocity in the body's own frame at fractional frame `x`, canonical metres per second, so a one-shot can carry the body the way the capture moved.
    pub fn body_velocity_at(&self, x: f32) -> Vec3 {
        let n = self.frames.len();
        if n < 2 {
            return Vec3::ZERO;
        }
        let i = (x.floor() as usize).min(n - 2);
        let a = self.frames[i].root;
        let b = self.frames[i + 1].root;
        let step = Vec3::new(b.0 - a.0, 0.0, b.1 - a.1) * self.fps;
        Quat::from_rotation_y(a.2.to_radians()) * step
    }

    /// Frame of the last left-foot landing at or before `end`, so a one-shot can hand its stride phase to the loop that follows.
    pub fn last_left_onset(&self, end: usize) -> Option<usize> {
        self.left_onsets().into_iter().filter(|&o| o <= end).last()
    }

    /// The frames over which a turn clip actually turns: from the last landing of the `left` or right foot before the heading starts to move, advanced by `frac` of that foot's stride so it matches where the loop is, to the first landing after the heading settles, with how many frames that start sits past the turn onset (negative when it leads in). The walk in and out the capture kept around the turn are left to the loops.
    pub fn turn_window(&self, left: bool, frac: f32) -> (f32, usize, f32) {
        let n = self.frames.len();
        if n < 2 {
            return (0.0, n.saturating_sub(1), 0.0);
        }
        let h0 = self.frames[0].root.2;
        let swept = self.settled_heading() - h0;
        if swept.abs() < 10.0 {
            return (0.0, n - 1, 0.0);
        }
        let swung = |i: usize| (self.frames[i].root.2 - h0) / swept;
        let onset = (0..n).find(|&i| swung(i) > 0.05).unwrap_or(0);
        let start = onset;
        let end = (0..n).find(|&i| swung(i) > 0.95).unwrap_or(n - 1);
        let landing = |i: usize, foot: Option<bool>| {
            let (a, b) = (&self.frames[i - 1].contact, &self.frames[i].contact);
            match foot {
                Some(true) => b.0 && !a.0,
                Some(false) => b.1 && !a.1,
                None => (b.0 && !a.0) || (b.1 && !a.1),
            }
        };
        let start = (1..=start)
            .rev()
            .find(|&i| landing(i, Some(left)))
            .or_else(|| (start.max(1)..n).find(|&i| landing(i, Some(left))))
            .unwrap_or(start);
        let end = (end.max(start + 1)..n)
            .find(|&i| landing(i, None))
            .unwrap_or(n - 1);
        let next = (start + 1..n)
            .find(|&i| landing(i, Some(left)))
            .unwrap_or(end);
        let at = start as f32 + frac.clamp(0.0, 1.0) * (next - start) as f32;
        let at = at.min(end as f32 - 1.0);
        (at, end, at - onset as f32)
    }

    /// Window of a turn-in-place clip: from its first frame to where 95% of the heading is swept.
    pub fn stand_window(&self) -> (f32, usize) {
        let n = self.frames.len();
        if n < 2 {
            return (0.0, n.saturating_sub(1));
        }
        let h0 = self.frames[0].root.2;
        let swept = self.settled_heading() - h0;
        if swept.abs() < 10.0 {
            return (0.0, n - 1);
        }
        let end = (0..n)
            .find(|&i| (self.frames[i].root.2 - h0) / swept > 0.95)
            .unwrap_or(n - 1);
        (0.0, end.max(1))
    }

    /// Heading the clip settles on: the mean over its last sixth, since the bake's low-pass window closes to nothing on the final frame and leaves raw sway there.
    fn settled_heading(&self) -> f32 {
        let n = self.frames.len();
        let tail = (n / 6).max(1).min(n);
        self.frames[n - tail..]
            .iter()
            .map(|f| f.root.2)
            .sum::<f32>()
            / tail as f32
    }

    /// Ground speed of the root at frame `i`, metres per second.
    fn root_speed(&self, i: usize) -> f32 {
        let n = self.frames.len();
        if n < 2 {
            return 0.0;
        }
        let i = i.min(n - 2);
        let (a, b) = (self.frames[i].root, self.frames[i + 1].root);
        Vec2::new(b.0 - a.0, b.1 - a.1).length() * self.fps
    }

    /// Frame at which `left` (or the right) foot lands, searching forward from `from`.
    fn landing_from(&self, from: usize, left: bool) -> Option<usize> {
        (from.max(1)..self.frames.len()).find(|&i| {
            let (a, b) = (&self.frames[i - 1].contact, &self.frames[i].contact);
            if left { b.0 && !a.0 } else { b.1 && !a.1 }
        })
    }

    /// The frames of a start clip worth playing: from standing to the first landing after the body reaches its walking speed, so the loop takes over on a stride.
    pub fn start_window(&self) -> (usize, usize) {
        let n = self.frames.len();
        let top = (0..n).map(|i| self.root_speed(i)).fold(0.0, f32::max);
        let up = (0..n)
            .find(|&i| self.root_speed(i) >= 0.9 * top)
            .unwrap_or(0);
        let end = self
            .landing_from(up, true)
            .or_else(|| self.landing_from(up, false))
            .unwrap_or(n.saturating_sub(1));
        (0, end)
    }

    /// The frames of a stop clip worth playing: from the landing of the `left` or right foot, advanced by `frac` of that foot's stride to match the loop, to the frame the body comes to rest.
    pub fn stop_window(&self, left: bool, frac: f32) -> (f32, usize) {
        let n = self.frames.len();
        let start = self.landing_from(1, left).unwrap_or(0);
        let end = (start..n)
            .find(|&i| self.root_speed(i) < 0.05)
            .unwrap_or(n.saturating_sub(1));
        let end = end.max(start + 1).min(n.saturating_sub(1));
        let next = self.landing_from(start + 1, left).unwrap_or(end);
        let at = start as f32 + frac.clamp(0.0, 1.0) * (next - start) as f32;
        (at.min(end as f32 - 1.0), end)
    }

    /// The frame in `lo..hi` whose legs, and where they are `step` frames on, best match `now` and `ahead`, with the root speed weighed against `speed` so a braking frame is not matched at full pace; returns the frame and its cost.
    pub fn match_frame(
        &self,
        lo: usize,
        hi: usize,
        now: &PoseSample,
        ahead: &PoseSample,
        step: f32,
        speed: f32,
        legs: &[usize],
    ) -> (f32, f32) {
        let last = self.last_frame();
        let mut best = (lo as f32, f32::INFINITY);
        for i in lo..hi.max(lo + 1) {
            let x = i as f32;
            if x > last {
                break;
            }
            let (Some(a), Some(b)) = (
                self.sample_frame(x),
                self.sample_frame((x + step).min(last)),
            ) else {
                continue;
            };
            let pose = legs
                .iter()
                .map(|&k| {
                    let d0 = now.rotations[k].angle_between(a.rotations[k]);
                    let d1 = ahead.rotations[k].angle_between(b.rotations[k]);
                    d0 * d0 + d1 * d1
                })
                .sum::<f32>();
            let pace = self.root_speed(i) - speed;
            let cost = pose + MATCH_SPEED * pace * pace;
            if cost < best.1 {
                best = (x, cost);
            }
        }
        best
    }

    /// The stop window starting wherever the clip's legs best match the loop's: from that frame to the frame the body comes to rest, with the match cost so the foot variants can be compared.
    pub fn stop_window_matched(
        &self,
        now: &PoseSample,
        ahead: &PoseSample,
        step: f32,
        speed: f32,
        legs: &[usize],
    ) -> (f32, usize, f32) {
        let n = self.frames.len();
        let end = (0..n)
            .find(|&i| self.root_speed(i) < 0.05)
            .unwrap_or(n.saturating_sub(1))
            .max(1)
            .min(n.saturating_sub(1));
        let hi = end.saturating_sub(step.ceil() as usize + 1).max(1);
        let (at, cost) = self.match_frame(0, hi, now, ahead, step, speed, legs);
        (at.min(end as f32 - 1.0), end, cost)
    }

    /// Whether either foot is down on frame `i`.
    fn touching(&self, i: usize) -> bool {
        let c = self.frames[i].contact;
        c.0 || c.1
    }

    /// A jump clip's takeoff, the first frame of a flight lasting at least [`FLIGHT_FRAMES`] (a run's stride flights are shorter), and the frame its hips are highest after it; none when the clip does not start on the ground.
    pub fn flight(&self) -> Option<(usize, usize)> {
        let n = self.frames.len();
        let off = (1..n).find(|&i| (i..(i + FLIGHT_FRAMES).min(n)).all(|j| !self.touching(j)))?;
        if !self.touching(0) {
            return None;
        }
        let apex = (off..n)
            .max_by(|&a, &b| self.frames[a].pelvis.1.total_cmp(&self.frames[b].pelvis.1))?;
        Some((off, apex))
    }

    /// A landing clip's first frame with a foot down after its fall.
    pub fn touchdown(&self) -> Option<usize> {
        let n = self.frames.len();
        let air = (0..n).find(|&i| !self.touching(i))?;
        (air..n).find(|&i| self.touching(i))
    }

    /// Where a landing clip hands back: a standing landing when the hips have settled, a moving one on the first landing after the body is back near its top speed.
    pub fn land_end(&self, touch: usize) -> usize {
        let n = self.frames.len();
        let last = n.saturating_sub(1);
        if self.name.contains("_stand_") {
            return (touch + 5..last.saturating_sub(5))
                .find(|&i| {
                    (i..i + 5).all(|j| {
                        (self.frames[j + 1].pelvis.1 - self.frames[j].pelvis.1).abs() < 0.003
                    })
                })
                .unwrap_or(last);
        }
        let top = (touch..n).map(|i| self.root_speed(i)).fold(0.0, f32::max);
        let up = (touch..n)
            .find(|&i| self.root_speed(i) >= 0.9 * top)
            .unwrap_or(touch);
        self.landing_from(up + 1, true)
            .or_else(|| self.landing_from(up + 1, false))
            .unwrap_or(last)
    }

    /// The pose at absolute fractional frame `x`, clamped to the clip's end rather than wrapped.
    pub fn sample_frame(&self, x: f32) -> Option<PoseSample> {
        let n = self.frames.len();
        if n == 0 {
            return None;
        }
        let x = x.clamp(0.0, self.last_frame());
        let i = x.floor() as usize;
        let j = (i + 1).min(n - 1);
        Some(self.sample_between(i, j, x - i as f32))
    }

    /// The pose at `phase` in 0..1 of the loop's `stride`-th window, interpolated between frames.
    pub fn sample(&self, phase: f32, stride: u32) -> Option<PoseSample> {
        let n = self.frames.len();
        if n == 0 {
            return None;
        }
        let windows = self.strides();
        let (start, end) = windows[stride as usize % windows.len()];
        let span = (end - start).max(1) as f32;
        let phase = phase.rem_euclid(1.0);
        let x = self
            .frame_at_distance(start, end, phase)
            .unwrap_or(start as f32 + phase * span);
        let i = x.floor() as usize % n;
        let j = (i + 1) % n;
        Some(self.sample_between(i, j, x - x.floor()))
    }

    /// Frames `i` and `j` mixed by `f`.
    fn sample_between(&self, i: usize, j: usize, f: f32) -> PoseSample {
        let a = &self.frames[i];
        let b = &self.frames[j];
        let pelvis = Vec3::new(a.pelvis.0, a.pelvis.1, a.pelvis.2)
            .lerp(Vec3::new(b.pelvis.0, b.pelvis.1, b.pelvis.2), f);
        let rotations = a
            .rotations
            .iter()
            .zip(&b.rotations)
            .map(|(p, q)| {
                Quat::from_xyzw(p.1, p.2, p.3, p.0).slerp(Quat::from_xyzw(q.1, q.2, q.3, q.0), f)
            })
            .collect();
        let directions = a
            .directions
            .iter()
            .zip(&b.directions)
            .map(|(p, q)| Vec3::new(p.0, p.1, p.2).lerp(Vec3::new(q.0, q.1, q.2), f))
            .collect();
        PoseSample {
            pelvis,
            rotations,
            directions,
            contact: a.contact,
        }
    }
}

/// One interpolated frame of a `PoseClip`: the pelvis in leg lengths from the root, each role bone's rotation and bone direction in the canonical frame, and which feet are down.
pub struct PoseSample {
    pub pelvis: Vec3,
    pub rotations: Vec<Quat>,
    pub directions: Vec<Vec3>,
    pub contact: (bool, bool),
}

#[derive(Default, TypePath)]
pub struct PoseLoader;

impl AssetLoader for PoseLoader {
    type Asset = PoseSet;
    type Settings = ();
    type Error = RigError;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _context: &mut LoadContext<'_>,
    ) -> Result<PoseSet, RigError> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;
        let mut set: PoseSet = ron::de::from_bytes(&bytes)?;
        for clip in &mut set.clips {
            if !clip.one_shot() {
                clip.trim_seam();
            }
            clip.mend_contacts();
        }
        Ok(set)
    }

    fn extensions(&self) -> &[&str] {
        &["pose.ron"]
    }
}

#[derive(Default, TypePath)]
pub struct GaitLoader;

impl AssetLoader for GaitLoader {
    type Asset = GaitSet;
    type Settings = ();
    type Error = RigError;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _context: &mut LoadContext<'_>,
    ) -> Result<GaitSet, RigError> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;
        Ok(ron::de::from_bytes(&bytes)?)
    }

    fn extensions(&self) -> &[&str] {
        &["gait.ron"]
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RigError {
    #[error("read rig profile: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse rig profile: {0}")]
    Ron(#[from] ron::error::SpannedError),
}

#[derive(Default, TypePath)]
pub struct RigLoader;

impl AssetLoader for RigLoader {
    type Asset = RigProfile;
    type Settings = ();
    type Error = RigError;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _context: &mut LoadContext<'_>,
    ) -> Result<RigProfile, RigError> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;
        Ok(ron::de::from_bytes(&bytes)?)
    }

    fn extensions(&self) -> &[&str] {
        &["rig.ron"]
    }
}

/// The profile every character is built from, plus the clip library once it has been requested.
#[derive(Resource)]
pub struct Rig {
    pub profile: Handle<RigProfile>,
    pub library: Option<Handle<Gltf>>,
    pub gaits: Option<Handle<GaitSet>>,
    pub poses: Option<Handle<PoseSet>>,
}

pub struct RigPlugin;

impl Plugin for RigPlugin {
    fn build(&self, app: &mut App) {
        app.init_asset::<RigProfile>()
            .init_asset_loader::<RigLoader>()
            .init_asset::<GaitSet>()
            .init_asset_loader::<GaitLoader>()
            .init_asset::<PoseSet>()
            .init_asset_loader::<PoseLoader>()
            .add_systems(Startup, load_rig)
            .add_systems(Update, (announce_gaits, announce_poses));
    }
}

fn load_rig(mut commands: Commands, assets: Res<AssetServer>) {
    commands.insert_resource(Rig {
        profile: assets.load(PROFILE),
        library: None,
        gaits: None,
        poses: None,
    });
}

fn announce_gaits(mut events: MessageReader<AssetEvent<GaitSet>>, sets: Res<Assets<GaitSet>>) {
    for event in events.read() {
        let AssetEvent::Added { id } = event else {
            continue;
        };
        let Some(set) = sets.get(*id) else {
            continue;
        };
        for gait in &set.gaits {
            info!(
                "gait {} <- {}: {:+.0} deg {:.2} m/s, stride {:.2}s, duty {:.2}, knee {:.0}-{:.0}, elbow {:.0}-{:.0}",
                gait.name,
                gait.source,
                gait.direction,
                gait.speed,
                gait.stride_period,
                gait.feet.first().map(|f| f.duty).unwrap_or(0.0),
                gait.knee_flexion.0,
                gait.knee_flexion.1,
                gait.elbow_flexion.0,
                gait.elbow_flexion.1
            );
        }
    }
}

fn announce_poses(mut events: MessageReader<AssetEvent<PoseSet>>, sets: Res<Assets<PoseSet>>) {
    for event in events.read() {
        let AssetEvent::Added { id } = event else {
            continue;
        };
        let Some(set) = sets.get(*id) else {
            continue;
        };
        for clip in &set.clips {
            info!(
                "pose {} <- {}: {:+.0} deg {:.2} m/s over {:.2} m legs ({:.2} leg/s), {} frames at {:.0} fps",
                clip.name,
                clip.source,
                clip.direction,
                clip.speed,
                clip.leg_length,
                clip.normalized(),
                clip.frames.len(),
                clip.fps
            );
        }
    }
}
