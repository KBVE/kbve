use bevy::asset::RenderAssetUsages;
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};

use crate::colony::grid::{ColonyGrid, GridPos, TILE_SIZE, Terrain};

pub struct TerrainPlugin;

impl Plugin for TerrainPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, (generate_grid, spawn_ground).chain());
    }
}

fn generate_grid(mut grid: ResMut<ColonyGrid>) {
    let width = grid.width;
    let depth = grid.depth;

    for pos in grid.positions().collect::<Vec<_>>() {
        let fx = pos.x as f32 / width as f32;
        let fz = pos.z as f32 / depth as f32;
        let ridge = ((fx * 9.0).sin() + (fz * 7.0).cos()) * 0.5;

        let terrain = if fz > 0.86 - (fx * 3.0).sin() * 0.04 {
            Terrain::Water
        } else if ridge > 0.62 {
            Terrain::Stone
        } else if ridge < -0.55 {
            Terrain::Dirt
        } else {
            Terrain::Grass
        };

        grid.set_terrain(pos, terrain);
    }
}

pub fn spawn_ground(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    grid: Res<ColonyGrid>,
) {
    let mesh = meshes.add(ground_mesh(&grid));
    let material = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        perceptual_roughness: 0.95,
        reflectance: 0.02,
        ..default()
    });

    commands.spawn((Name::new("ground"), Mesh3d(mesh), MeshMaterial3d(material)));
}

fn ground_mesh(grid: &ColonyGrid) -> Mesh {
    let tiles = (grid.width * grid.depth) as usize;
    let mut positions = Vec::with_capacity(tiles * 4);
    let mut normals = Vec::with_capacity(tiles * 4);
    let mut colors = Vec::with_capacity(tiles * 4);
    let mut uvs = Vec::with_capacity(tiles * 4);
    let mut indices = Vec::with_capacity(tiles * 6);

    for pos in grid.positions() {
        let base = positions.len() as u32;
        let min = Vec2::new(pos.x as f32, pos.z as f32) * TILE_SIZE;
        let max = min + Vec2::splat(TILE_SIZE);
        let y = tile_height(grid, pos);
        let color = grid.terrain(pos).color().to_linear().to_f32_array();

        positions.extend_from_slice(&[
            [min.x, y, min.y],
            [max.x, y, min.y],
            [max.x, y, max.y],
            [min.x, y, max.y],
        ]);
        normals.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);
        colors.extend_from_slice(&[color; 4]);
        uvs.extend_from_slice(&[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]);
        indices.extend_from_slice(&[base, base + 2, base + 1, base, base + 3, base + 2]);
    }

    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::RENDER_WORLD,
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colors)
    .with_inserted_indices(Indices::U32(indices))
}

pub fn tile_height(grid: &ColonyGrid, pos: GridPos) -> f32 {
    match grid.terrain(pos) {
        Terrain::Water => -0.12,
        Terrain::Stone => 0.18,
        _ => 0.0,
    }
}
