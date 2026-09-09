//! FABRIK: reaching with a chain of any length.
//!
//! [`solve_hinge`](crate::solve_hinge) answers a narrow question exactly -- two
//! segments, one hinge, a closed form, no iteration. This answers a wider one
//! approximately: given any number of joints, put the last one on a target
//! while keeping every segment the length it started.
//!
//! The two are partners rather than alternatives. Forward And Backward Reaching
//! Inverse Kinematics is unconstrained: nothing in it knows that an elbow only
//! bends one way, so a chain solved by this alone will happily fold a knee
//! sideways. The intended arrangement is to position a long chain here -- a
//! spine, a clavicle and an arm together, a tail -- and then let the hinge
//! solver finish the joints that really are hinges.
//!
//! Nothing here allocates. The caller owns the joint positions and the rest
//! lengths, which is what lets the same solver run inside a `no_std` build, a
//! server tick, and a Bevy system without three different versions of it.

use crate::hinge::Reach;
use glam::Vec3;

/// How hard to try before accepting the result.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Effort {
    /// Maximum passes. Each pass is one walk down the chain and one back.
    pub iterations: u8,
    /// How close to the target counts as arrived, in world units.
    pub tolerance: f32,
}

impl Default for Effort {
    /// Ten passes and a millimetre.
    ///
    /// FABRIK converges quickly for reachable targets -- usually within a few
    /// passes -- and the iteration cap is really a guard against the awkward
    /// cases, not the normal path.
    fn default() -> Self {
        Self {
            iterations: 10,
            tolerance: 0.001,
        }
    }
}

/// Rest lengths of each segment, measured once from the chain's bind pose.
///
/// Taken as an argument rather than recomputed from `joints` on every call: the
/// whole point is to preserve the *original* lengths, and a chain that has
/// already been solved once no longer carries them.
pub fn segment_lengths(joints: &[Vec3], out: &mut [f32]) -> bool {
    if joints.len() < 2 || out.len() + 1 != joints.len() {
        return false;
    }
    for (index, length) in out.iter_mut().enumerate() {
        *length = joints[index].distance(joints[index + 1]);
    }
    true
}

/// Moves the chain so its last joint reaches `target`.
///
/// `joints` is the chain from root to tip and is rewritten in place. The root
/// stays exactly where it started -- a limb does not get to move its own
/// shoulder -- and every segment keeps the length given in `lengths`.
///
/// Returns how well it did, using the same vocabulary as the hinge solver so a
/// caller can treat the two the same way.
pub fn solve_chain(joints: &mut [Vec3], lengths: &[f32], target: Vec3, effort: Effort) -> Reach {
    if joints.len() < 2 || lengths.len() + 1 != joints.len() {
        return Reach::Degenerate;
    }

    let total: f32 = lengths.iter().sum();
    if total <= f32::EPSILON {
        return Reach::Degenerate;
    }

    let root = joints[0];
    let span = root.distance(target);
    let tip = joints.len() - 1;

    // A chain has an inner limit as well as an outer one. If one segment is
    // longer than all the others put together, the rest cannot fold far enough
    // to bring the tip back past it, and everything closer than that difference
    // is unreachable however many passes are spent on it. A single segment is
    // the extreme case: it reaches exactly one sphere and nothing inside it.
    let longest = lengths.iter().copied().fold(0.0_f32, f32::max);
    let inner = (2.0 * longest - total).max(0.0);

    if span > total || span < inner {
        // Both limits have the same answer: point the chain at the target and
        // put the tip on the nearest reachable point along that line. Iterating
        // would only crawl towards a pose that is already known exactly.
        let direction = (target - root)
            .try_normalize()
            // A target sitting on the root gives no direction, so keep the one
            // the chain already has rather than inventing one.
            .or_else(|| (joints[tip] - root).try_normalize())
            .unwrap_or(Vec3::Y);

        if span > total {
            let mut position = root;
            for (index, length) in lengths.iter().enumerate() {
                position += direction * *length;
                joints[index + 1] = position;
            }
        } else {
            // Fold the short segments back along the line so the tip lands on
            // the inner limit, keeping every length exact.
            let reachable = root + direction * inner;
            return match solve_chain_inner(joints, lengths, reachable, effort, root, tip) {
                Reach::Degenerate => Reach::Degenerate,
                _ => Reach::Clamped,
            };
        }
        return Reach::Clamped;
    }

    solve_chain_inner(joints, lengths, target, effort, root, tip)
}

/// The iteration itself, once the target is known to be reachable.
fn solve_chain_inner(
    joints: &mut [Vec3],
    lengths: &[f32],
    target: Vec3,
    effort: Effort,
    root: Vec3,
    tip: usize,
) -> Reach {
    for _ in 0..effort.iterations {
        if joints[tip].distance(target) <= effort.tolerance {
            return Reach::Exact;
        }

        // Backward: put the tip on the target, then drag each joint towards its
        // successor, keeping the segment length.
        joints[tip] = target;
        for index in (0..tip).rev() {
            joints[index] = pull(joints[index + 1], joints[index], lengths[index]);
        }

        // Forward: put the root back where it belongs and repair the chain from
        // there. Without this the chain would simply drift towards the target.
        joints[0] = root;
        for index in 0..tip {
            joints[index + 1] = pull(joints[index], joints[index + 1], lengths[index]);
        }
    }

    if joints[tip].distance(target) <= effort.tolerance {
        Reach::Exact
    } else {
        // Ran out of iterations while still reachable. Rare, and the pose is
        // still valid -- every segment is the right length -- so this is a
        // quality report, not a failure.
        Reach::Clamped
    }
}

/// A point `length` away from `anchor`, in the direction of `towards`.
///
/// Degenerate input -- two joints in the same place -- keeps the anchor rather
/// than producing a NaN that would spread through the whole chain on the next
/// pass.
#[inline]
fn pull(anchor: Vec3, towards: Vec3, length: f32) -> Vec3 {
    match (towards - anchor).try_normalize() {
        Some(direction) => anchor + direction * length,
        None => anchor,
    }
}

/// How far the tip ended up from where it was asked to go.
///
/// Worth reporting separately from [`Reach`]: a caller blending IK against an
/// animation wants to fade the correction out as the error grows, rather than
/// snapping off at a threshold.
pub fn tip_error(joints: &[Vec3], target: Vec3) -> f32 {
    joints
        .last()
        .map_or(f32::INFINITY, |tip| tip.distance(target))
}
