//! Endless terrain: a ring of chunks around the camera, built under a per-frame budget.

use avian3d::prelude::*;
use bevy::asset::RenderAssetUsages;
use bevy::platform::collections::HashMap;
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};

use super::terrain_material::{
    TerrainExtension, TerrainMaterial, TerrainParams, terrain_layer_image,
};
use super::world::{height_at, normal_at};

/// Side length of one chunk in meters.
pub const CHUNK_SIZE: f32 = 64.0;

/// Quads per chunk side at LOD 0.
pub const CHUNK_QUADS: u32 = 32;

/// Chebyshev radius in chunks of the visible ring.
pub const VIEW_CHUNKS: i32 = 6;

/// Chebyshev radius in chunks that gets a collider.
pub const COLLIDER_CHUNKS: i32 = 2;

/// Chunks built per frame outside the initial seed.
pub const CHUNK_BUDGET: usize = 2;

/// How far skirt vertices hang below the chunk edge, hiding LOD cracks.
const SKIRT_DROP: f32 = 8.0;

pub struct TerrainPlugin;

impl Plugin for TerrainPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(MaterialPlugin::<TerrainMaterial>::default())
            .init_resource::<ChunkMap>()
            .add_systems(Startup, seed_terrain)
            .add_systems(Update, stream_chunks);
    }
}

/// Marks a live terrain chunk.
#[derive(Component)]
pub struct TerrainChunk {
    pub lod: u32,
}

/// Shared handles every chunk entity reuses.
#[derive(Resource)]
struct TerrainAssets {
    material: Handle<TerrainMaterial>,
}

/// Which chunk coordinates are currently spawned.
#[derive(Resource, Default)]
struct ChunkMap {
    live: HashMap<IVec2, Entity>,
}

/// World-space center of a chunk.
pub fn chunk_center(coord: IVec2) -> Vec2 {
    coord.as_vec2() * CHUNK_SIZE
}

/// Chunk containing a world-space position.
pub fn chunk_at(position: Vec3) -> IVec2 {
    (Vec2::new(position.x, position.z) / CHUNK_SIZE)
        .round()
        .as_ivec2()
}

/// LOD for a chunk `ring` steps away from the center, halving resolution per step.
fn lod_for_ring(ring: i32) -> u32 {
    match ring {
        0..=1 => 0,
        2..=3 => 1,
        _ => 2,
    }
}

/// Chebyshev distance in chunks.
fn ring_of(coord: IVec2, center: IVec2) -> i32 {
    let delta = (coord - center).abs();
    delta.x.max(delta.y)
}

/// Builds the render mesh for one chunk, in chunk-local XZ with absolute Y.
///
/// Pure in `(coord, lod)`, so it can move to a task pool without touching the caller.
pub fn chunk_mesh(coord: IVec2, lod: u32) -> Mesh {
    let quads = (CHUNK_QUADS >> lod).max(1);
    let step = CHUNK_SIZE / quads as f32;
    let half = CHUNK_SIZE * 0.5;
    let center = chunk_center(coord);
    let side = quads + 3;

    let mut positions = Vec::with_capacity((side * side) as usize);
    let mut normals = Vec::with_capacity((side * side) as usize);
    let mut indices = Vec::with_capacity(((side - 1) * (side - 1) * 6) as usize);

    for row in 0..side {
        for col in 0..side {
            let clamped_col = (col as i32 - 1).clamp(0, quads as i32);
            let clamped_row = (row as i32 - 1).clamp(0, quads as i32);
            let skirt = col == 0 || row == 0 || col == side - 1 || row == side - 1;

            let local_x = -half + clamped_col as f32 * step;
            let local_z = -half + clamped_row as f32 * step;
            let world_x = center.x + local_x;
            let world_z = center.y + local_z;

            let height = height_at(world_x, world_z) - if skirt { SKIRT_DROP } else { 0.0 };
            positions.push([local_x, height, local_z]);
            normals.push(normal_at(world_x, world_z).to_array());
        }
    }

    for row in 0..side - 1 {
        for col in 0..side - 1 {
            let top_left = row * side + col;
            let top_right = top_left + 1;
            let bottom_left = top_left + side;
            let bottom_right = bottom_left + 1;
            indices.extend_from_slice(&[
                top_left,
                bottom_left,
                top_right,
                top_right,
                bottom_left,
                bottom_right,
            ]);
        }
    }

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::RENDER_WORLD,
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_indices(Indices::U32(indices));
    mesh
}

