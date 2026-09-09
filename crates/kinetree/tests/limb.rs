use glam::{Quat, Vec3};
use kinetree::{LimbLimits, LimbPose, Reach, RestHinge, solve_hinge, solve_limb, solve_limb_with};

fn rest_leg() -> (Vec3, Vec3, Vec3) {
    (
        Vec3::new(0.0, 0.92, 0.0),
        Vec3::new(0.0, 0.50, 0.18),
        Vec3::new(0.0, 0.10, 0.02),
    )
}

// Bent 45 degrees at the knee, deliberately. An anatomical rest leg is only a
// few degrees off straight, and `RestHinge::from_rest` refuses those -- their
// bend plane is noise. A fixture that squeaked past the threshold would be
// testing the solver on exactly the input the crate tells callers not to use.
//
// A goal still has to be placed by reach rather than by eye: thigh + shin is
// 0.888m here, so anything picked freehand lands outside the annulus and is
// correctly reported unreachable.
fn goal_at(hip: Vec3, direction: Vec3, reach: f32) -> Vec3 {
    hip + direction.normalize() * reach
}

#[test]
fn identity_goal_leaves_the_pose_alone() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };

    let solve = solve_limb(&pose, &rest, ankle);

    assert!(
        solve.hinge_turn.abs() < 1e-5,
        "turn was {}",
        solve.hinge_turn
    );
    assert!(solve.tip_after(&pose).distance(ankle) < 1e-5);
}

#[test]
fn reachable_goals_land_exactly() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };

    let placements = [
        (Vec3::new(0.10, -1.0, 0.20), 0.82),
        (Vec3::new(-0.30, -1.0, -0.10), 0.70),
        (Vec3::new(0.0, -1.0, 0.45), 0.60),
        (Vec3::new(0.55, -1.0, 0.0), 0.45),
        (Vec3::new(-0.20, -1.0, 0.35), 0.86),
    ];

    for (direction, reach) in placements {
        let goal = goal_at(hip, direction, reach);
        let solve = solve_limb(&pose, &rest, goal);
        assert_eq!(solve.reach, Reach::Exact, "goal {goal} was not reachable");
        let error = solve.tip_after(&pose).distance(goal);
        assert!(error < 1e-4, "goal {goal} missed by {error}");
    }
}

#[test]
fn bone_lengths_are_preserved() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };
    let thigh = hip.distance(knee);
    let shin = knee.distance(ankle);

    let solve = solve_limb(
        &pose,
        &rest,
        goal_at(hip, Vec3::new(0.15, -1.0, 0.25), 0.75),
    );
    let mid = solve.mid_after(&pose);
    let tip = solve.tip_after(&pose);

    assert!((hip.distance(mid) - thigh).abs() < 1e-5);
    assert!((mid.distance(tip) - shin).abs() < 1e-5);
}

#[test]
fn the_bend_side_survives_the_solve() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };
    let bend_before = (knee - hip).cross(ankle - knee).normalize();

    let solve = solve_limb(&pose, &rest, goal_at(hip, Vec3::new(0.0, -1.0, 0.30), 0.62));
    let mid = solve.mid_after(&pose);
    let tip = solve.tip_after(&pose);
    let bend_after = (mid - hip).cross(tip - mid).normalize();

    assert!(
        bend_before.dot(bend_after) > 0.9,
        "knee flipped through the joint"
    );
}

#[test]
fn a_rotated_root_carries_the_hinge() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();

    let yaw = Quat::from_rotation_y(core::f32::consts::FRAC_PI_2);
    let pose = LimbPose {
        root: hip,
        mid: hip + yaw * (knee - hip),
        tip: hip + yaw * (ankle - hip),
        root_basis: yaw,
    };
    let goal = hip + yaw * (goal_at(hip, Vec3::new(0.10, -1.0, 0.20), 0.82) - hip);

    let solve = solve_limb(&pose, &rest, goal);
    assert_eq!(solve.reach, Reach::Exact);
    assert!(solve.tip_after(&pose).distance(goal) < 1e-4);
}

