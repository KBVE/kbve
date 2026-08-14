//! Closed-chain inverse kinematics: damped least squares over a joint graph.
//!
//! Open-chain limbs are better served by the analytic two-bone solve on the
//! Godot side. This is for the cases that one cannot express: two hands on one
//! prop, or a linkage whose bones form a loop, where the constraint is that two
//! frames meet rather than that one frame lands somewhere.

#[cfg(feature = "client")]
pub mod bridge;
pub mod math;
#[cfg(test)]
mod tests;

use math::{Mat3, Xform, cross, length, normalize, scale, solve_spd, sub};

/// How one degree of freedom moves its joint.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DofKind {
    /// Rotation about the axis.
    Revolute,
    /// Translation along the axis.
    Prismatic,
}

/// One degree of freedom, in its joint's local frame.
#[derive(Clone, Copy, Debug)]
pub struct Dof {
    pub kind: DofKind,
    pub axis: [f32; 3],
    pub value: f32,
    pub min: f32,
    pub max: f32,
}

impl Dof {
    pub fn revolute(axis: [f32; 3]) -> Self {
        Self {
            kind: DofKind::Revolute,
            axis: normalize(axis),
            value: 0.0,
            min: -std::f32::consts::PI,
            max: std::f32::consts::PI,
        }
    }

    pub fn prismatic(axis: [f32; 3]) -> Self {
        Self {
            kind: DofKind::Prismatic,
            axis: normalize(axis),
            value: 0.0,
            min: -1.0,
            max: 1.0,
        }
    }

    pub fn with_limits(mut self, min: f32, max: f32) -> Self {
        self.min = min;
        self.max = max;
        self
    }

    fn local(&self) -> Xform {
        match self.kind {
            DofKind::Revolute => Xform {
                basis: Mat3::from_axis_angle(self.axis, self.value),
                origin: [0.0; 3],
            },
            DofKind::Prismatic => Xform::from_origin(scale(self.axis, self.value)),
        }
    }
}

/// A frame in the graph, positioned by its parent and its own degrees of freedom.
#[derive(Clone, Debug)]
pub struct Joint {
    pub parent: Option<usize>,
    pub rest: Xform,
    pub dofs: Vec<Dof>,
}

impl Joint {
    pub fn new(parent: Option<usize>, rest: Xform) -> Self {
        Self {
            parent,
            rest,
            dofs: Vec::new(),
        }
    }

    pub fn with_dof(mut self, dof: Dof) -> Self {
        self.dofs.push(dof);
        self
    }
}

/// A frame that wants to reach a world target.
#[derive(Clone, Debug)]
pub struct Goal {
    pub joint: usize,
    pub local: Xform,
    pub target: Xform,
    pub position_weight: f32,
    pub rotation_weight: f32,
}

impl Goal {
    pub fn position(joint: usize, target: [f32; 3]) -> Self {
        Self {
            joint,
            local: Xform::IDENTITY,
            target: Xform::from_origin(target),
            position_weight: 1.0,
            rotation_weight: 0.0,
        }
    }
}

/// A demand that two frames on the graph coincide. This is what closes a loop.
#[derive(Clone, Debug)]
pub struct Closure {
    pub joint_a: usize,
    pub local_a: Xform,
    pub joint_b: usize,
    pub local_b: Xform,
    pub position_weight: f32,
    pub rotation_weight: f32,
}

impl Closure {
    pub fn new(joint_a: usize, local_a: Xform, joint_b: usize, local_b: Xform) -> Self {
        Self {
            joint_a,
            local_a,
            joint_b,
            local_b,
            position_weight: 1.0,
            rotation_weight: 1.0,
        }
    }
}

/// What one `solve` did.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Report {
    pub iterations: u32,
    pub error: f32,
    pub converged: bool,
}