/// Heightfield collider for one chunk, always at full resolution so LOD cannot move the ground.
fn chunk_collider(coord: IVec2) -> Collider {
    let quads = CHUNK_QUADS;
    let step = CHUNK_SIZE / quads as f32;
    let half = CHUNK_SIZE * 0.5;
    let center = chunk_center(coord);

    let heights = (0..=quads)
        .map(|row| {
            (0..=quads)
                .map(|col| {
                    let world_x = center.x + (-half + row as f32 * step);
                    let world_z = center.y + (-half + col as f32 * step);
                    height_at(world_x, world_z)
                })
                .collect()
        })
        .collect();

    Collider::heightfield(heights, Vec3::new(CHUNK_SIZE, 1.0, CHUNK_SIZE))
}

fn spawn_chunk(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    assets: &TerrainAssets,
    coord: IVec2,
    lod: u32,
    ring: i32,
) -> Entity {
    let center = chunk_center(coord);
    let mut chunk = commands.spawn((
        TerrainChunk { lod },
        Mesh3d(meshes.add(chunk_mesh(coord, lod))),
        MeshMaterial3d(assets.material.clone()),
        Transform::from_xyz(center.x, 0.0, center.y),
    ));

    if ring <= COLLIDER_CHUNKS {
        chunk.insert((RigidBody::Static, chunk_collider(coord), Friction::new(1.0)));
    }

    chunk.id()
}

fn seed_terrain(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut images: ResMut<Assets<Image>>,
    mut materials: ResMut<Assets<TerrainMaterial>>,
    mut map: ResMut<ChunkMap>,
) {
    let layers = images.add(terrain_layer_image());
    let assets = TerrainAssets {
        material: materials.add(TerrainMaterial {
            base: StandardMaterial {
                perceptual_roughness: 0.95,
                ..default()
            },
            extension: TerrainExtension {
                params: TerrainParams::default(),
                layers,
            },
        }),
    };

    for row in -COLLIDER_CHUNKS..=COLLIDER_CHUNKS {
        for col in -COLLIDER_CHUNKS..=COLLIDER_CHUNKS {
            let coord = IVec2::new(col, row);
            let ring = ring_of(coord, IVec2::ZERO);
            let entity = spawn_chunk(
                &mut commands,
                &mut meshes,
                &assets,
                coord,
                lod_for_ring(ring),
                ring,
            );
            map.live.insert(coord, entity);
        }
    }

    commands.insert_resource(assets);
}

