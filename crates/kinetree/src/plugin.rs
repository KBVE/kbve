use bevy::app::AnimationSystems;
use bevy::prelude::*;
use bevy::transform::TransformSystems;

use crate::limb::{LimbLimits, LimbPose, RestHinge, solve_limb_with};

/// The three bones of a limb, outermost last.
///
/// `mid` must be a direct child of `root` and `tip` a direct child of `mid`.
/// Rigs with twist bones spliced between them need those named here instead,
/// or the solve writes rotations into the wrong parent space.
#[derive(Component, Debug, Clone, Copy)]
pub struct IkLimbBones {
    pub root: Entity,
    pub mid: Entity,
    pub tip: Entity,
}

/// A limb to solve, and where its tip should end up.
#[derive(Component, Debug, Clone, Copy)]
pub struct IkLimb {
    /// World-space position for the tip.
    pub goal: Vec3,
    /// 0 leaves the animation alone, 1 is the full solve.
    pub weight: f32,
    pub enabled: bool,
    /// Measured from the first pose the solver sees, then held. Set it
    /// yourself to pin the hinge to a specific bind pose.
    pub rest: Option<RestHinge>,
    /// Joint guardrails, none by default.
    pub limits: LimbLimits,
}

impl Default for IkLimb {
    fn default() -> Self {
        Self {
            goal: Vec3::ZERO,
            weight: 1.0,
            enabled: true,
            rest: None,
            limits: LimbLimits::NONE,
        }
    }
}

/// The set the solver runs in: after animation has written its bone
/// rotations, before transform propagation reads them.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct KinetreeSystems;

pub struct KinetreePlugin;

impl Plugin for KinetreePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            PostUpdate,
            solve_limbs
                .in_set(KinetreeSystems)
                .after(AnimationSystems)
                .before(TransformSystems::Propagate),
        );
    }
}

/// Composes a bone's world transform by walking its ancestors.
///
/// `GlobalTransform` is deliberately not read: propagation has not run yet at
/// this point in `PostUpdate`, so every global here is one frame stale. Bone
/// chains are a dozen deep at most, and walking them costs less than the class
/// of bug that staleness produces on a character that is moving.
///
/// Public because anything computing an [`IkLimb::goal`] needs the same view.
/// A system that reads `GlobalTransform` instead is looking at the pose *this*
/// solver produced last frame, not the one the animation just wrote, and a
/// goal derived from the previous solve feeds the solver its own output.
pub fn bone_world_transform(
    entity: Entity,
    transforms: &Query<&mut Transform>,
    parents: &Query<&ChildOf>,
) -> Option<Transform> {
    let mut accumulated = *transforms.get(entity).ok()?;
    let mut current = entity;
    while let Ok(parent) = parents.get(current) {
        current = parent.parent();
        let Ok(local) = transforms.get(current) else {
            break;
        };
        accumulated = local.mul_transform(accumulated);
    }
    Some(accumulated)
}

fn solve_limbs(
    mut limbs: Query<(&mut IkLimb, &IkLimbBones)>,
    mut transforms: Query<&mut Transform>,
    parents: Query<&ChildOf>,
) {
    for (mut limb, bones) in &mut limbs {
        if !limb.enabled || limb.weight <= 0.0 {
            continue;
        }

        let (Some(root), Some(mid), Some(tip)) = (
            bone_world_transform(bones.root, &transforms, &parents),
            bone_world_transform(bones.mid, &transforms, &parents),
            bone_world_transform(bones.tip, &transforms, &parents),
        ) else {
            continue;
        };

        let pose = LimbPose {
            root: root.translation,
            mid: mid.translation,
            tip: tip.translation,
            root_basis: root.rotation,
        };

        let rest = match limb.rest {
            Some(rest) => rest,
            None => {
                let Some(measured) =
                    RestHinge::from_rest(pose.root, pose.mid, pose.tip, pose.root_basis)
                else {
                    continue;
                };
                limb.rest = Some(measured);
                measured
            }
        };

        let solve = solve_limb_with(&pose, &rest, &limb.limits, limb.goal);
        let weight = limb.weight.clamp(0.0, 1.0);
        let turn = Quat::from_axis_angle(solve.hinge_axis, solve.hinge_turn);

        // The root swing cancels out of the mid bone's local rotation: mid's
        // parent is the root, so both sides of the change carry it.
        let mid_local = root.rotation.inverse() * turn * mid.rotation;
        let root_world = solve.root_swing * root.rotation;

        let Ok(mut root_transform) = transforms.get_mut(bones.root) else {
            continue;
        };
        let root_parent = root.rotation * root_transform.rotation.inverse();
        let root_local = root_parent.inverse() * root_world;
        root_transform.rotation = root_transform.rotation.slerp(root_local, weight);

        let Ok(mut mid_transform) = transforms.get_mut(bones.mid) else {
            continue;
        };
        mid_transform.rotation = mid_transform.rotation.slerp(mid_local, weight);
    }
}