/// The joint graph, its constraints, and the damping that keeps them stable.
#[derive(Clone, Debug)]
pub struct Solver {
    pub joints: Vec<Joint>,
    pub goals: Vec<Goal>,
    pub closures: Vec<Closure>,
    /// Levenberg-Marquardt damping. Larger is slower and steadier.
    pub damping: f32,
    pub max_iterations: u32,
    pub tolerance: f32,
    /// Largest change any one degree of freedom may take in a single iteration.
    pub max_step: f32,
}

impl Default for Solver {
    fn default() -> Self {
        Self {
            joints: Vec::new(),
            goals: Vec::new(),
            closures: Vec::new(),
            damping: 0.05,
            max_iterations: 16,
            tolerance: 1e-4,
            max_step: 0.35,
        }
    }
}

impl Solver {
    pub fn add_joint(&mut self, joint: Joint) -> usize {
        self.joints.push(joint);
        self.joints.len() - 1
    }

    /// World transform of every joint, parents before children.
    ///
    /// Joints must be added parent-first, which `add_joint` enforces by handing
    /// out indices in insertion order.
    pub fn forward(&self) -> Vec<Xform> {
        let mut world: Vec<Xform> = Vec::with_capacity(self.joints.len());
        for joint in &self.joints {
            let mut local = joint.rest;
            for dof in &joint.dofs {
                local = local.mul(&dof.local());
            }
            let x = match joint.parent {
                Some(p) => world[p].mul(&local),
                None => local,
            };
            world.push(x);
        }
        world
    }

    fn is_descendant(&self, mut node: usize, ancestor: usize) -> bool {
        loop {
            if node == ancestor {
                return true;
            }
            match self.joints[node].parent {
                Some(p) => node = p,
                None => return false,
            }
        }
    }

    /// Position and rotation derivative of `frame` with respect to one dof.
    fn column(
        &self,
        world: &[Xform],
        joint: usize,
        dof: &Dof,
        frame: &Xform,
        target_joint: usize,
    ) -> ([f32; 3], [f32; 3]) {
        if !self.is_descendant(target_joint, joint) {
            return ([0.0; 3], [0.0; 3]);
        }
        let axis = world[joint].basis.rotate(dof.axis);
        match dof.kind {
            DofKind::Revolute => (cross(axis, sub(frame.origin, world[joint].origin)), axis),
            DofKind::Prismatic => (axis, [0.0; 3]),
        }
    }

