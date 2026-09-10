//! Plays baked lower-body joint rotations onto the rig while a character walks.
//!
//! The pose database is the mocap's own joint motion, so knees, hips and feet move as
//! the capture did; kinetree afterwards only corrects contact with the ground.

use bevy::app::AnimationSystems;
use bevy::prelude::*;

use super::action::Action;
use super::character::{Cadence, LowerBody, MoveIntent, Shot};
use super::foot_ik::FootGoal;
use super::rig::{PoseClip, PoseSample, PoseSet, Rig};

pub struct PosePlugin;

impl Plugin for PosePlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(PosePlayback::from_env()).add_systems(
            PostUpdate,
            play_pose.after(AnimationSystems).in_set(PoseSystems),
        );
    }
}

/// The least of each stance's floor error folded into the fix once the first few have averaged in, and the most the pose may be shifted.
const FLOOR_LEARN: f32 = 0.25;
const FLOOR_FIX_MAX: f32 = 0.1;

/// Heading change, degrees, from which a walking body plays a turn clip instead of bending its loop.
const TURN_TRIGGER: f32 = 60.0;
/// Clock multiplier on a turn clip: the capture turns at a stroll, and the body's speed scales with it so the feet stay under the motion.
const TURN_HURRY: f32 = 1.2;
/// Heading error, degrees, between where a running turn or start will face and the stick, past which the clip is abandoned for a fresh one.
const REDIRECT: f32 = 60.0;
/// Seconds the stick must stay released before a stop clip plays, so a tap between keys is not a stop.
const RELEASE: f32 = 0.2;
/// How fast a standing body turns to face the stick before its start clip, radians per second.
const FACE_RATE: f32 = 6.0;
/// Ground speed below which the body counts as standing for a start, and above which a turn clip may play.
const STANDING: f32 = 0.6;
/// Ground speed, m/s, above which the jog one-shots play instead of the walk ones.
const JOGGING: f32 = 3.5;
/// Stick angle, degrees, from which a standing start plays a reface clip instead of a stand turn.
const REFACE: f32 = 60.0;
/// Most extra yaw, degrees, a shot may add on top of its clip's own sweep to land on the stick.
const STEER_MAX: f32 = 45.0;
const STRIDING: f32 = 1.5;
/// Seconds over which the offset left by a source switch decays.
const INERTIA: f32 = 0.2;

/// Carries the pose across a source switch: the offset between the last frame written and the new source is remembered and decayed, so a limb keeps moving instead of cutting.
#[derive(Component, Default)]
pub struct Inertia {
    last: Option<(Vec3, Vec<Quat>, Vec<Vec3>)>,
    pelvis: Vec3,
    rotations: Vec<Quat>,
    directions: Vec<Quat>,
    left: f32,
}

impl Inertia {
    fn cut(&mut self, pelvis: Vec3, rotations: &[Quat], directions: &[Vec3]) {
        let Some((lp, lr, ld)) = &self.last else {
            return;
        };
        self.pelvis = *lp - pelvis;
        self.rotations = lr
            .iter()
            .zip(rotations)
            .map(|(a, b)| *a * b.inverse())
            .collect();
        self.directions = ld
            .iter()
            .zip(directions)
            .map(|(a, b)| {
                if a.length_squared() > 0.5 && b.length_squared() > 0.5 {
                    Quat::from_rotation_arc(b.normalize(), a.normalize())
                } else {
                    Quat::IDENTITY
                }
            })
            .collect();
        self.left = INERTIA;
    }

    fn apply(
        &mut self,
        dt: f32,
        pelvis: &mut Vec3,
        rotations: &mut [Quat],
        directions: &mut [Vec3],
    ) {
        if self.left > 0.0 {
            let t = self.left / INERTIA;
            let t = t * t;
            for (r, o) in rotations.iter_mut().zip(&self.rotations) {
                *r = Quat::IDENTITY.slerp(*o, t) * *r;
            }
            for (d, o) in directions.iter_mut().zip(&self.directions) {
                *d = Quat::IDENTITY.slerp(*o, t) * *d;
            }
            *pelvis += self.pelvis * t;
            self.left -= dt;
        }
        self.last = Some((*pelvis, rotations.to_vec(), directions.to_vec()));
    }
}

