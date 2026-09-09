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
#[require(LimbOutput)]
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

/// Local bone rotations the solve produced this frame, applied after every limb has been solved.
#[derive(Component, Debug, Clone, Copy, Default)]
pub struct LimbOutput {
    pending: Option<LimbRotations>,
}

#[derive(Debug, Clone, Copy)]
struct LimbRotations {
    root_local: Quat,
    mid_local: Quat,
    weight: f32,
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
            (solve_limbs, apply_limbs)
                .chain()
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
    transforms: &Query<&Transform>,
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
    mut limbs: Query<(&mut IkLimb, &IkLimbBones, &mut LimbOutput)>,
    transforms: Query<&Transform>,
    parents: Query<&ChildOf>,
) {
    limbs
        .par_iter_mut()
        .for_each(|(mut limb, bones, mut output)| {
            output.pending = solve_one(&mut limb, bones, &transforms, &parents);
        });
}

fn solve_one(
    limb: &mut IkLimb,
    bones: &IkLimbBones,
    transforms: &Query<&Transform>,
    parents: &Query<&ChildOf>,
) -> Option<LimbRotations> {
    if !limb.enabled || limb.weight <= 0.0 {
        return None;
    }

    let root = bone_world_transform(bones.root, transforms, parents)?;
    let mid = bone_world_transform(bones.mid, transforms, parents)?;
    let tip = bone_world_transform(bones.tip, transforms, parents)?;

    let pose = LimbPose {
        root: root.translation,
        mid: mid.translation,
        tip: tip.translation,
        root_basis: root.rotation,
    };

    let rest = match limb.rest {
        Some(rest) => rest,
        None => {
            let measured = RestHinge::from_rest(pose.root, pose.mid, pose.tip, pose.root_basis)?;
            limb.rest = Some(measured);
            measured
        }
    };

    let solve = solve_limb_with(&pose, &rest, &limb.limits, limb.goal);
    let turn = Quat::from_axis_angle(solve.hinge_axis, solve.hinge_turn);

    let mid_local = root.rotation.inverse() * turn * mid.rotation;
    let root_world = solve.root_swing * root.rotation;
    let root_current = transforms.get(bones.root).ok()?.rotation;
    let root_parent = root.rotation * root_current.inverse();
    let root_local = root_parent.inverse() * root_world;

    Some(LimbRotations {
        root_local,
        mid_local,
        weight: limb.weight.clamp(0.0, 1.0),
    })
}

fn apply_limbs(
    mut outputs: Query<(&mut LimbOutput, &IkLimbBones)>,
    mut transforms: Query<&mut Transform>,
) {
    for (mut output, bones) in &mut outputs {
        let Some(rotations) = output.pending.take() else {
            continue;
        };
        if let Ok(mut root) = transforms.get_mut(bones.root) {
            root.rotation = root.rotation.slerp(rotations.root_local, rotations.weight);
        }
        if let Ok(mut mid) = transforms.get_mut(bones.mid) {
            mid.rotation = mid.rotation.slerp(rotations.mid_local, rotations.weight);
        }
    }
}