    /// Runs damped least squares until the error stops mattering or the
    /// iteration budget runs out.
    pub fn solve(&mut self) -> Report {
        let columns: Vec<(usize, usize)> = self
            .joints
            .iter()
            .enumerate()
            .flat_map(|(j, joint)| (0..joint.dofs.len()).map(move |d| (j, d)))
            .collect();
        let n = columns.len();
        let rows = self.goals.len() * 6 + self.closures.len() * 6;
        if n == 0 || rows == 0 {
            return Report {
                iterations: 0,
                error: 0.0,
                converged: true,
            };
        }

        let mut jacobian = vec![0.0f32; rows * n];
        let mut residual = vec![0.0f32; rows];
        let mut normal = vec![0.0f32; n * n];
        let mut rhs = vec![0.0f32; n];
        let mut error = f32::MAX;

        for iteration in 0..self.max_iterations {
            let world = self.forward();
            jacobian.iter_mut().for_each(|v| *v = 0.0);
            residual.iter_mut().for_each(|v| *v = 0.0);

            let mut row = 0;
            for goal in &self.goals {
                let frame = world[goal.joint].mul(&goal.local);
                let dp = scale(sub(goal.target.origin, frame.origin), goal.position_weight);
                let dr = scale(
                    goal.target
                        .basis
                        .mul(&frame.basis.transpose())
                        .to_rotation_vector(),
                    goal.rotation_weight,
                );
                for k in 0..3 {
                    residual[row + k] = dp[k];
                    residual[row + 3 + k] = dr[k];
                }
                for (c, (j, d)) in columns.iter().enumerate() {
                    let dof = self.joints[*j].dofs[*d];
                    let (p, r) = self.column(&world, *j, &dof, &frame, goal.joint);
                    for k in 0..3 {
                        jacobian[(row + k) * n + c] = p[k] * goal.position_weight;
                        jacobian[(row + 3 + k) * n + c] = r[k] * goal.rotation_weight;
                    }
                }
                row += 6;
            }

            for closure in &self.closures {
                let a = world[closure.joint_a].mul(&closure.local_a);
                let b = world[closure.joint_b].mul(&closure.local_b);
                let dp = scale(sub(b.origin, a.origin), closure.position_weight);
                let dr = scale(
                    b.basis.mul(&a.basis.transpose()).to_rotation_vector(),
                    closure.rotation_weight,
                );
                for k in 0..3 {
                    residual[row + k] = dp[k];
                    residual[row + 3 + k] = dr[k];
                }
                for (c, (j, d)) in columns.iter().enumerate() {
                    let dof = self.joints[*j].dofs[*d];
                    let (pa, ra) = self.column(&world, *j, &dof, &a, closure.joint_a);
                    let (pb, rb) = self.column(&world, *j, &dof, &b, closure.joint_b);
                    for k in 0..3 {
                        jacobian[(row + k) * n + c] = (pa[k] - pb[k]) * closure.position_weight;
                        jacobian[(row + 3 + k) * n + c] = (ra[k] - rb[k]) * closure.rotation_weight;
                    }
                }
                row += 6;
            }

            error = residual.iter().map(|v| v * v).sum::<f32>().sqrt();
            if error < self.tolerance {
                return Report {
                    iterations: iteration,
                    error,
                    converged: true,
                };
            }

            // Normal equations: (J^T J + lambda^2 I) dq = J^T e. Forming J^T J
            // costs rows*n*n but keeps the solve at dof size, which is the small
            // dimension for every rig this is meant for.
            for i in 0..n {
                for j in 0..=i {
                    let mut sum = 0.0;
                    for r in 0..rows {
                        sum += jacobian[r * n + i] * jacobian[r * n + j];
                    }
                    normal[i * n + j] = sum;
                    normal[j * n + i] = sum;
                }
                rhs[i] = (0..rows).map(|r| jacobian[r * n + i] * residual[r]).sum();
            }

            if !solve_spd(&mut normal, &mut rhs, n, self.damping) {
                return Report {
                    iterations: iteration,
                    error,
                    converged: false,
                };
            }

            let longest = rhs.iter().fold(0.0f32, |m, v| m.max(v.abs()));
            let damp = if longest > self.max_step {
                self.max_step / longest
            } else {
                1.0
            };
            for (c, (j, d)) in columns.iter().enumerate() {
                let dof = &mut self.joints[*j].dofs[*d];
                dof.value = (dof.value + rhs[c] * damp).clamp(dof.min, dof.max);
            }
        }

        Report {
            iterations: self.max_iterations,
            error,
            converged: error < self.tolerance,
        }
    }
}

/// Chain of `count` revolute joints about `axis`, each `spacing` along local x.
pub fn chain(count: usize, spacing: f32, axis: [f32; 3]) -> Solver {
    let mut solver = Solver::default();
    for i in 0..count {
        let rest = if i == 0 {
            Xform::IDENTITY
        } else {
            Xform::from_origin([spacing, 0.0, 0.0])
        };
        let parent = if i == 0 { None } else { Some(i - 1) };
        solver.add_joint(Joint::new(parent, rest).with_dof(Dof::revolute(axis)));
    }
    solver
}

/// Distance between a goal's frame and its target, for tests and for callers
/// that want to know whether the pose is worth applying.
pub fn goal_distance(solver: &Solver, index: usize) -> f32 {
    let world = solver.forward();
    let goal = &solver.goals[index];
    let frame = world[goal.joint].mul(&goal.local);
    length(sub(goal.target.origin, frame.origin))
}
