use glam::{Quat, Vec3};

use crate::hinge::{HingeTurn, Reach, solve_hinge};
use crate::math::{atan2, wrap_pi};

const FLAT_EPSILON: f32 = 1e-9;

/// The hinge axis of a two-bone limb, measured once from its rest pose and
/// stored in the *root* bone's basis.
///
/// Anchored to the root, not the mid bone: the mid bone's rotation is the
/// solve's own output, so reading the axis from it would feed the result back
/// into its own input.
///
/// Measured from the rest pose rather than the posed triangle. A near-straight
/// limb has a tiny, ill-conditioned cross product — a leg at 158° gives a
/// plane roughly 50° off anatomical, and the solve amplifies that until the
/// knee leaves the body.
#[derive(Debug, Clone, Copy)]
pub struct RestHinge {
    axis_local: Vec3,
}

/// How far a rest limb must be bent before its bend plane is trustworthy,
/// as the sine of the angle away from straight. Roughly 30 degrees.
///
/// Not a safety margin against division by zero -- `try_normalize` covers
/// that. A limb only slightly bent has a small, ill-conditioned cross product,
/// and the error in its direction is what the solve then amplifies. Measured
/// on a real rig: a knee 22 degrees from straight yields an axis about 40
/// degrees off the same rig's true hinge, while the same leg at 87 degrees
/// yields it to three decimal places.
const MIN_BEND_SINE: f32 = 0.5;

impl RestHinge {
    /// Measures the hinge from three rest-pose joint positions and the root
    /// bone's rest rotation.
    ///
    /// Returns `None` when the rest limb is straight or nearly so, because the
    /// bend plane is then undefined or unreliable -- see [`MIN_BEND_SINE`]. A
    /// bind pose is frequently exactly straight, so prefer
    /// [`RestHinge::from_local_axis`] whenever the rig's hinge is known.
    pub fn from_rest(root: Vec3, mid: Vec3, tip: Vec3, root_basis: Quat) -> Option<Self> {
        let to_root = root - mid;
        let to_tip = tip - mid;
        let normal = to_root.cross(to_tip);
        let spread = to_root.length() * to_tip.length();
        if spread <= f32::EPSILON || normal.length() < MIN_BEND_SINE * spread {
            return None;
        }
        let axis = normal.try_normalize()?;
        Some(Self {
            axis_local: root_basis.inverse() * axis,
        })
    }

    /// Builds the hinge from an axis already expressed in the root bone's
    /// basis, for a rig whose joint is known rather than inferred.
    ///
    /// This is the reliable route. A skeleton's bind pose usually has its
    /// limbs straight, which leaves [`RestHinge::from_rest`] nothing to
    /// measure, and an animated frame is only trustworthy when the joint
    /// happens to be well bent at the moment it is sampled.
    ///
    /// Returns `None` if `axis_local` cannot be normalized.
    pub fn from_local_axis(axis_local: Vec3) -> Option<Self> {
        Some(Self {
            axis_local: axis_local.try_normalize()?,
        })
    }

    /// The stored axis, in the root bone's basis.
    pub fn axis_local(&self) -> Vec3 {
        self.axis_local
    }

    /// The axis in world space, carried by the root bone's *current* rotation.
    pub fn axis(&self, root_basis: Quat) -> Vec3 {
        (root_basis * self.axis_local).normalize()
    }
}

/// A posed two-bone limb: three world-space joints plus the root bone's
/// current rotation.
#[derive(Debug, Clone, Copy)]
pub struct LimbPose {
    pub root: Vec3,
    pub mid: Vec3,
    pub tip: Vec3,
    pub root_basis: Quat,
}

/// What to apply to reach the goal, in order: turn the mid bone, then swing
/// the root.
#[derive(Debug, Clone, Copy)]
pub struct LimbSolve {
    /// World-space hinge axis the turn is about.
    pub hinge_axis: Vec3,
    /// Radians to rotate the outboard bone about `hinge_axis`, at `mid`.
    pub hinge_turn: f32,
    /// Rotation to apply to the root bone, about `root`. Carries the mid bone
    /// and the bend plane rigidly.
    pub root_swing: Quat,
    pub reach: Reach,
}

