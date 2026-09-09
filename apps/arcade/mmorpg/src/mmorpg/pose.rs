//! Plays baked lower-body joint rotations onto the rig while a character walks.
//!
//! The pose database is the mocap's own joint motion, so knees, hips and feet move as
//! the capture did; kinetree afterwards only corrects contact with the ground.

use bevy::app::AnimationSystems;
use bevy::prelude::*;

use super::character::{Cadence, LowerBody};
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

fn play_pose(
    playback: Res<PosePlayback>,
    rig: Res<Rig>,
    sets: Res<Assets<PoseSet>>,
    mut characters: Query<(&mut Cadence, &LowerBody)>,
    mut transforms: Query<&mut Transform>,
) {
    if !playback.on {
        return;
    }
    let Some(set) = rig.poses.as_ref().and_then(|handle| sets.get(handle)) else {
        return;
    };
    for (mut cadence, lower) in &mut characters {
        if !cadence.stepping {
            cadence.contact = (false, false);
            cadence.clip_period = None;
            continue;
        }
        let Some(clip) = pick(set, cadence.pace, cadence.direction) else {
            continue;
        };
        let Some((pelvis, rotations, directions, contact)) = clip.sample(cadence.phase) else {
            continue;
        };
        cadence.contact = contact;
        let stride = clip.stride_length();
        cadence.clip_period = Some(if stride > 0.05 && cadence.pace > 0.05 {
            stride / cadence.pace
        } else {
            clip.stride_seconds()
        });
        let weight = cadence.weight;
        for (bone, rest) in &lower.bones {
            if let Ok(mut transform) = transforms.get_mut(*bone) {
                transform.translation = transform.translation.lerp(rest.translation, weight);
                transform.scale = transform.scale.lerp(rest.scale, weight);
            }
        }
        let mut model_rot: Vec<(Entity, Quat)> = Vec::with_capacity(lower.roles.len());
        for role in &lower.roles {
            let Some(index) = set.bones.iter().position(|b| b == role.role) else {
                continue;
            };
            let Some(delta) = rotations.get(index) else {
                continue;
            };
            let direction = directions.get(index).copied().unwrap_or(Vec3::ZERO);
            let target = if role.rest_dir != Vec3::ZERO && direction.length_squared() > 0.5 {
                Quat::from_rotation_arc(role.rest_dir, direction.normalize()) * role.rest.rotation
            } else {
                *delta * role.rest.rotation
            };
            let parent_rot = role
                .parent
                .and_then(|p| model_rot.iter().find(|(e, _)| *e == p).map(|(_, q)| *q))
                .unwrap_or(role.parent_rest.rotation);
            let local = parent_rot.inverse() * target;
            if let Ok(mut transform) = transforms.get_mut(role.bone) {
                transform.rotation = transform.rotation.slerp(local, weight);
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
                    let hips = pelvis * cadence.leg_length + Vec3::Y * floor;
                    let world = hips + (role.rest.translation - hips_rest);
                    let want = role.parent_rest.rotation.inverse()
                        * (world - role.parent_rest.translation);
                    transform.translation = transform.translation.lerp(want, weight);
                }
            }
            model_rot.push((role.bone, target));
        }
    }
}
