//! Plays baked lower-body joint rotations onto the rig while a character walks.
//!
//! The pose database is the mocap's own joint motion, so knees, hips and feet move as
//! the capture did; kinetree afterwards only corrects contact with the ground.

use bevy::app::AnimationSystems;
use bevy::prelude::*;

use super::action::Action;
use super::character::{Cadence, LowerBody};
use super::foot_ik::FootGoal;
use super::rig::{PoseSet, Rig};

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

/// The loop closest in speed within the travel direction's lane; sideways and backward lanes have no sprint, so the jog stands in.
fn pick(set: &PoseSet, speed: f32, direction: f32) -> Option<&super::rig::PoseClip> {
    let lane = lane(direction);
    let suffix = format!("_{lane}");
    set.clips
        .iter()
        .filter(|c| c.speed > 0.05 && c.name.ends_with(&suffix) && !c.name.contains("arc"))
        .min_by(|a, b| (a.speed - speed).abs().total_cmp(&(b.speed - speed).abs()))
}

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

/// A frame of the baked lower body: hip centre, per-bone rotation deltas and bone directions, and which feet the data has down.
type Sample = (Vec3, Vec<Quat>, Vec<Vec3>, (bool, bool));

/// The moving frame over the idle one by `mix`, so a start or stop is a blend of two baked poses rather than a switch.
fn blend(idle: Sample, moving: Sample, mix: f32) -> Sample {
    let (ip, ir, id, _) = idle;
    let (mp, mr, md, contact) = moving;
    let pelvis = ip.lerp(mp, mix);
    let rotations = ir.iter().zip(&mr).map(|(a, b)| a.slerp(*b, mix)).collect();
    let directions = id
        .iter()
        .zip(&md)
        .map(|(a, b)| a.lerp(*b, mix).normalize_or(*b))
        .collect();
    (pelvis, rotations, directions, contact)
}

fn play_pose(
    time: Res<Time>,
    playback: Res<PosePlayback>,
    rig: Res<Rig>,
    sets: Res<Assets<PoseSet>>,
    mut characters: Query<(Entity, &mut Cadence, &LowerBody, Has<Action>)>,
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
    for (character, mut cadence, lower, acting) in &mut characters {
        if !cadence.grounded {
            cadence.contact = (false, false);
            cadence.clip_period = None;
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
        let resting = idle.and_then(|clip| {
            let seconds = clip.frames.len() as f32 / clip.fps.max(1.0);
            cadence.idle_phase = (cadence.idle_phase + dt / seconds.max(0.1)).rem_euclid(1.0);
            clip.sample(cadence.idle_phase, 0)
        });
        let moving = if cadence.stepping {
            pick(set, cadence.pace, cadence.direction).and_then(|clip| {
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
            None
        };
        let mix = cadence.weight;
        let frame = match (resting, moving) {
            (Some(idle), Some(moving)) => blend(idle, moving, mix),
            (None, Some(moving)) => moving,
            (Some(idle), None) => idle,
            (None, None) => continue,
        };
        let (pelvis, rotations, directions, contact) = frame;
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
        let mut model_rot: Vec<(Entity, Quat)> = Vec::with_capacity(lower.roles.len());
        for role in &lower.roles {
            if acting && upper(role.role) {
                continue;
            }
            let target = if let Some(rank) = role.role.strip_prefix("spine_") {
                let Some(chest) = chest else {
                    continue;
                };
                let share = (rank.parse::<f32>().unwrap_or(0.0) + 1.0) / spines;
                Quat::IDENTITY.slerp(chest, share) * role.rest.rotation
            } else {
                let Some(index) = set.bones.iter().position(|b| b == role.role) else {
                    continue;
                };
                let Some(delta) = rotations.get(index) else {
                    continue;
                };
                let direction = directions.get(index).copied().unwrap_or(Vec3::ZERO);
                if role.rest_dir != Vec3::ZERO && direction.length_squared() > 0.5 {
                    Quat::from_rotation_arc(role.rest_dir, direction.normalize())
                        * role.rest.rotation
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
