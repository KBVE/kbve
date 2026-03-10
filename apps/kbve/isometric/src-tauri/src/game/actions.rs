use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::shader::ShaderRef;
use bevy_rapier3d::prelude::*;
use std::f32::consts::PI;

use super::scene_objects::{HoverOutline, Interactable, RockKind};

// ── Action dispatch buffer ──────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct ActionRequest {
    pub entity_id: u64,
    pub action: String,
}

#[cfg(not(target_arch = "wasm32"))]
use std::sync::{LazyLock, Mutex};

#[cfg(not(target_arch = "wasm32"))]
static ACTION_BUFFER: LazyLock<Mutex<Vec<ActionRequest>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

#[cfg(target_arch = "wasm32")]
use std::cell::RefCell;

#[cfg(target_arch = "wasm32")]
thread_local! {
    static ACTION_BUFFER_WASM: RefCell<Vec<ActionRequest>> =
        const { RefCell::new(Vec::new()) };
}

pub fn push_action(request: ActionRequest) {
    #[cfg(not(target_arch = "wasm32"))]
    {
        ACTION_BUFFER.lock().unwrap().push(request);
    }
    #[cfg(target_arch = "wasm32")]
    {
        ACTION_BUFFER_WASM.with(|cell| cell.borrow_mut().push(request));
    }
}

fn drain_actions() -> Vec<ActionRequest> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::mem::take(&mut *ACTION_BUFFER.lock().unwrap())
    }
    #[cfg(target_arch = "wasm32")]
    {
        ACTION_BUFFER_WASM.with(|cell| std::mem::take(&mut *cell.borrow_mut()))
    }
}

// ── Camera axes for billboarding ────────────────────────────────────────

const CAMERA_OFFSET: Vec3 = Vec3::new(15.0, 20.0, 15.0);

fn billboard_rotation() -> Quat {
    Transform::from_translation(CAMERA_OFFSET)
        .looking_at(Vec3::ZERO, Vec3::Y)
        .rotation
        .inverse()
}

static BILLBOARD_ROT: std::sync::LazyLock<Quat> = std::sync::LazyLock::new(billboard_rotation);

// ── Smoke material ──────────────────────────────────────────────────────

#[derive(ShaderType, Clone, Copy)]
pub struct SmokeUniforms {
    pub color: Vec4,
    pub progress: f32,
    pub softness: f32,
    pub _pad0: f32,
    pub _pad1: f32,
}

impl Default for SmokeUniforms {
    fn default() -> Self {
        Self {
            color: Vec4::new(0.9, 0.88, 0.85, 0.85),
            progress: 0.0,
            softness: 0.25,
            _pad0: 0.0,
            _pad1: 0.0,
        }
    }
}

#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct SmokeMaterial {
    #[uniform(0)]
    pub uniforms: SmokeUniforms,
}

impl Default for SmokeMaterial {
    fn default() -> Self {
        Self {
            uniforms: SmokeUniforms::default(),
        }
    }
}

impl Material for SmokeMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/smoke.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}

// ── Components ──────────────────────────────────────────────────────────

#[derive(Component)]
struct ChoppingTree {
    timer: Timer,
    fall_axis: Vec3,
    original_rotation: Quat,
    smoke_spawned: bool,
}

#[derive(Component)]
struct MiningRock {
    timer: Timer,
    original_translation: Vec3,
    original_scale: Vec3,
    smoke_spawned: bool,
}

#[derive(Component)]
struct SmokeParticle {
    timer: Timer,
    velocity: Vec3,
    material_handle: Handle<SmokeMaterial>,
}

// ── Plugin ──────────────────────────────────────────────────────────────

pub struct ActionsPlugin;

impl Plugin for ActionsPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(MaterialPlugin::<SmokeMaterial>::default());
        app.add_systems(
            Update,
            (
                process_action_buffer,
                animate_tree_chop,
                animate_rock_mine,
                animate_smoke_particles,
            ),
        );
    }
}

// ── Systems ─────────────────────────────────────────────────────────────

fn process_action_buffer(mut commands: Commands) {
    let actions = drain_actions();
    for req in actions {
        let entity = Entity::from_bits(req.entity_id);

        let Ok(mut ec) = commands.get_entity(entity) else {
            continue;
        };

        match req.action.as_str() {
            "chop_tree" => {
                let angle = (req.entity_id as f32 * 1.618) % (2.0 * PI);
                let fall_axis = Vec3::new(angle.cos(), 0.0, angle.sin()).normalize();

                ec.remove::<RigidBody>();
                ec.remove::<Collider>();
                ec.remove::<Interactable>();
                ec.remove::<HoverOutline>();

                ec.insert(ChoppingTree {
                    timer: Timer::from_seconds(1.0, TimerMode::Once),
                    fall_axis,
                    original_rotation: Quat::IDENTITY,
                    smoke_spawned: false,
                });
            }
            "mine_rock" => {
                ec.remove::<RigidBody>();
                ec.remove::<Collider>();
                ec.remove::<Interactable>();
                ec.remove::<HoverOutline>();
                ec.remove::<RockKind>();

                ec.insert(MiningRock {
                    timer: Timer::from_seconds(1.2, TimerMode::Once),
                    original_translation: Vec3::ZERO, // Set on first tick
                    original_scale: Vec3::ONE,        // Set on first tick
                    smoke_spawned: false,
                });
            }
            _ => {}
        }
    }
}