/// Where the baked pose is written, between the animation clip and the foot solver.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct PoseSystems;

/// Whether the baked pose drives the legs; `MMORPG_POSE=0` falls back to the procedural stride.
#[derive(Resource)]
pub struct PosePlayback {
    pub on: bool,
}

impl PosePlayback {
    fn from_env() -> Self {
        Self {
            on: std::env::var("MMORPG_POSE")
                .map(|v| v != "0")
                .unwrap_or(true),
        }
    }
}

/// Direction lane a travel angle (degrees, right positive) falls in, as the bake names it.
fn lane(direction: f32) -> &'static str {
    let d = direction;
    match d.abs() {
        a if a < 22.5 => "F",
        a if a < 67.5 => {
            if d > 0.0 {
                "FR"
            } else {
                "FL"
            }
        }
        a if a < 112.5 => {
            if d > 0.0 {
                "RR"
            } else {
                "LL"
            }
        }
        a if a < 157.5 => {
            if d > 0.0 {
                "BR"
            } else {
                "BL"
            }
        }
        _ => "B",
    }
}

/// The loop closest in speed within the travel direction's lane, matched in leg lengths per second so the actor's size drops out; sideways and backward lanes have no sprint, so the jog stands in. Walking forward round a bend picks the arc whose curvature is nearest the body's, left positive.
fn pick(
    set: &PoseSet,
    speed: f32,
    direction: f32,
    curvature: f32,
    leg_length: f32,
) -> Option<usize> {
    let want_lane = lane(direction);
    if want_lane == "F" && curvature.abs() > ARC_MIN && speed < ARC_SPEED_MAX {
        let side = if curvature > 0.0 { "_l" } else { "_r" };
        let arc = set
            .clips
            .iter()
            .enumerate()
            .filter(|(_, c)| c.name.starts_with("walk_arc") && c.name.ends_with(side))
            .map(|(i, c)| (i, c.curvature()))
            .filter(|(_, k)| k.abs() > 0.01)
            .min_by(|a, b| {
                (a.1.abs() - curvature.abs())
                    .abs()
                    .total_cmp(&(b.1.abs() - curvature.abs()).abs())
            })
            .map(|(i, _)| i);
        if arc.is_some() {
            return arc;
        }
    }
    let want = speed / leg_length.max(0.01);
    set.clips
        .iter()
        .enumerate()
        .filter(|(_, c)| {
            c.speed > 0.05
                && lane(c.direction) == want_lane
                && !c.name.contains("arc")
                && !c.one_shot()
        })
        .min_by(|(_, a), (_, b)| {
            (a.normalized() - want)
                .abs()
                .total_cmp(&(b.normalized() - want).abs())
        })
        .map(|(i, _)| i)
}

/// Curvature, radians per metre, below which a bend plays the straight loop, and the speed above which no walk arc applies.
const ARC_MIN: f32 = 0.15;
const ARC_SPEED_MAX: f32 = 3.0;

/// Bones whose bend plane fixes a limb's roll: the two directions whose cross product is the plane normal, and that normal at the rig's rest in model space (T-pose elbows flex forward, knees back).
fn hinge_pair(role: &str) -> Option<(&'static str, &'static str, Vec3)> {
    Some(match role {
        "thigh_l" | "calf_l" => ("thigh_l", "calf_l", Vec3::X),
        "thigh_r" | "calf_r" => ("thigh_r", "calf_r", Vec3::X),
        "upperarm_l" | "lowerarm_l" => ("upperarm_l", "lowerarm_l", Vec3::NEG_Y),
        "upperarm_r" | "lowerarm_r" => ("upperarm_r", "lowerarm_r", Vec3::Y),
        _ => return None,
    })
}

/// Sine of the smallest joint bend whose plane is trusted for roll; straighter limbs keep the arc alone.
const BEND_MIN: f32 = 0.2;

