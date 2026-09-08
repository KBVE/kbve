use avian3d::prelude::*;
use bevy::asset::RenderAssetUsages;
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};

pub const TERRAIN_EXTENT: f32 = 256.0;
pub const TERRAIN_RESOLUTION: u32 = 192;
pub const WORLD_SEED: u32 = 0x4b_42_56_45;

pub struct WorldPlugin;

impl Plugin for WorldPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, (spawn_terrain, spawn_sky_light, spawn_landmarks));
    }
}

#[derive(Component)]
pub struct Terrain;

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

fn hash(x: i32, z: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x27d4_eb2d) ^ (z as u32).wrapping_mul(0x1656_67b1) ^ seed;
    h ^= h >> 15;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^= h >> 16;
    (h as f32) / (u32::MAX as f32)
}

fn terrain_mesh() -> Mesh {
    let verts_per_side = TERRAIN_RESOLUTION + 1;
    let step = TERRAIN_EXTENT * 2.0 / TERRAIN_RESOLUTION as f32;
    let mut positions = Vec::with_capacity((verts_per_side * verts_per_side) as usize);
    let mut uvs = Vec::with_capacity(positions.capacity());
    let mut indices = Vec::with_capacity((TERRAIN_RESOLUTION * TERRAIN_RESOLUTION * 6) as usize);

    for row in 0..verts_per_side {
        for col in 0..verts_per_side {
            let x = -TERRAIN_EXTENT + col as f32 * step;
            let z = -TERRAIN_EXTENT + row as f32 * step;
            positions.push([x, height_at(x, z), z]);
            uvs.push([
                col as f32 / TERRAIN_RESOLUTION as f32,
                row as f32 / TERRAIN_RESOLUTION as f32,
            ]);
        }
    }

    for row in 0..TERRAIN_RESOLUTION {
        for col in 0..TERRAIN_RESOLUTION {
            let tl = row * verts_per_side + col;
            let tr = tl + 1;
            let bl = tl + verts_per_side;
            let br = bl + 1;
            indices.extend_from_slice(&[tl, bl, tr, tr, bl, br]);
        }
    }

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    mesh.compute_normals();
    mesh
}

fn spawn_terrain(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let mesh = terrain_mesh();
    let collider =
        Collider::trimesh_from_mesh(&mesh).expect("terrain mesh is an indexed triangle list");
    commands.spawn((
        Terrain,
        Mesh3d(meshes.add(mesh)),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.32, 0.44, 0.24),
            perceptual_roughness: 0.95,
            ..default()
        })),
        Transform::IDENTITY,
        RigidBody::Static,
        collider,
        Friction::new(1.0),
    ));
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