fn animate_tree_chop(
    mut commands: Commands,
    time: Res<Time>,
    mut query: Query<(Entity, &mut Transform, &mut ChoppingTree)>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut smoke_materials: ResMut<Assets<SmokeMaterial>>,
) {
    for (entity, mut transform, mut chop) in &mut query {
        // Capture original rotation on first frame
        if chop.timer.elapsed_secs() == 0.0 {
            chop.original_rotation = transform.rotation;
        }

        chop.timer.tick(time.delta());
        let t = chop.timer.fraction();

        // Ease-in fall rotation (0° → 90° around the fall axis)
        let fall_angle = t * t * (PI / 2.0);
        transform.rotation =
            Quat::from_axis_angle(chop.fall_axis, fall_angle) * chop.original_rotation;

        // Slight downward drift as it falls
        transform.translation.y -= time.delta_secs() * t * 2.0;

        // Spawn smoke at 60% through the fall
        if t > 0.6 && !chop.smoke_spawned {
            chop.smoke_spawned = true;
            let base_pos = transform.translation;
            spawn_smoke_burst(
                &mut commands,
                &mut meshes,
                &mut smoke_materials,
                base_pos,
                6,
            );
        }

        // Despawn tree after animation completes
        if chop.timer.fraction() >= 1.0 {
            commands.entity(entity).despawn();
        }
    }
}

fn animate_rock_mine(
    mut commands: Commands,
    time: Res<Time>,
    mut query: Query<(Entity, &mut Transform, &mut MiningRock)>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut smoke_materials: ResMut<Assets<SmokeMaterial>>,
) {
    for (entity, mut transform, mut mining) in &mut query {
        // Capture original state on first frame
        if mining.timer.elapsed_secs() == 0.0 {
            mining.original_translation = transform.translation;
            mining.original_scale = transform.scale;
        }

        mining.timer.tick(time.delta());
        let t = mining.timer.fraction();

        // Phase 1 (0–0.6): rapid shake — oscillating offset
        if t < 0.6 {
            let shake_t = t / 0.6;
            let intensity = 0.06 * (1.0 + shake_t * 2.0); // builds up
            let freq = shake_t * 40.0;
            let shake_x = (freq * 1.0).sin() * intensity;
            let shake_z = (freq * 1.3 + 0.5).cos() * intensity;
            transform.translation = mining.original_translation + Vec3::new(shake_x, 0.0, shake_z);
        }

        // Phase 2 (0.5–1.0): crumble — shrink into ground
        if t > 0.5 {
            let crumble_t = ((t - 0.5) / 0.5).min(1.0);
            let ease = crumble_t * crumble_t; // ease-in
            let s = 1.0 - ease * 0.9; // scale down to 10%
            transform.scale = mining.original_scale * s;
            // Sink into ground
            transform.translation.y =
                mining.original_translation.y - ease * mining.original_scale.y * 0.5;
        }

        // Spawn smoke at 50%
        if t > 0.5 && !mining.smoke_spawned {
            mining.smoke_spawned = true;
            spawn_smoke_burst(
                &mut commands,
                &mut meshes,
                &mut smoke_materials,
                mining.original_translation,
                4,
            );
        }

        // Despawn after animation
        if mining.timer.fraction() >= 1.0 {
            commands.entity(entity).despawn();
        }
    }
}

fn spawn_smoke_burst(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    smoke_materials: &mut ResMut<Assets<SmokeMaterial>>,
    center: Vec3,
    count: usize,
) {
    let quad = meshes.add(Rectangle::new(1.0, 1.0));
    let billboard = *BILLBOARD_ROT;

    for i in 0..count {
        let fi = i as f32;
        let angle = fi * (2.0 * PI / count as f32) + fi * 0.7;
        let spread = 0.3 + (fi * 1.3) % 0.5;

        let offset = Vec3::new(angle.cos() * spread, 0.2 + fi * 0.15, angle.sin() * spread);

        let velocity = Vec3::new(
            angle.cos() * 0.4,
            0.8 + (fi * 0.37) % 0.4,
            angle.sin() * 0.4,
        );

        let scale = 0.6 + (fi * 0.43) % 0.5;

        let mat = smoke_materials.add(SmokeMaterial::default());
        let mat_for_component = mat.clone();

        commands.spawn((
            Mesh3d(quad.clone()),
            MeshMaterial3d(mat),
            Transform {
                translation: center + offset,
                rotation: billboard,
                scale: Vec3::splat(scale),
            },
            SmokeParticle {
                timer: Timer::from_seconds(0.9, TimerMode::Once),
                velocity,
                material_handle: mat_for_component,
            },
        ));
    }
}

fn animate_smoke_particles(
    mut commands: Commands,
    time: Res<Time>,
    mut query: Query<(Entity, &mut Transform, &mut SmokeParticle)>,
    mut smoke_materials: ResMut<Assets<SmokeMaterial>>,
) {
    let dt = time.delta_secs();
    for (entity, mut transform, mut particle) in &mut query {
        particle.timer.tick(time.delta());
        let t = particle.timer.fraction();

        // Move outward and upward, decelerating
        let speed = 1.0 - t * 0.7;
        transform.translation += particle.velocity * dt * speed;

        // Scale up then slightly shrink
        let scale_curve = if t < 0.4 {
            0.5 + t * 2.5 // 0.5 → 1.5
        } else {
            1.5 - (t - 0.4) * 0.8 // 1.5 → 1.02
        };
        transform.scale = Vec3::splat(scale_curve);

        // Update material progress for shader fade
        if let Some(mat) = smoke_materials.get_mut(&particle.material_handle) {
            mat.uniforms.progress = t;
        }

        if particle.timer.fraction() >= 1.0 {
            commands.entity(entity).despawn();
        }
    }
}