fn stream_chunks(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut map: ResMut<ChunkMap>,
    assets: Res<TerrainAssets>,
    chunks: Query<&TerrainChunk>,
    camera: Query<&GlobalTransform, With<Camera3d>>,
) {
    let Ok(view) = camera.single() else {
        return;
    };
    let center = chunk_at(view.translation());

    map.live.retain(|coord, entity| {
        if ring_of(*coord, center) <= VIEW_CHUNKS {
            return true;
        }
        commands.entity(*entity).despawn();
        false
    });

    let mut wanted = Vec::new();
    for row in -VIEW_CHUNKS..=VIEW_CHUNKS {
        for col in -VIEW_CHUNKS..=VIEW_CHUNKS {
            let coord = center + IVec2::new(col, row);
            let ring = ring_of(coord, center);
            let lod = lod_for_ring(ring);
            let stale = match map.live.get(&coord) {
                Some(entity) => chunks.get(*entity).is_ok_and(|chunk| chunk.lod != lod),
                None => true,
            };
            if stale {
                wanted.push((ring, coord, lod));
            }
        }
    }

    wanted.sort_unstable_by_key(|(ring, ..)| *ring);

    for (ring, coord, lod) in wanted.into_iter().take(CHUNK_BUDGET) {
        if let Some(previous) = map.live.remove(&coord) {
            commands.entity(previous).despawn();
        }
        let entity = spawn_chunk(&mut commands, &mut meshes, &assets, coord, lod, ring);
        map.live.insert(coord, entity);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn positions(mesh: &Mesh) -> Vec<[f32; 3]> {
        match mesh.attribute(Mesh::ATTRIBUTE_POSITION).unwrap() {
            bevy::render::mesh::VertexAttributeValues::Float32x3(values) => values.clone(),
            other => panic!("terrain positions are Float32x3, got {other:?}"),
        }
    }

    fn column(coord: IVec2, lod: u32, col: u32) -> Vec<Vec3> {
        let quads = (CHUNK_QUADS >> lod).max(1);
        let side = quads + 3;
        let center = chunk_center(coord);
        let values = positions(&chunk_mesh(coord, lod));
        (1..side - 1)
            .map(|row| {
                let vertex = values[(row * side + col) as usize];
                Vec3::new(center.x + vertex[0], vertex[1], center.y + vertex[2])
            })
            .collect()
    }

    #[test]
    fn chunk_center_tiles_without_gaps() {
        assert_eq!(chunk_center(IVec2::ZERO), Vec2::ZERO);
        assert_eq!(chunk_center(IVec2::new(1, 0)).x, CHUNK_SIZE);
        assert_eq!(chunk_at(Vec3::new(CHUNK_SIZE, 0.0, 0.0)), IVec2::new(1, 0));
        assert_eq!(chunk_at(Vec3::ZERO), IVec2::ZERO);
    }

    #[test]
    fn local_to_world_is_lod_independent() {
        let coord = IVec2::new(3, -2);
        let center = chunk_center(coord);
        for lod in 0..3 {
            let quads = (CHUNK_QUADS >> lod).max(1);
            let side = quads + 3;
            let values = positions(&chunk_mesh(coord, lod));
            let corner = values[(side + 1) as usize];
            assert!((center.x + corner[0] - (center.x - CHUNK_SIZE * 0.5)).abs() < 1e-3);
            assert!((center.y + corner[2] - (center.y - CHUNK_SIZE * 0.5)).abs() < 1e-3);
        }
    }

    #[test]
    fn neighboring_chunks_share_their_edge() {
        let side = CHUNK_QUADS + 3;
        let left = column(IVec2::ZERO, 0, side - 2);
        let right = column(IVec2::new(1, 0), 0, 1);
        assert_eq!(left.len(), right.len());
        for (left_vertex, right_vertex) in left.iter().zip(right.iter()) {
            assert!(
                left_vertex.distance(*right_vertex) < 1e-3,
                "{left_vertex:?} vs {right_vertex:?}"
            );
        }
    }

    #[test]
    fn coarser_lod_lands_on_the_finer_edge() {
        let side = CHUNK_QUADS + 3;
        let fine = column(IVec2::ZERO, 0, side - 2);
        let coarse = column(IVec2::new(1, 0), 1, 1);
        for coarse_vertex in coarse {
            assert!(
                fine.iter()
                    .any(|fine_vertex| fine_vertex.distance(coarse_vertex) < 1e-3),
                "{coarse_vertex:?} has no match on the LOD 0 edge"
            );
        }
    }

    #[test]
    fn chunk_heights_match_the_shared_height_field() {
        let coord = IVec2::new(-4, 5);
        let center = chunk_center(coord);
        let quads = CHUNK_QUADS;
        let side = quads + 3;
        let values = positions(&chunk_mesh(coord, 0));
        for step in 1..side - 1 {
            let vertex = values[(step * side + step) as usize];
            let expected = height_at(center.x + vertex[0], center.y + vertex[2]);
            assert!((vertex[1] - expected).abs() < 1e-3);
        }
    }

    #[test]
    fn skirt_hangs_below_the_edge_it_copies() {
        let side = CHUNK_QUADS + 3;
        let values = positions(&chunk_mesh(IVec2::ZERO, 0));
        for col in 1..side - 1 {
            let skirt = values[col as usize];
            let edge = values[(side + col) as usize];
            assert!((skirt[0] - edge[0]).abs() < 1e-4);
            assert!((skirt[1] - (edge[1] - SKIRT_DROP)).abs() < 1e-3);
        }
    }
}
