use super::*;

const EPS: f32 = 1e-3;

#[test]
fn identity_chain_lies_along_its_axis() {
    let solver = chain(3, 1.0, [0.0, 0.0, 1.0]);
    let world = solver.forward();
    assert!((world[2].origin[0] - 2.0).abs() < EPS);
    assert!(world[2].origin[1].abs() < EPS);
}

#[test]
fn reaches_a_point_in_range() {
    let mut solver = chain(3, 1.0, [0.0, 0.0, 1.0]);
    solver.goals.push(Goal::position(2, [1.5, 1.2, 0.0]));
    let report = solver.solve();
    assert!(report.converged, "did not converge: {report:?}");
    assert!(goal_distance(&solver, 0) < EPS);
}

#[test]
fn unreachable_goal_stretches_without_diverging() {
    let mut solver = chain(3, 1.0, [0.0, 0.0, 1.0]);
    solver.goals.push(Goal::position(2, [50.0, 0.0, 0.0]));
    let report = solver.solve();
    assert!(!report.converged);
    assert!(report.error.is_finite());
    // Three unit bones reach 2.0 from the root joint's origin.
    assert!(goal_distance(&solver, 0) < 48.1);
}

#[test]
fn respects_joint_limits() {
    let mut solver = Solver::default();
    solver.add_joint(
        Joint::new(None, Xform::IDENTITY)
            .with_dof(Dof::revolute([0.0, 0.0, 1.0]).with_limits(0.0, 0.2)),
    );
    solver.add_joint(
        Joint::new(Some(0), Xform::from_origin([1.0, 0.0, 0.0]))
            .with_dof(Dof::revolute([0.0, 0.0, 1.0]).with_limits(0.0, 0.2)),
    );
    solver.goals.push(Goal::position(1, [0.0, 2.0, 0.0]));
    solver.solve();
    for joint in &solver.joints {
        for dof in &joint.dofs {
            assert!(dof.value >= -EPS && dof.value <= 0.2 + EPS, "{}", dof.value);
        }
    }
}

/// Two arms from a shared root, closed on one prop: the case the analytic
/// two-bone solve cannot express.
#[test]
fn closes_a_two_arm_loop() {
    let mut solver = Solver::default();
    let root = solver.add_joint(Joint::new(None, Xform::IDENTITY));

    let mut left = root;
    for i in 0..3 {
        let rest = if i == 0 {
            Xform::from_origin([-0.4, 0.0, 0.0])
        } else {
            Xform::from_origin([0.0, 0.7, 0.0])
        };
        left = solver.add_joint(
            Joint::new(Some(left), rest)
                .with_dof(Dof::revolute([0.0, 0.0, 1.0]))
                .with_dof(Dof::revolute([1.0, 0.0, 0.0])),
        );
    }

    let mut right = root;
    for i in 0..3 {
        let rest = if i == 0 {
            Xform::from_origin([0.4, 0.0, 0.0])
        } else {
            Xform::from_origin([0.0, 0.7, 0.0])
        };
        right = solver.add_joint(
            Joint::new(Some(right), rest)
                .with_dof(Dof::revolute([0.0, 0.0, 1.0]))
                .with_dof(Dof::revolute([1.0, 0.0, 0.0])),
        );
    }

    // Both hands hold the same prop, half a unit apart along its length. The
    // grip offsets run across the prop, so closing the loop puts the hands
    // beside each other rather than stacking one above the other.
    let grip_left = Xform::from_origin([0.25, 0.0, 0.0]);
    let grip_right = Xform::from_origin([-0.25, 0.0, 0.0]);
    solver.closures.push(Closure {
        rotation_weight: 0.0,
        ..Closure::new(left, grip_left, right, grip_right)
    });
    solver.goals.push(Goal::position(left, [-0.2, 1.3, 0.3]));
    solver.max_iterations = 64;

    let report = solver.solve();
    let world = solver.forward();
    let a = world[left].mul(&grip_left);
    let b = world[right].mul(&grip_right);
    let gap = length(sub(a.origin, b.origin));
    assert!(gap < 1e-2, "loop stayed open: gap {gap}, {report:?}");
    assert!(goal_distance(&solver, 0) < 1e-2);
}

