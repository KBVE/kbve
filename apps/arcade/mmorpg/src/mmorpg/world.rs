//! The height field every other system samples, plus the fixed scenery sitting on it.

use avian3d::prelude::*;
use bevy::prelude::*;

use super::terrain::TerrainPlugin;

pub const WORLD_SEED: u32 = 0x4b_42_56_45;

/// Distance in meters between the samples used to differentiate [`height_at`].
const NORMAL_EPSILON: f32 = 0.5;

pub struct WorldPlugin;

impl Plugin for WorldPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(TerrainPlugin)
            .add_systems(Startup, (spawn_sky_light, spawn_landmarks));
    }
}

/// Ground height at a world-space XZ position; the single source of truth for terrain elevation.
pub fn height_at(x: f32, z: f32) -> f32 {
    let mut height = 0.0;
    let mut amplitude = 18.0;
    let mut frequency = 1.0 / 140.0;
    for octave in 0..5 {
        height +=
            value_noise(x * frequency, z * frequency, WORLD_SEED ^ (octave * 0x9e37)) * amplitude;
        amplitude *= 0.48;
        frequency *= 2.07;
    }
    let ridge = 1.0 - (value_noise(x / 320.0, z / 320.0, WORLD_SEED ^ 0x51ed) * 2.0 - 1.0).abs();
    height + ridge * ridge * 26.0 - 12.0
}

/// Ground normal differentiated from [`height_at`], so it is continuous across chunk and LOD seams.
pub fn normal_at(x: f32, z: f32) -> Vec3 {
    let slope_x = height_at(x + NORMAL_EPSILON, z) - height_at(x - NORMAL_EPSILON, z);
    let slope_z = height_at(x, z + NORMAL_EPSILON) - height_at(x, z - NORMAL_EPSILON);
    Vec3::new(-slope_x, 2.0 * NORMAL_EPSILON, -slope_z).normalize()
}

fn value_noise(x: f32, z: f32, seed: u32) -> f32 {
    let xi = x.floor();
    let zi = z.floor();
    let xf = x - xi;
    let zf = z - zi;
    let u = xf * xf * (3.0 - 2.0 * xf);
    let v = zf * zf * (3.0 - 2.0 * zf);
    let c00 = hash(xi as i32, zi as i32, seed);
    let c10 = hash(xi as i32 + 1, zi as i32, seed);
    let c01 = hash(xi as i32, zi as i32 + 1, seed);
    let c11 = hash(xi as i32 + 1, zi as i32 + 1, seed);
    let a = c00 + (c10 - c00) * u;
    let b = c01 + (c11 - c01) * u;
    a + (b - a) * v
}

/// Deterministic unit-range hash of an integer lattice point.
pub fn hash(x: i32, z: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x27d4_eb2d) ^ (z as u32).wrapping_mul(0x1656_67b1) ^ seed;
    h ^= h >> 15;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^= h >> 16;
    (h as f32) / (u32::MAX as f32)
}

fn spawn_sky_light(mut commands: Commands) {
    commands.spawn((
        DirectionalLight {
            illuminance: 12_000.0,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_xyz(60.0, 120.0, 40.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

fn spawn_landmarks(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let pillar = meshes.add(Cuboid::new(4.0, 18.0, 4.0));
    let stone = materials.add(StandardMaterial {
        base_color: Color::srgb(0.58, 0.55, 0.52),
        perceptual_roughness: 0.85,
        ..default()
    });

    for index in 0..12 {
        let angle = index as f32 / 12.0 * std::f32::consts::TAU;
        let x = angle.cos() * 42.0;
        let z = angle.sin() * 42.0;
        commands.spawn((
            Mesh3d(pillar.clone()),
            MeshMaterial3d(stone.clone()),
            Transform::from_xyz(x, height_at(x, z) + 9.0, z),
            RigidBody::Static,
            Collider::cuboid(4.0, 18.0, 4.0),
        ));
    }
}
