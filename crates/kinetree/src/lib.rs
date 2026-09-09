//! Closed-form hinge inverse kinematics for skeletal limbs.
//!
//! A two-bone limb — hip/knee/ankle, shoulder/elbow/wrist — has one degree of
//! freedom at the middle joint and three at the root. This solves the middle
//! joint in closed form on a hinge axis measured from the rest pose, then
//! swings the root to aim the result. There is no iteration, no pole target
//! and no convergence threshold: the answer is one `atan2` and one `acos`.
//!
//! ```
//! use glam::{Quat, Vec3};
//! use kinetree::{LimbPose, RestHinge, solve_limb};
//!
//! // A knee hinges about the thigh's own X. Naming the axis beats inferring
//! // it: a bind pose is usually straight, which leaves nothing to measure.
//! let rest = RestHinge::from_local_axis(Vec3::NEG_X).unwrap();
//!
//! let (hip, knee, ankle) = (
//!     Vec3::new(0.0, 0.92, 0.0),
//!     Vec3::new(0.0, 0.50, 0.18),
//!     Vec3::new(0.0, 0.10, 0.02),
//! );
//! let pose = LimbPose { root: hip, mid: knee, tip: ankle, root_basis: Quat::IDENTITY };
//! let goal = hip + Vec3::new(0.0, -1.0, 0.35).normalize() * 0.72;
//! let solve = solve_limb(&pose, &rest, goal);
//!
//! assert!(solve.tip_after(&pose).distance(goal) < 1e-4);
//! ```
//!
//! # Longer chains
//!
//! [`solve_chain`] is the other half: FABRIK, for chains of any length, when
//! the question is "put the end here" rather than "bend this hinge". It is
//! iterative and unconstrained, so it does not know an elbow from a shoulder --
//! the intended pairing is to position a long chain with it and then finish the
//! genuine hinges with [`solve_limb`].
//!
//! The core is glam and nothing else. Bevy components and the plugin live
//! behind the `bevy` feature, which is on by default.

#![cfg_attr(docsrs, feature(doc_cfg))]

mod chain;
mod hinge;
mod limb;
mod math;
mod rig;

pub use chain::{Effort, segment_lengths, solve_chain, tip_error};
pub use hinge::{HingeTurn, Reach, solve_hinge};
pub use limb::{
    LimbLimits, LimbPose, LimbSolve, RestHinge, hinge_angle, solve_limb, solve_limb_with,
};
pub use rig::{Bone, Half, MAX_SPINE, Side, Skeleton, UNMAPPED, arm, leg, role_of};

#[cfg(feature = "bevy")]
mod plugin;

#[cfg(feature = "bevy")]
pub use plugin::{
    IkLimb, IkLimbBones, KinetreePlugin, KinetreeSystems, LimbOutput, bone_world_transform,
};