impl LimbSolve {
    /// Where `tip` ends up once both parts are applied.
    pub fn tip_after(&self, pose: &LimbPose) -> Vec3 {
        let turned = pose.mid
            + Quat::from_axis_angle(self.hinge_axis, self.hinge_turn) * (pose.tip - pose.mid);
        pose.root + self.root_swing * (turned - pose.root)
    }

    /// Where `mid` ends up once both parts are applied.
    pub fn mid_after(&self, pose: &LimbPose) -> Vec3 {
        pose.root + self.root_swing * (pose.mid - pose.root)
    }
}

/// Solves a two-bone limb onto `goal`.
///
/// The hinge sets the distance from root to tip; the root swing then aims that
/// fixed-length reach at the goal. A pole vector is deliberately absent — a
/// per-frame bend direction is invented data, and every rig that supplies one
/// then needs confidence blending, an anatomical fallback and a yaw cone to
/// constrain the invention back to something plausible. The rest-pose hinge is
/// measured, so none of that is needed.
pub fn solve_limb(pose: &LimbPose, rest: &RestHinge, goal: Vec3) -> LimbSolve {
    solve_limb_with(pose, rest, &LimbLimits::NONE, goal)
}

/// Joint guardrails applied on top of the hinge solve.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct LimbLimits {
    /// Greatest flexion at the hinge in radians, zero being full extension.
    pub max_flexion: Option<f32>,
}

impl LimbLimits {
    pub const NONE: Self = Self { max_flexion: None };

    /// Caps flexion at `radians` from full extension.
    pub fn flexion(radians: f32) -> Self {
        Self {
            max_flexion: Some(radians),
        }
    }
}

/// Solves a two-bone limb onto `goal` under `limits`, reporting `Reach::Clamped` when a limit binds.
pub fn solve_limb_with(
    pose: &LimbPose,
    rest: &RestHinge,
    limits: &LimbLimits,
    goal: Vec3,
) -> LimbSolve {
    let hinge_axis = rest.axis(pose.root_basis);
    let span = (goal - pose.root).length();
    let mut hinge = solve_hinge(hinge_axis, pose.root, pose.mid, pose.tip, span);
    if let Some(max_flexion) = limits.max_flexion {
        hinge = clamp_flexion(hinge_axis, pose, hinge, max_flexion);
    }

    let turned = pose.mid + Quat::from_axis_angle(hinge_axis, hinge.turn) * (pose.tip - pose.mid);
    let from = (turned - pose.root).try_normalize();
    let to = (goal - pose.root).try_normalize();
    let root_swing = match (from, to) {
        (Some(from), Some(to)) => Quat::from_rotation_arc(from, to),
        _ => Quat::IDENTITY,
    };

    LimbSolve {
        hinge_axis,
        hinge_turn: hinge.turn,
        root_swing,
        reach: hinge.reach,
    }
}

/// Signed angle from the root bone to the tip bone about `axis`, at `mid`; magnitude pi when straight.
pub fn hinge_angle(axis: Vec3, pose: &LimbPose) -> Option<f32> {
    let u = pose.tip - pose.mid;
    let v = pose.root - pose.mid;
    let u_flat = u - axis * u.dot(axis);
    let v_flat = v - axis * v.dot(axis);
    if u_flat.length_squared() <= FLAT_EPSILON || v_flat.length_squared() <= FLAT_EPSILON {
        return None;
    }
    Some(atan2(axis.dot(v_flat.cross(u_flat)), v_flat.dot(u_flat)))
}

fn clamp_flexion(axis: Vec3, pose: &LimbPose, hinge: HingeTurn, max_flexion: f32) -> HingeTurn {
    let Some(before) = hinge_angle(axis, pose) else {
        return hinge;
    };
    let after = wrap_pi(before + hinge.turn);
    let floor = core::f32::consts::PI - max_flexion.clamp(0.0, core::f32::consts::PI);
    if after.abs() >= floor {
        return hinge;
    }
    let side = if before != 0.0 { before } else { after };
    let clamped = if side >= 0.0 { floor } else { -floor };
    HingeTurn {
        turn: wrap_pi(clamped - before),
        reach: Reach::Clamped,
    }
}
