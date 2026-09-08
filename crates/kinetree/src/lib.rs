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
//! The core is glam and nothing else. Bevy components and the plugin live
//! behind the `bevy` feature, which is on by default.

#![cfg_attr(docsrs, feature(doc_cfg))]

mod hinge;
mod limb;
mod math;

pub use hinge::{HingeTurn, Reach, solve_hinge};
pub use limb::{LimbPose, LimbSolve, RestHinge, solve_limb};

#[cfg(feature = "bevy")]
mod plugin;

#[cfg(feature = "bevy")]
pub use plugin::{IkLimb, IkLimbBones, KinetreePlugin, KinetreeSystems, bone_world_transform};