/// A loop that cannot close must settle, not produce NaN and poison the pose.
#[test]
fn impossible_closure_stays_finite() {
    let mut solver = Solver::default();
    let a = solver
        .add_joint(Joint::new(None, Xform::IDENTITY).with_dof(Dof::revolute([0.0, 0.0, 1.0])));
    let b = solver.add_joint(
        Joint::new(None, Xform::from_origin([100.0, 0.0, 0.0]))
            .with_dof(Dof::revolute([0.0, 0.0, 1.0])),
    );
    solver
        .closures
        .push(Closure::new(a, Xform::IDENTITY, b, Xform::IDENTITY));
    let report = solver.solve();
    assert!(!report.converged);
    assert!(report.error.is_finite());
    for joint in &solver.joints {
        for dof in &joint.dofs {
            assert!(dof.value.is_finite(), "dof went to {}", dof.value);
        }
    }
}

#[test]
fn prismatic_dof_slides() {
    let mut solver = Solver::default();
    solver.add_joint(
        Joint::new(None, Xform::IDENTITY)
            .with_dof(Dof::prismatic([1.0, 0.0, 0.0]).with_limits(-5.0, 5.0)),
    );
    solver.goals.push(Goal::position(0, [2.5, 0.0, 0.0]));
    let report = solver.solve();
    assert!(report.converged, "{report:?}");
    assert!((solver.joints[0].dofs[0].value - 2.5).abs() < EPS);
}

#[test]
fn rotation_goal_turns_the_frame() {
    let mut solver = Solver::default();
    solver.add_joint(Joint::new(None, Xform::IDENTITY).with_dof(Dof::revolute([0.0, 0.0, 1.0])));
    let target = Xform {
        basis: Mat3::from_axis_angle([0.0, 0.0, 1.0], 0.8),
        origin: [0.0; 3],
    };
    solver.goals.push(Goal {
        joint: 0,
        local: Xform::IDENTITY,
        target,
        position_weight: 0.0,
        rotation_weight: 1.0,
    });
    let report = solver.solve();
    assert!(report.converged, "{report:?}");
    assert!((solver.joints[0].dofs[0].value - 0.8).abs() < EPS);
}

#[test]
fn rotation_vector_survives_half_turn() {
    let m = Mat3::from_axis_angle([0.0, 1.0, 0.0], std::f32::consts::PI - 1e-4);
    let v = m.to_rotation_vector();
    assert!(
        (length(v) - (std::f32::consts::PI - 1e-4)).abs() < 1e-2,
        "{v:?}"
    );
    assert!(v[1].abs() > 3.0, "axis lost: {v:?}");
}

#[test]
fn solve_is_deterministic() {
    let build = || {
        let mut s = chain(4, 0.8, [0.0, 0.0, 1.0]);
        s.goals.push(Goal::position(3, [1.1, 1.6, 0.0]));
        s
    };
    let mut a = build();
    let mut b = build();
    a.solve();
    b.solve();
    for (ja, jb) in a.joints.iter().zip(b.joints.iter()) {
        for (da, db) in ja.dofs.iter().zip(jb.dofs.iter()) {
            assert_eq!(da.value.to_bits(), db.value.to_bits());
        }
    }
}

#[test]
#[ignore]
fn bench_two_arm_loop() {
    use std::time::Instant;
    let build = || {
        let mut s = Solver::default();
        let root = s.add_joint(Joint::new(None, Xform::IDENTITY));
        let mut ends = Vec::new();
        for side in [-0.4f32, 0.4] {
            let mut cur = root;
            for i in 0..3 {
                let rest = if i == 0 {
                    Xform::from_origin([side, 0.0, 0.0])
                } else {
                    Xform::from_origin([0.0, 0.7, 0.0])
                };
                cur = s.add_joint(
                    Joint::new(Some(cur), rest)
                        .with_dof(Dof::revolute([0.0, 0.0, 1.0]))
                        .with_dof(Dof::revolute([1.0, 0.0, 0.0])),
                );
            }
            ends.push(cur);
        }
        s.closures.push(Closure {
            rotation_weight: 0.0,
            ..Closure::new(
                ends[0],
                Xform::from_origin([0.25, 0.0, 0.0]),
                ends[1],
                Xform::from_origin([-0.25, 0.0, 0.0]),
            )
        });
        s.goals.push(Goal::position(ends[0], [-0.2, 1.3, 0.3]));
        s
    };
    let runs = 1000;
    let start = Instant::now();
    for _ in 0..runs {
        let mut s = build();
        s.solve();
    }
    let each = start.elapsed().as_secs_f64() * 1000.0 / runs as f64;
    println!("two-arm loop: {each:.3} ms per solve (12 dof, 1 goal, 1 closure)");
}
