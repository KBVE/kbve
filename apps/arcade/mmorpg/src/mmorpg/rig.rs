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

    /// One stride as a frame window starting at a left-foot landing, or the whole clip if it has no second landing.
    pub fn stride(&self) -> (usize, usize) {
        let onsets = self.left_onsets();
        match onsets.as_slice() {
            [a, b, ..] => (*a, *b),
            [a] => (*a, *a + self.frames.len()),
            [] => (0, self.frames.len()),
        }
    }

    /// Ground the root covers over the first full stride, metres.
    pub fn stride_length(&self) -> f32 {
        let (start, end) = self.stride();
        let n = self.frames.len();
        if n == 0 {
            return 0.0;
        }
        let a = self.frames[start % n].root;
        let b = self.frames[end % n].root;
        let wrap = if end >= n {
            let first = self.frames[0].root;
            let last = self.frames[n - 1].root;
            Vec2::new(last.0 - first.0, last.1 - first.1)
        } else {
            Vec2::ZERO
        };
        (Vec2::new(b.0 - a.0, b.1 - a.1) + wrap).length()
    }

    /// Seconds one stride of this clip takes at its own baked speed.
    pub fn stride_seconds(&self) -> f32 {
        let (start, end) = self.stride();
        (end - start).max(1) as f32 / self.fps.max(1.0)
    }

    /// The pose at stride `phase` in 0..1, interpolated between frames of the first full stride.
    pub fn sample(&self, phase: f32) -> Option<(Vec3, Vec<Quat>, Vec<Vec3>, (bool, bool))> {
        let n = self.frames.len();
        if n == 0 {
            return None;
        }
        let (start, end) = self.stride();
        let span = (end - start).max(1) as f32;
        let x = start as f32 + phase.rem_euclid(1.0) * span;
        let i = x.floor() as usize % n;
        let j = (i + 1) % n;
        let f = x - x.floor();
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
        Some((pelvis, rotations, directions, a.contact))
    }
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
        Ok(ron::de::from_bytes(&bytes)?)
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
            .add_systems(Update, announce_gaits);
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
