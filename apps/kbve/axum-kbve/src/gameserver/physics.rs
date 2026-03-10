use std::sync::Mutex;

use rapier3d::prelude::*;

/// Server-side physics world using Rapier3D.
/// Wrapped in a Mutex for safe access from the tick loop and WS handlers.
pub struct PhysicsWorld {
    pub state: Mutex<PhysicsState>,
}

pub struct PhysicsState {
    pub gravity: Vector,
    pub integration_parameters: IntegrationParameters,
    pub physics_pipeline: PhysicsPipeline,
    pub island_manager: IslandManager,
    pub broad_phase: DefaultBroadPhase,
    pub narrow_phase: NarrowPhase,
    pub rigid_body_set: RigidBodySet,
    pub collider_set: ColliderSet,
    pub impulse_joint_set: ImpulseJointSet,
    pub multibody_joint_set: MultibodyJointSet,
    pub ccd_solver: CCDSolver,
}

impl PhysicsState {
    /// Step the physics simulation one tick.
    pub fn step(&mut self) {
        let gravity = self.gravity;
        let params = self.integration_parameters;
        self.physics_pipeline.step(
            gravity,
            &params,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            &(),
            &(),
        );
    }
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let gravity: Vector = vector![0.0, -9.81, 0.0].into();
        let mut integration_parameters = IntegrationParameters::default();
        // 20 Hz server tick rate
        integration_parameters.dt = 1.0 / 20.0;

        Self {
            state: Mutex::new(PhysicsState {
                gravity,
                integration_parameters,
                physics_pipeline: PhysicsPipeline::new(),
                island_manager: IslandManager::new(),
                broad_phase: DefaultBroadPhase::new(),
                narrow_phase: NarrowPhase::new(),
                rigid_body_set: RigidBodySet::new(),
                collider_set: ColliderSet::new(),
                impulse_joint_set: ImpulseJointSet::new(),
                multibody_joint_set: MultibodyJointSet::new(),
                ccd_solver: CCDSolver::new(),
            }),
        }
    }

    /// Lock and step the physics world.
    pub fn step(&self) {
        self.state.lock().unwrap().step();
    }
}