#[test]
fn an_unreachable_goal_clamps_instead_of_failing() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };

    let solve = solve_limb(&pose, &rest, hip + Vec3::new(0.0, -40.0, 0.0));

    assert_eq!(solve.reach, Reach::Clamped);
    assert!(solve.hinge_turn.is_finite());
    assert!(solve.tip_after(&pose).is_finite());
}

#[test]
fn a_straight_rest_limb_has_no_hinge() {
    let hip = Vec3::new(0.0, 1.0, 0.0);
    let knee = Vec3::new(0.0, 0.5, 0.0);
    let ankle = Vec3::ZERO;

    assert!(RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).is_none());
}

#[test]
fn a_bone_along_the_axis_reports_degenerate() {
    let axis = Vec3::Y;
    let root = Vec3::new(0.0, 1.0, 0.0);
    let mid = Vec3::ZERO;
    let tip = Vec3::new(0.0, -0.5, 0.0);

    assert_eq!(
        solve_hinge(axis, root, mid, tip, 1.2).reach,
        Reach::Degenerate
    );
}

#[test]
fn a_barely_bent_rest_limb_is_refused() {
    let hip = Vec3::new(0.0, 0.92, 0.0);
    let knee = Vec3::new(0.0, 0.50, 0.02);
    let ankle = Vec3::new(0.0, 0.08, 0.0);

    assert!(
        RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).is_none(),
        "a nearly straight limb must not yield an axis; its bend plane is noise"
    );
}

#[test]
fn a_known_axis_solves_a_straight_bind_pose() {
    let hip = Vec3::new(0.0, 0.92, 0.0);
    let knee = Vec3::new(0.0, 0.49, 0.0);
    let ankle = Vec3::new(0.0, 0.06, 0.0);

    assert!(RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).is_none());

    let rest = RestHinge::from_local_axis(Vec3::NEG_X).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };
    let goal = goal_at(hip, Vec3::new(0.0, -1.0, 0.35), 0.72);

    let solve = solve_limb(&pose, &rest, goal);
    assert_eq!(solve.reach, Reach::Exact);
    assert!(solve.tip_after(&pose).distance(goal) < 1e-4);
}

fn flexion_after(pose: &LimbPose, solve: &kinetree::LimbSolve) -> f32 {
    let mid = solve.mid_after(pose);
    let tip = solve.tip_after(pose);
    let interior = (pose.root - mid).angle_between(tip - mid);
    core::f32::consts::PI - interior
}

#[test]
fn a_flexion_ceiling_stops_the_fold() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };
    let goal = goal_at(hip, Vec3::new(0.0, -1.0, 0.3), 0.30);
    let max = 60f32.to_radians();

    let free = solve_limb(&pose, &rest, goal);
    let capped = solve_limb_with(&pose, &rest, &LimbLimits::flexion(max), goal);

    assert!(flexion_after(&pose, &free) > max + 0.1);
    assert!(flexion_after(&pose, &capped) <= max + 1e-4);
    assert_eq!(capped.reach, Reach::Clamped);

    let thigh = hip.distance(knee);
    let shin = knee.distance(ankle);
    assert!((hip.distance(capped.mid_after(&pose)) - thigh).abs() < 1e-5);
    assert!((capped.mid_after(&pose).distance(capped.tip_after(&pose)) - shin).abs() < 1e-5);
}

#[test]
fn a_slack_ceiling_changes_nothing() {
    let (hip, knee, ankle) = rest_leg();
    let rest = RestHinge::from_rest(hip, knee, ankle, Quat::IDENTITY).unwrap();
    let pose = LimbPose {
        root: hip,
        mid: knee,
        tip: ankle,
        root_basis: Quat::IDENTITY,
    };
    let goal = goal_at(hip, Vec3::new(0.10, -1.0, 0.20), 0.82);

    let free = solve_limb(&pose, &rest, goal);
    let capped = solve_limb_with(
        &pose,
        &rest,
        &LimbLimits::flexion(150f32.to_radians()),
        goal,
    );

    assert!((free.hinge_turn - capped.hinge_turn).abs() < 1e-6);
    assert_eq!(capped.reach, Reach::Exact);
}
