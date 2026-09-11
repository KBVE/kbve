//! Looking at what is selected.
//!
//! A body that faces its target with its whole trunk and never moves its
//! eyes reads as a turret. The gaze layer turns the chest, neck and head
//! toward the selected character after the pose has been written, each joint
//! taking a share of what remains so the head ends up pointing at the target
//! rather than short of it, within limits a neck actually has.

use bevy::prelude::*;
use bevy::transform::TransformSystems;
use kinetree::bone_world_transform;

use super::action::Action;
use super::character::{Cadence, Character, LowerBody};
use super::combat::Target;
use super::foot_ik::PostureSystems;

pub struct GazePlugin;

impl Plugin for GazePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, attach).add_systems(
            PostUpdate,
            look_at_target
                .after(PostureSystems)
                .before(TransformSystems::Propagate),
        );
    }
}

/// Yaw a gaze may turn from the body's facing, radians, past which it stops rather than winding the head round.
const GAZE_YAW: f32 = 1.3;
/// Pitch limits, radians, looking up and looking down.
const GAZE_UP: f32 = 0.5;
const GAZE_DOWN: f32 = 0.7;
/// Rate, per second, at which the gaze angles chase the target bearing.
const GAZE_RATE: f32 = 8.0;
/// Rate, per second, at which the gaze fades in on a target and out without one.
const FADE_RATE: f32 = 4.0;
/// Share of the remaining turn the chest takes, then the neck; the head takes the rest.
const CHEST_SHARE: f32 = 0.2;
const NECK_SHARE: f32 = 0.35;
/// Height above a target's origin looked at when it has no head bone.
const EYE_HEIGHT: f32 = 0.6;

/// Where a character is looking: smoothed yaw and pitch from its facing, and how much of that is applied.
#[derive(Component, Default, Debug, Clone, Copy)]
pub struct Gaze {
    pub yaw: f32,
    pub pitch: f32,
    pub weight: f32,
}

fn attach(mut commands: Commands, bare: Query<Entity, (With<Character>, Without<Gaze>)>) {
    for entity in &bare {
        commands.entity(entity).insert(Gaze::default());
    }
}

fn look_at_target(
    time: Res<Time>,
    mut lookers: Query<(&Cadence, &LowerBody, &Target, &mut Gaze, Has<Action>)>,
    bodies: Query<(&GlobalTransform, Option<&LowerBody>)>,
    parents: Query<&ChildOf>,
    mut transforms: Query<&mut Transform>,
) {
    let dt = time.delta_secs();
    for (cadence, lower, target, mut gaze, acting) in &mut lookers {
        let role = |name: &str| lower.roles.iter().find(|r| r.role == name);
        let chest = lower
            .roles
            .iter()
            .filter(|r| r.role.starts_with("spine_"))
            .map(|r| r.role)
            .max()
            .and_then(role);
        let (Some(head_role), Some(neck), Some(chest)) = (role("head"), role("neck"), chest) else {
            continue;
        };
        let (head, neck, chest) = (head_role.bone, neck.bone, chest.bone);
        let read = transforms.as_readonly();
        let head_world = bone_world_transform(head, &read, &parents);
        let eyes = head_world.map(|t| t.translation);
        let aim = target
            .0
            .filter(|_| !acting)
            .and_then(|entity| bodies.get(entity).ok())
            .and_then(|(body, other)| {
                let looked = other
                    .and_then(|o| o.roles.iter().find(|r| r.role == "head"))
                    .and_then(|r| bodies.get(r.bone).ok())
                    .map(|(g, _)| g.translation())
                    .unwrap_or(body.translation() + Vec3::Y * EYE_HEIGHT);
                Some((looked - eyes?).normalize_or_zero())
            })
            .filter(|d| d.length_squared() > 0.5);
        let forward =
            Vec3::new(cadence.forward.x, 0.0, cadence.forward.z).normalize_or(Vec3::NEG_Z);
        let right = forward.cross(Vec3::Y);
        let (yaw, pitch) = match aim {
            Some(dir) => (
                dir.dot(right)
                    .atan2(dir.dot(forward))
                    .clamp(-GAZE_YAW, GAZE_YAW),
                dir.y.asin().clamp(-GAZE_DOWN, GAZE_UP),
            ),
            None => (gaze.yaw, gaze.pitch),
        };
        let chase = (GAZE_RATE * dt).min(1.0);
        gaze.yaw += (yaw - gaze.yaw) * chase;
        gaze.pitch += (pitch - gaze.pitch) * chase;
        let wanted = if aim.is_some() { 1.0 } else { 0.0 };
        gaze.weight += (wanted - gaze.weight) * (FADE_RATE * dt).min(1.0);
        if gaze.weight < 1e-3 {
            continue;
        }
        let Some(head_world) = head_world else {
            continue;
        };
        let facing = head_world.rotation * head_role.rest.rotation.inverse() * Vec3::Z;
        let desired =
            Quat::from_rotation_y(-gaze.yaw) * Quat::from_axis_angle(right, gaze.pitch) * forward;
        let turn = Quat::IDENTITY.slerp(Quat::from_rotation_arc(facing, desired), gaze.weight);
        let mut left = turn;
        for (bone, share) in [(chest, CHEST_SHARE), (neck, NECK_SHARE), (head, 1.0)] {
            let part = Quat::IDENTITY.slerp(left, share);
            left = part.inverse() * left;
            let read = transforms.as_readonly();
            let Some(world) = bone_world_transform(bone, &read, &parents) else {
                continue;
            };
            if let Ok(mut transform) = transforms.get_mut(bone) {
                transform.rotation *= world.rotation.inverse() * part * world.rotation;
            }
        }
    }
}