/// Whether a role is above the waist, where an action owns the bones instead of the pose.
fn upper(role: &str) -> bool {
    !matches!(
        role,
        "pelvis"
            | "thigh_l"
            | "calf_l"
            | "foot_l"
            | "ball_l"
            | "thigh_r"
            | "calf_r"
            | "foot_r"
            | "ball_r"
    )
}

/// The capture skeleton ends at the second neck bone, so the head role carries only that bone's yaw: the head turns with the neck and stays level, as a walker's does.
/// The rotation about `dir` that swings `have` onto `want`, both taken in the plane across `dir`.
fn twist_about(dir: Vec3, have: Vec3, want: Vec3) -> Option<Quat> {
    let have = have.reject_from_normalized(dir).try_normalize()?;
    let want = want.reject_from_normalized(dir).try_normalize()?;
    let angle = have.cross(want).dot(dir).atan2(have.dot(want));
    Some(Quat::from_axis_angle(dir, angle))
}

/// Swing of the whole spine from its rest axis (lowest spine joint to neck) onto the baked torso axis, and the twist about that axis from the chest delta, so the lean comes from joint positions rather than the capture skeleton's bind.
fn torso_arc(
    lower: &LowerBody,
    set: &PoseSet,
    rotations: &[Quat],
    directions: &[Vec3],
) -> Option<(Quat, Quat)> {
    let index = set.bones.iter().position(|b| b == "chest")?;
    let dir = directions
        .get(index)
        .filter(|d| d.length_squared() > 0.5)?
        .normalize();
    let delta = rotations.get(index)?;
    let base = lower
        .roles
        .iter()
        .filter(|r| r.role.starts_with("spine_"))
        .min_by_key(|r| r.role)?
        .rest
        .translation;
    let neck = lower
        .roles
        .iter()
        .find(|r| r.role == "neck")?
        .rest
        .translation;
    let rest_axis = (neck - base).try_normalize()?;
    let arc = Quat::from_rotation_arc(rest_axis, dir);
    let roll = twist_about(dir, arc * Vec3::Z, *delta * Vec3::Z)?;
    Some((arc, roll))
}

/// A frame of the baked lower body: hip centre, per-bone rotation deltas and bone directions, and which feet the data has down.
/// The moving frame over the idle one by `mix`, so a start or stop is a blend of two baked poses rather than a switch.
fn blend(idle: PoseSample, moving: PoseSample, mix: f32) -> PoseSample {
    PoseSample {
        pelvis: idle.pelvis.lerp(moving.pelvis, mix),
        rotations: idle
            .rotations
            .iter()
            .zip(&moving.rotations)
            .map(|(a, b)| a.slerp(*b, mix))
            .collect(),
        directions: idle
            .directions
            .iter()
            .zip(&moving.directions)
            .map(|(a, b)| a.lerp(*b, mix).normalize_or(*b))
            .collect(),
        contact: moving.contact,
    }
}

