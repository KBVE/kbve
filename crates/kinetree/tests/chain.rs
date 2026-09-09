use glam::Vec3;
use kinetree::{Effort, Reach, segment_lengths, solve_chain, tip_error};

/// A six-joint chain standing in for spine, clavicle and arm together -- the
/// case the hinge solver structurally cannot take.
fn arm_chain() -> ([Vec3; 6], [f32; 5]) {
    let joints = [
        Vec3::new(0.0, 1.10, 0.0),
        Vec3::new(0.0, 1.28, 0.0),
        Vec3::new(0.06, 1.44, 0.0),
        Vec3::new(0.18, 1.46, 0.0),
        Vec3::new(0.18, 1.19, 0.02),
        Vec3::new(0.18, 0.92, 0.04),
    ];
    let mut lengths = [0.0; 5];
    assert!(segment_lengths(&joints, &mut lengths));
    (joints, lengths)
}

fn assert_intact(solved: &[Vec3], lengths: &[f32], root: Vec3) {
    assert!(
        solved[0].distance(root) < 1e-5,
        "the root moved: a limb must not relocate its own shoulder"
    );
    for (index, length) in lengths.iter().enumerate() {
        let actual = solved[index].distance(solved[index + 1]);
        assert!(
            (actual - length).abs() < 1e-3,
            "segment {index} changed length: {length} -> {actual}"
        );
    }
    assert!(
        solved.iter().all(|joint| joint.is_finite()),
        "solver produced a non-finite joint"
    );
}

#[test]
fn a_reachable_target_is_reached_with_every_bone_intact() {
    let (mut joints, lengths) = arm_chain();
    let root = joints[0];
    let target = Vec3::new(0.45, 1.30, 0.30);

    let reach = solve_chain(&mut joints, &lengths, target, Effort::default());

    assert_eq!(reach, Reach::Exact);
    assert!(tip_error(&joints, target) < 0.001);
    assert_intact(&joints, &lengths, root);
}

#[test]
fn an_unreachable_target_straightens_the_chain_towards_it() {
    let (mut joints, lengths) = arm_chain();
    let root = joints[0];
    let total: f32 = lengths.iter().sum();
    let direction = Vec3::new(1.0, 0.4, 0.2).normalize();
    let target = root + direction * (total * 3.0);

    let reach = solve_chain(&mut joints, &lengths, target, Effort::default());

    assert_eq!(reach, Reach::Clamped);
    assert_intact(&joints, &lengths, root);

    // Fully extended along the line to the target, so the tip is exactly the
    // chain's total length away rather than somewhere short of it.
    assert!((joints[5].distance(root) - total).abs() < 1e-3);
    let aim = (joints[5] - root).normalize();
    assert!(aim.dot(direction) > 0.999, "the chain did not point at it");
}

#[test]
fn a_target_on_the_root_does_not_produce_nonsense() {
    let (mut joints, lengths) = arm_chain();
    let root = joints[0];

    solve_chain(&mut joints, &lengths, root, Effort::default());

    // Unreachable in the other direction -- the chain cannot fold onto its own
    // origin -- but it must stay a valid pose rather than collapsing to NaN.
    assert_intact(&joints, &lengths, root);
}

#[test]
fn solving_a_pose_that_already_reaches_leaves_it_alone() {
    let (mut joints, lengths) = arm_chain();
    let before = joints;
    let target = joints[5];

    let reach = solve_chain(&mut joints, &lengths, target, Effort::default());

    assert_eq!(reach, Reach::Exact);
    for (index, joint) in joints.iter().enumerate() {
        assert!(
            joint.distance(before[index]) < 1e-5,
            "joint {index} moved when nothing needed to change"
        );
    }
}

#[test]
fn a_mismatched_length_table_is_refused_rather_than_guessed() {
    let (mut joints, _) = arm_chain();
    let wrong = [0.1; 3];
    assert_eq!(
        solve_chain(&mut joints, &wrong, Vec3::ZERO, Effort::default()),
        Reach::Degenerate
    );
}

#[test]
fn a_single_segment_reaches_only_its_own_sphere() {
    let mut joints = [Vec3::ZERO, Vec3::new(0.0, 1.0, 0.0)];
    let lengths = [1.0];
    let target = Vec3::new(0.6, 0.0, 0.0);

    let reach = solve_chain(&mut joints, &lengths, target, Effort::default());

    // A segment cannot shorten. Everything nearer than its length is inside the
    // chain's inner limit, so this is clamped, not reached.
    assert_eq!(reach, Reach::Clamped);
    assert!((joints[1].distance(joints[0]) - 1.0).abs() < 1e-3);
    // Clamped along the line to the target, not left wherever it started.
    let aim = (joints[1] - joints[0]).normalize();
    assert!(aim.dot(target.normalize()) > 0.999);
}

#[test]
fn a_dominant_segment_creates_an_inner_limit() {
    // One long bone and two short ones: the short pair cannot fold far enough
    // to bring the tip back inside 1.0 - 0.3 = 0.7 of the root.
    let mut joints = [
        Vec3::ZERO,
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.15, 1.0, 0.0),
        Vec3::new(0.30, 1.0, 0.0),
    ];
    let lengths = [1.0, 0.15, 0.15];
    let target = Vec3::new(0.2, 0.1, 0.0);

    let reach = solve_chain(&mut joints, &lengths, target, Effort::default());

    assert_eq!(reach, Reach::Clamped);
    assert!(
        joints[3].distance(joints[0]) >= 0.7 - 1e-3,
        "tip reached inside the inner limit, which is geometrically impossible"
    );
    for (index, length) in lengths.iter().enumerate() {
        assert!((joints[index].distance(joints[index + 1]) - length).abs() < 1e-3);
    }
}

#[test]
fn tightening_the_tolerance_does_not_break_the_chain() {
    let (mut joints, lengths) = arm_chain();
    let root = joints[0];
    let target = Vec3::new(0.30, 1.05, 0.40);

    let reach = solve_chain(
        &mut joints,
        &lengths,
        target,
        Effort {
            iterations: 32,
            tolerance: 1e-5,
        },
    );

    assert_eq!(reach, Reach::Exact);
    assert!(tip_error(&joints, target) < 1e-5);
    assert_intact(&joints, &lengths, root);
}
