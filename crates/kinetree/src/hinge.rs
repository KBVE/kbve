use glam::Vec3;

use crate::math::{acos, atan2, sqrt, wrap_pi};

const EPSILON: f32 = 1e-6;

/// How well a hinge turn met the span it was asked for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reach {
    /// The span is achievable and the returned turn hits it exactly.
    Exact,
    /// The span is outside what this hinge can produce. The turn is the
    /// closest approach — fully folded or fully extended.
    Clamped,
    /// The hinge has no leverage on the span: the outboard bone lies along the
    /// axis, or the joint is coincident with the root. The turn is zero.
    Degenerate,
}

/// One hinge solution.
#[derive(Debug, Clone, Copy)]
pub struct HingeTurn {
    /// Radians to rotate the outboard bone about the axis, at the joint.
    pub turn: f32,
    pub reach: Reach,
}

/// Solves the rotation about `axis` at `mid` that puts `tip` exactly `span`
/// away from `root`.
///
/// Turning `u = tip - mid` about a unit `axis` by `t` leaves the component
/// along the axis alone and rotates the rest in place, so with `v = root - mid`
///
/// ```text
/// u(t)·v = (u·axis)(axis·v) + (flat·v) cos t + ((axis × flat)·v) sin t
/// ```
///
/// and `|tip(t) - root|² = |u|² - 2 u(t)·v + |v|²` fixes `u(t)·v`. That leaves
/// `b cos t + c sin t = d`, which has the closed form `t = atan2(c, b) ±
/// acos(d / hypot(b, c))`. Of the two roots the one nearer zero is returned,
/// which is what preserves the bend side the pose already has.
///
/// The law of cosines is *not* equivalent. It assumes the hinge is square to
/// the root-mid-tip plane; on a real skeleton it is not, and the tip lands
/// short of the goal by centimetres.
pub fn solve_hinge(axis: Vec3, root: Vec3, mid: Vec3, tip: Vec3, span: f32) -> HingeTurn {
    let u = tip - mid;
    let v = root - mid;
    let axis_u = u.dot(axis);
    let axis_v = axis.dot(v);
    let flat = u - axis * axis_u;

    let b = flat.dot(v);
    let c = axis.cross(flat).dot(v);
    let radius = sqrt(b * b + c * c);
    if radius <= EPSILON {
        return HingeTurn {
            turn: 0.0,
            reach: Reach::Degenerate,
        };
    }

    let d = (u.length_squared() + v.length_squared() - span * span) * 0.5 - axis_u * axis_v;
    let ratio = d / radius;
    let reach = if ratio.abs() > 1.0 {
        Reach::Clamped
    } else {
        Reach::Exact
    };

    let phase = atan2(c, b);
    let offset = acos(ratio.clamp(-1.0, 1.0));
    let first = wrap_pi(phase + offset);
    let second = wrap_pi(phase - offset);
    let turn = if first.abs() <= second.abs() {
        first
    } else {
        second
    };

    HingeTurn { turn, reach }
}
