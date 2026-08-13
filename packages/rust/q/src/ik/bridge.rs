//! Godot adapter over [`super`].

use godot::prelude::*;

use super::math::{Mat3, Xform};
use super::{Closure, Dof, Goal, Joint, Solver};

fn to_xform(t: Transform3D) -> Xform {
    let b = t.basis;
    Xform {
        basis: Mat3 {
            x: [b.col_a().x, b.col_a().y, b.col_a().z],
            y: [b.col_b().x, b.col_b().y, b.col_b().z],
            z: [b.col_c().x, b.col_c().y, b.col_c().z],
        },
        origin: [t.origin.x, t.origin.y, t.origin.z],
    }
}

fn from_xform(x: Xform) -> Transform3D {
    Transform3D {
        basis: Basis::from_cols(
            Vector3::new(x.basis.x[0], x.basis.x[1], x.basis.x[2]),
            Vector3::new(x.basis.y[0], x.basis.y[1], x.basis.y[2]),
            Vector3::new(x.basis.z[0], x.basis.z[1], x.basis.z[2]),
        ),
        origin: Vector3::new(x.origin[0], x.origin[1], x.origin[2]),
    }
}

/// A joint graph Godot can build, constrain and solve.
#[derive(GodotClass)]
#[class(no_init, base = RefCounted)]
pub struct QIk {
    base: Base<RefCounted>,
    inner: Solver,
}

#[godot_api]
impl QIk {
    #[constant]
    pub const DOF_REVOLUTE: i64 = 0;
    #[constant]
    pub const DOF_PRISMATIC: i64 = 1;

    #[func]
    fn create() -> Gd<Self> {
        Gd::from_init_fn(|base| Self {
            base,
            inner: Solver::default(),
        })
    }

    /// Adds a joint under `parent`, or under the world when `parent` is negative.
    /// Parents must be added before their children.
    #[func]
    fn add_joint(&mut self, parent: i64, rest: Transform3D) -> i64 {
        let parent = if parent < 0 {
            None
        } else {
            Some(parent as usize)
        };
        self.inner.add_joint(Joint::new(parent, to_xform(rest))) as i64
    }

    /// Adds a degree of freedom to `joint` and returns its index on that joint.
    #[func]
    fn add_dof(&mut self, joint: i64, kind: i64, axis: Vector3, min: f32, max: f32) -> i64 {
        let Some(j) = self.inner.joints.get_mut(joint as usize) else {
            godot_error!("QIk.add_dof: no joint {joint}");
            return -1;
        };
        let axis = [axis.x, axis.y, axis.z];
        let mut dof = match kind {
            Self::DOF_PRISMATIC => Dof::prismatic(axis),
            _ => Dof::revolute(axis),
        };
        dof.min = min;
        dof.max = max;
        j.dofs.push(dof);
        (j.dofs.len() - 1) as i64
    }

    #[func]
    fn add_goal(
        &mut self,
        joint: i64,
        local: Transform3D,
        target: Transform3D,
        position_weight: f32,
        rotation_weight: f32,
    ) -> i64 {
        self.inner.goals.push(Goal {
            joint: joint as usize,
            local: to_xform(local),
            target: to_xform(target),
            position_weight,
            rotation_weight,
        });
        (self.inner.goals.len() - 1) as i64
    }

    /// Demands that two frames meet. This is what makes a chain closed.
    #[func]
    fn add_closure(
        &mut self,
        joint_a: i64,
        local_a: Transform3D,
        joint_b: i64,
        local_b: Transform3D,
        position_weight: f32,
        rotation_weight: f32,
    ) -> i64 {
        self.inner.closures.push(Closure {
            position_weight,
            rotation_weight,
            ..Closure::new(
                joint_a as usize,
                to_xform(local_a),
                joint_b as usize,
                to_xform(local_b),
            )
        });
        (self.inner.closures.len() - 1) as i64
    }

    #[func]
    fn set_goal_target(&mut self, goal: i64, target: Transform3D) {
        if let Some(g) = self.inner.goals.get_mut(goal as usize) {
            g.target = to_xform(target);
        }
    }

    #[func]
    fn set_damping(&mut self, damping: f32) {
        self.inner.damping = damping;
    }

    #[func]
    fn set_max_iterations(&mut self, iterations: i64) {
        self.inner.max_iterations = iterations.max(0) as u32;
    }

    #[func]
    fn set_tolerance(&mut self, tolerance: f32) {
        self.inner.tolerance = tolerance;
    }

    /// Solves, returning `iterations`, `error` and `converged`.
    #[func]
    fn solve(&mut self) -> VarDictionary {
        let report = self.inner.solve();
        let mut out = VarDictionary::new();
        out.set("iterations", report.iterations as i64);
        out.set("error", report.error);
        out.set("converged", report.converged);
        out
    }

    /// World transform of a joint after the last solve.
    #[func]
    fn joint_transform(&self, joint: i64) -> Transform3D {
        let world = self.inner.forward();
        match world.get(joint as usize) {
            Some(x) => from_xform(*x),
            None => Transform3D::IDENTITY,
        }
    }

    #[func]
    fn dof_value(&self, joint: i64, dof: i64) -> f32 {
        self.inner
            .joints
            .get(joint as usize)
            .and_then(|j| j.dofs.get(dof as usize))
            .map(|d| d.value)
            .unwrap_or(0.0)
    }

    #[func]
    fn set_dof_value(&mut self, joint: i64, dof: i64, value: f32) {
        if let Some(d) = self
            .inner
            .joints
            .get_mut(joint as usize)
            .and_then(|j| j.dofs.get_mut(dof as usize))
        {
            d.value = value.clamp(d.min, d.max);
        }
    }

    #[func]
    fn joint_count(&self) -> i64 {
        self.inner.joints.len() as i64
    }

    /// Drops goals and closures, keeping the joint graph and its pose.
    #[func]
    fn clear_constraints(&mut self) {
        self.inner.goals.clear();
        self.inner.closures.clear();
    }
}