fn play_pose(
    time: Res<Time>,
    playback: Res<PosePlayback>,
    rig: Res<Rig>,
    sets: Res<Assets<PoseSet>>,
    mut characters: Query<(
        Entity,
        &mut Cadence,
        &LowerBody,
        Has<Action>,
        Option<&MoveIntent>,
        Option<&mut Inertia>,
    )>,
    mut goals: Query<&mut FootGoal>,
    mut transforms: Query<&mut Transform>,
) {
    if !playback.on {
        return;
    }
    let Some(set) = rig.poses.as_ref().and_then(|handle| sets.get(handle)) else {
        return;
    };
    let idle = set.clips.iter().find(|c| c.name == "idle");
    let dt = time.delta_secs();
    for (character, mut cadence, lower, acting, intent, inertia) in &mut characters {
        if !cadence.grounded {
            cadence.contact = (false, false);
            cadence.clip_period = None;
            cadence.shot = None;
            continue;
        }
        for mut goal in &mut goals {
            if goal.character == character
                && let Some(sample) = goal.sample.take()
            {
                cadence.floor_samples += 1;
                let learn = (1.0 / cadence.floor_samples as f32).max(FLOOR_LEARN);
                cadence.floor_fix =
                    (cadence.floor_fix + sample * learn).clamp(-FLOOR_FIX_MAX, FLOOR_FIX_MAX);
            }
        }
        let mut cut = false;
        let mut restart = false;
        let mut redirect = false;
        let mut released = false;
        let wish = intent.map(|i| i.wish).unwrap_or(Vec3::ZERO);
        let pushing = wish.length_squared() > 0.25;
        let span = set
            .clips
            .iter()
            .find(|c| c.name == "walk_F")
            .map(|c| {
                let (start, end) = c.strides()[0];
                (end - start) as f32
            })
            .unwrap_or(30.0);
        if let Some(mut shot) = cadence.shot {
            match set.clips.get(shot.clip) {
                Some(clip) => {
                    let hurry = if shot.turns { TURN_HURRY } else { 1.0 };
                    shot.frame += dt * clip.fps * hurry;
                    let stopping = clip.name.contains("_stop_");
                    let resumed = stopping && pushing;
                    let turned_at = |frame: f32| {
                        let swept = if shot.turns {
                            -(clip.heading_at(frame) - shot.heading).to_radians()
                        } else {
                            0.0
                        };
                        let progress = ((frame - shot.start) / (shot.end - shot.start).max(1.0))
                            .clamp(0.0, 1.0);
                        swept + shot.steer * progress
                    };
                    let goal = Quat::from_rotation_y(turned_at(shot.end)) * shot.facing;
                    let off = goal.cross(wish).y.atan2(goal.dot(wish)).to_degrees().abs();
                    let aborted = !stopping && pushing && off >= REDIRECT;
                    let dropped = !stopping && !pushing;
                    if shot.frame >= shot.end || resumed || aborted || dropped {
                        cadence.shot = None;
                        cadence.clip = None;
                        cadence.turn = 0.0;
                        cut = true;
                        restart = resumed;
                        redirect = aborted;
                        released = dropped;
                        let at = shot.frame.min(shot.end);
                        if let Some(onset) = clip.last_left_onset(at as usize) {
                            cadence.phase = ((at - onset as f32) / span).rem_euclid(1.0);
                        }
                    } else {
                        let facing = Quat::from_rotation_y(turned_at(shot.frame)) * shot.facing;
                        let right = facing.cross(Vec3::Y);
                        let local = clip.body_velocity_at(shot.frame) * hurry;
                        cadence.shot_facing = facing;
                        cadence.shot_velocity = if clip.name.starts_with("stand_") {
                            Vec3::ZERO
                        } else {
                            facing * local.z - right * local.x
                        };
                        cadence.shot = Some(shot);
                    }
                }
                None => cadence.shot = None,
            }
        }
        let resting = idle.and_then(|clip| {
            let seconds = clip.frames.len() as f32 / clip.fps.max(1.0);
            cadence.idle_phase = (cadence.idle_phase + dt / seconds.max(0.1)).rem_euclid(1.0);
            clip.sample(cadence.idle_phase, 0)
        });
        let mut moving = if let Some(shot) = cadence.shot {
            cadence.clip = Some((shot.clip, cadence.stride_count));
            cadence.clip_period = None;
            set.clips
                .get(shot.clip)
                .and_then(|clip| clip.sample_frame(shot.frame))
        } else if cadence.stepping {
            let curvature = if cadence.pace > 0.3 {
                cadence.turn / cadence.pace
            } else {
                0.0
            };
            let chosen = match cadence.clip {
                Some((index, stride)) if stride == cadence.stride_count => Some(index),
                _ => pick(
                    set,
                    cadence.pace,
                    cadence.direction,
                    curvature,
                    cadence.leg_length,
                ),
            };
            cadence.clip = chosen.map(|index| (index, cadence.stride_count));
            chosen
                .and_then(|index| set.clips.get(index))
                .and_then(|clip| {
                    let stride = clip.stride_travel(cadence.stride_count);
                    cadence.clip_period = Some(if stride > 0.05 && cadence.pace > 0.05 {
                        stride / cadence.pace
                    } else {
                        clip.stride_seconds(cadence.stride_count)
                    });
                    clip.sample(cadence.phase, cadence.stride_count)
                })
        } else {
            cadence.clip_period = None;
            cadence.clip = None;
            None
        };
        let begin = |index: usize, start: f32, end: usize, turns: bool, cadence: &mut Cadence| {
            let clip = &set.clips[index];
            cadence.shot = Some(Shot {
                clip: index,
                frame: start,
                end: end as f32,
                heading: clip.heading_at(start),
                facing: cadence.forward,
                turns,
                start,
                steer: 0.0,
            });
            cadence.shot_facing = cadence.forward;
            cadence.shot_velocity = cadence.velocity;
            cadence.clip = Some((index, cadence.stride_count));
            cadence.clip_period = None;
            clip.sample_frame(start)
        };
        let standing = cadence.hold && cadence.shot_velocity.length_squared() < 1e-6;
        cadence.hold = false;
        if pushing {
            cadence.release = 0.0;
        }
        let phase = cadence.phase.rem_euclid(1.0);
        let (left, frac) = if phase < 0.5 {
            (true, phase)
        } else {
            (false, phase - 0.5)
        };
        let running = intent.is_some_and(|i| i.run);
        let steer_to = |cadence: &mut Cadence, clip: &PoseClip, angle: f32| {
            if let Some(shot) = cadence.shot.as_mut() {
                let swept = if shot.turns {
                    -(clip.heading_at(shot.end) - shot.heading)
                } else {
                    0.0
                };
                shot.steer = (angle - swept).clamp(-STEER_MAX, STEER_MAX).to_radians();
            }
        };
        if (restart || standing || (!cut && cadence.prior_speed.max(cadence.speed) < STANDING))
            && cadence.shot.is_none()
            && pushing
        {
            let forward = cadence.forward;
            let angle = forward.cross(wish).y.atan2(forward.dot(wish)).to_degrees();
            let side = if angle > 0.0 { "l" } else { "r" };
            let find = |name: String| set.clips.iter().enumerate().find(|(_, c)| c.name == name);
            let reface = if angle.abs() >= REFACE && !running {
                let deg = if angle.abs() >= 135.0 { 180 } else { 90 };
                find(format!("walk_reface_f_{side}_{deg:03}"))
            } else {
                None
            };
            let stand = if angle.abs() >= 22.5 {
                let deg = [45, 90, 135, 180]
                    .into_iter()
                    .min_by(|a, b| {
                        (*a as f32 - angle.abs())
                            .abs()
                            .total_cmp(&(*b as f32 - angle.abs()).abs())
                    })
                    .unwrap_or(90);
                find(format!("stand_turn_{side}_{deg:03}"))
            } else {
                None
            };
            let gait = if running { "jog" } else { "walk" };
            if let Some((index, clip)) = reface {
                let (start, end) = clip.start_window();
                moving = begin(index, start as f32, end, true, &mut cadence);
                steer_to(&mut cadence, clip, angle);
                cut = true;
            } else if let Some((index, clip)) = stand {
                let (start, end) = clip.stand_window();
                moving = begin(index, start, end, true, &mut cadence);
                steer_to(&mut cadence, clip, angle);
                cut = true;
            } else if angle.abs() >= 22.5 {
                let step = (FACE_RATE * dt)
                    .min(angle.abs().to_radians())
                    .copysign(angle);
                cadence.hold = true;
                cadence.shot_facing = Quat::from_rotation_y(step) * forward;
                cadence.shot_velocity = Vec3::ZERO;
            } else if let Some((index, clip, (start, end))) = set
                .clips
                .iter()
                .enumerate()
                .filter(|(_, c)| c.name.starts_with(&format!("{gait}_start_f_")))
                .map(|(i, c)| (i, c, c.start_window()))
                .min_by_key(|(_, _, (start, end))| end - start)
            {
                moving = begin(index, start as f32, end, false, &mut cadence);
                steer_to(&mut cadence, clip, angle);
                cut = true;
            }
        }
        if (released || !cut)
            && cadence.shot.is_none()
            && cadence.stepping
            && cadence.prior_speed.max(cadence.speed) > 1.0
            && !pushing
            && moving.is_some()
        {
            let held = cadence.forward * cadence.prior_speed.max(cadence.speed);
            let gait = if cadence.prior_speed.max(cadence.speed) > JOGGING {
                "jog"
            } else {
                "walk"
            };
            cadence.release += dt;
            if cadence.release < RELEASE {
                cadence.hold = true;
                cadence.shot_facing = cadence.forward;
                cadence.shot_velocity = held;
            } else if let Some((index, (start, end))) = set
                .clips
                .iter()
                .enumerate()
                .filter(|(_, c)| c.name.starts_with(&format!("{gait}_stop_f_")))
                .map(|(i, c)| (i, c.stop_window(left, frac)))
                .min_by_key(|(_, (start, end))| (*end as f32 - start) as i32)
            {
                moving = begin(index, start, end, false, &mut cadence);
                cadence.shot_velocity = held;
                cut = true;
            }
        }
        if (redirect || !cut)
            && cadence.shot.is_none()
            && cadence.stepping
            && cadence.weight >= 0.99
            && cadence.prior_speed.max(cadence.speed) > STRIDING
            && pushing
            && moving.is_some()
        {
            let forward = cadence.forward;
            let angle = forward.cross(wish).y.atan2(forward.dot(wish)).to_degrees();
            if angle.abs() >= TURN_TRIGGER {
                let deg = [90, 135, 180]
                    .into_iter()
                    .min_by(|a, b| {
                        (*a as f32 - angle.abs())
                            .abs()
                            .total_cmp(&(*b as f32 - angle.abs()).abs())
                    })
                    .unwrap_or(90);
                let side = if angle > 0.0 { "l" } else { "r" };
                let gait = if cadence.prior_speed.max(cadence.speed) > JOGGING {
                    "jog"
                } else {
                    "walk"
                };
                let prefix = format!("{gait}_turn_{side}_{deg:03}_");
                let pick = set
                    .clips
                    .iter()
                    .enumerate()
                    .filter(|(_, c)| c.name.starts_with(&prefix))
                    .map(|(i, c)| (i, c, c.turn_window(left, frac)))
                    .min_by_key(|(_, _, (_, _, skip))| if *skip >= 0.0 { *skip } else { -2.0 * skip } as i32);
                if let Some((index, clip, (start, end, _))) = pick {
                    moving = begin(index, start, end, true, &mut cadence);
                    steer_to(&mut cadence, clip, angle);
                    cut = true;
                }
            }
        }
        let mix = cadence.weight;
        let frame = match (resting, moving) {
            (Some(idle), Some(moving)) => blend(idle, moving, mix),
            (None, Some(moving)) => moving,
            (Some(idle), None) => idle,
            (None, None) => continue,
        };
        let PoseSample {
            mut pelvis,
            mut rotations,
            mut directions,
            contact,
        } = frame;
        if let Some(mut inertia) = inertia {
            if cut {
                inertia.cut(pelvis, &rotations, &directions);
            }
            inertia.apply(dt, &mut pelvis, &mut rotations, &mut directions);
        }
        cadence.contact = if mix >= 0.99 { contact } else { (false, false) };
        for (bone, rest) in &lower.bones {
            if let Ok(mut transform) = transforms.get_mut(*bone) {
                transform.translation = rest.translation;
                transform.scale = rest.scale;
            }
        }
        let spines = lower
            .roles
            .iter()
            .filter(|r| r.role.starts_with("spine_"))
            .count()
            .max(1) as f32;
        let chest = set
            .bones
            .iter()
            .position(|b| b == "chest")
            .and_then(|i| rotations.get(i).copied());
        let torso = torso_arc(lower, set, &rotations, &directions);
        let mut model_rot: Vec<(Entity, Quat)> = Vec::with_capacity(lower.roles.len());
        for role in &lower.roles {
            if acting && upper(role.role) {
                continue;
            }
            let dir_of = |name: &str| {
                set.bones
                    .iter()
                    .position(|b| b == name)
                    .and_then(|i| directions.get(i).copied())
                    .filter(|d| d.length_squared() > 0.5)
            };
            let target = if role.role == "head" {
                let Some(index) = set.bones.iter().position(|b| b == "head") else {
                    continue;
                };
                let Some(delta) = rotations.get(index) else {
                    continue;
                };
                let look = (*delta * Vec3::Z).with_y(0.0);
                let yaw = if look.length_squared() > 0.25 {
                    Quat::from_rotation_y(look.x.atan2(look.z))
                } else {
                    Quat::IDENTITY
                };
                yaw * role.rest.rotation
            } else if matches!(role.role, "hand_l" | "hand_r") {
                let parent_rot = role
                    .parent
                    .and_then(|p| model_rot.iter().find(|(e, _)| *e == p).map(|(_, q)| *q))
                    .unwrap_or(role.parent_rest.rotation);
                parent_rot * role.parent_rest.rotation.inverse() * role.rest.rotation
            } else if let Some(rank) = role.role.strip_prefix("spine_") {
                let share = (rank.parse::<f32>().unwrap_or(0.0) + 1.0) / spines;
                match torso {
                    Some((arc, roll)) => {
                        Quat::IDENTITY.slerp(roll, share) * arc * role.rest.rotation
                    }
                    None => {
                        let Some(chest) = chest else {
                            continue;
                        };
                        Quat::IDENTITY.slerp(chest, share) * role.rest.rotation
                    }
                }
            } else {
                let Some(index) = set.bones.iter().position(|b| b == role.role) else {
                    continue;
                };
                let Some(delta) = rotations.get(index) else {
                    continue;
                };
                let direction = directions.get(index).copied().unwrap_or(Vec3::ZERO);
                if role.rest_dir != Vec3::ZERO && direction.length_squared() > 0.5 {
                    let dir = direction.normalize();
                    let arc = Quat::from_rotation_arc(role.rest_dir, dir);
                    let roll = match hinge_pair(role.role) {
                        Some((a, b, rest_normal)) => dir_of(a)
                            .zip(dir_of(b))
                            .map(|(a, b)| a.cross(b))
                            .filter(|bent| bent.length_squared() >= BEND_MIN * BEND_MIN)
                            .and_then(|bent| twist_about(dir, arc * rest_normal, bent)),
                        None => twist_about(dir, arc * Vec3::Z, *delta * Vec3::Z),
                    }
                    .unwrap_or(Quat::IDENTITY);
                    roll * arc * role.rest.rotation
                } else {
                    *delta * role.rest.rotation
                }
            };
            let parent_rot = role
                .parent
                .and_then(|p| model_rot.iter().find(|(e, _)| *e == p).map(|(_, q)| *q))
                .unwrap_or(role.parent_rest.rotation);
            let local = parent_rot.inverse() * target;
            if let Ok(mut transform) = transforms.get_mut(role.bone) {
                transform.rotation = local;
                if role.role == "pelvis" {
                    let rest_of = |name: &str| {
                        lower
                            .roles
                            .iter()
                            .find(|r| r.role == name)
                            .map(|r| r.rest.translation)
                    };
                    let floor = rest_of("foot_l").map(|t| t.y).unwrap_or(0.0);
                    let hips_rest = match (rest_of("thigh_l"), rest_of("thigh_r")) {
                        (Some(l), Some(r)) => (l + r) * 0.5,
                        _ => role.rest.translation,
                    };
                    let hips = pelvis * cadence.leg_length + Vec3::Y * (floor + cadence.floor_fix);
                    let world = hips + (role.rest.translation - hips_rest);
                    transform.translation = role.parent_rest.rotation.inverse()
                        * (world - role.parent_rest.translation);
                }
            }
            model_rot.push((role.bone, target));
        }
    }
}
