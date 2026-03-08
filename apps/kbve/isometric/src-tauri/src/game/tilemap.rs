use bevy::light::{CascadeShadowConfigBuilder, DirectionalLightShadowMap};
use bevy::prelude::*;

use super::terrain::{CHUNK_SIZE, TerrainMap};

pub const TILE_SIZE: f32 = 1.0;
/// Thin cap on top of each column — bright surface that contrasts with darker body.
const CAP_HEIGHT: f32 = 0.06;
/// Per-side inset on the cap where a cliff edge faces a lower neighbor.
const EDGE_INSET: f32 = 0.10;

#[derive(Component)]
pub struct Tile {
    pub x: i32,
    pub z: i32,
    pub height: f32,
}

/// Pre-created materials for all tiles.
/// - `cap`: checkerboard pair for the bright top surface
/// - `body`: darker material for cliff/side faces
#[derive(Resource)]
struct TileMaterials {
    cap: [[Handle<StandardMaterial>; 2]; 4],
    body: [Handle<StandardMaterial>; 4],
}

pub struct TilemapPlugin;

impl Plugin for TilemapPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, (setup_tile_materials, spawn_lighting));
        app.add_systems(Update, process_chunk_spawns_and_despawns);
    }
}

/// Create light/dark material pair with a subtle brightness offset for checkerboard.
fn make_cap_pair(
    materials: &mut Assets<StandardMaterial>,
    r: f32,
    g: f32,
    b: f32,
) -> [Handle<StandardMaterial>; 2] {
    let d = 0.04; // ~4% brightness shift
    [
        materials.add(StandardMaterial {
            base_color: Color::srgb(r + d, g + d, b + d),
            ..default()
        }),
        materials.add(StandardMaterial {
            base_color: Color::srgb(r - d, g - d, b - d),
            ..default()
        }),
    ]
}

/// Create a darker material for the column body (cliff faces).
fn make_body(
    materials: &mut Assets<StandardMaterial>,
    r: f32,
    g: f32,
    b: f32,
) -> Handle<StandardMaterial> {
    let k = 0.55; // 45% darker than the cap
    materials.add(StandardMaterial {
        base_color: Color::srgb(r * k, g * k, b * k),
        ..default()
    })
}

fn setup_tile_materials(mut commands: Commands, mut materials: ResMut<Assets<StandardMaterial>>) {
    // Base colors per height band: grass, dirt, stone, snow
    let bands: [(f32, f32, f32); 4] = [
        (0.3, 0.6, 0.2),
        (0.55, 0.4, 0.25),
        (0.5, 0.5, 0.5),
        (0.9, 0.9, 0.95),
    ];

    commands.insert_resource(TileMaterials {
        cap: [
            make_cap_pair(&mut materials, bands[0].0, bands[0].1, bands[0].2),
            make_cap_pair(&mut materials, bands[1].0, bands[1].1, bands[1].2),
            make_cap_pair(&mut materials, bands[2].0, bands[2].1, bands[2].2),
            make_cap_pair(&mut materials, bands[3].0, bands[3].1, bands[3].2),
        ],
        body: [
            make_body(&mut materials, bands[0].0, bands[0].1, bands[0].2),
            make_body(&mut materials, bands[1].0, bands[1].1, bands[1].2),
            make_body(&mut materials, bands[2].0, bands[2].1, bands[2].2),
            make_body(&mut materials, bands[3].0, bands[3].1, bands[3].2),
        ],
    });
}

fn spawn_lighting(mut commands: Commands) {
    // Ambient light
    commands.insert_resource(GlobalAmbientLight {
        color: Color::WHITE,
        brightness: 200.0,
        ..default()
    });

    // Shadow map resolution
    commands.insert_resource(DirectionalLightShadowMap { size: 4096 });

    // Directional light (sun)
    commands.spawn((
        DirectionalLight {
            illuminance: 6000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(12.0, 15.0, -5.0).looking_at(Vec3::ZERO, Vec3::Y),
        CascadeShadowConfigBuilder {
            num_cascades: 4,
            minimum_distance: 0.1,
            maximum_distance: 80.0,
            ..default()
        }
        .build(),
    ));
}

/// Spawn/despawn tile entities based on terrain chunk updates.
///
/// Each tile is two meshes:
/// - **body**: the tall column (darker material) showing cliff/side faces
/// - **cap**: a thin slab on top (bright checkerboard material) for the walkable surface
///
/// The color difference between cap and body creates a visible edge at elevation changes.
fn process_chunk_spawns_and_despawns(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut terrain: ResMut<TerrainMap>,
    tile_materials: Option<Res<TileMaterials>>,
) {
    let Some(tile_materials) = tile_materials else {
        return;
    };

    // Despawn chunks
    let despawns: Vec<(i32, i32, Vec<Entity>)> = terrain.chunks_to_despawn.drain(..).collect();
    for (_cx, _cz, entities) in despawns {
        for entity in entities {
            commands.entity(entity).despawn();
        }
    }

    // Spawn chunks
    let spawns: Vec<(i32, i32)> = terrain.chunks_to_spawn.drain(..).collect();
    for (cx, cz) in &spawns {
        let mut entities = Vec::new();
        let base_x = cx * CHUNK_SIZE;
        let base_z = cz * CHUNK_SIZE;

        for dx in 0..CHUNK_SIZE {
            for dz in 0..CHUNK_SIZE {
                let tx = base_x + dx;
                let tz = base_z + dz;
                let h = terrain.height_at(tx, tz);

                // Minimum column height so ground-level tiles are still visible
                let column_h = h.max(0.5);

                // Height band index + checkerboard
                let band = match h as i32 {
                    0..=1 => 0,
                    2..=3 => 1,
                    4..=5 => 2,
                    _ => 3,
                };
                let checker = ((tx + tz) & 1) as usize;

                // --- Body (tall column, darker cliff faces) ---
                let body_h = column_h - CAP_HEIGHT;
                let body_mesh = meshes.add(Cuboid::new(TILE_SIZE, body_h, TILE_SIZE));
                let body_entity = commands
                    .spawn((
                        Mesh3d(body_mesh),
                        MeshMaterial3d(tile_materials.body[band].clone()),
                        Transform::from_xyz(
                            tx as f32 * TILE_SIZE,
                            body_h / 2.0,
                            tz as f32 * TILE_SIZE,
                        ),
                    ))
                    .id();
                entities.push(body_entity);

                // --- Cap (thin bright top surface) ---
                // Inset only on the specific edges that face a lower neighbor (cliff edges).
                let inset = |nh: f32| if h - nh >= 1.0 { EDGE_INSET } else { 0.0 };
                let inset_nx = inset(terrain.height_at(tx - 1, tz)); // -X side
                let inset_px = inset(terrain.height_at(tx + 1, tz)); // +X side
                let inset_nz = inset(terrain.height_at(tx, tz - 1)); // -Z side
                let inset_pz = inset(terrain.height_at(tx, tz + 1)); // +Z side

                let cap_w = TILE_SIZE - inset_nx - inset_px;
                let cap_d = TILE_SIZE - inset_nz - inset_pz;
                let cap_offset_x = (inset_nx - inset_px) / 2.0;
                let cap_offset_z = (inset_nz - inset_pz) / 2.0;

                let cap_mesh = meshes.add(Cuboid::new(cap_w, CAP_HEIGHT, cap_d));
                let cap_entity = commands
                    .spawn((
                        Mesh3d(cap_mesh),
                        MeshMaterial3d(tile_materials.cap[band][checker].clone()),
                        Transform::from_xyz(
                            tx as f32 * TILE_SIZE + cap_offset_x,
                            body_h + CAP_HEIGHT / 2.0,
                            tz as f32 * TILE_SIZE + cap_offset_z,
                        ),
                        Tile {
                            x: tx,
                            z: tz,
                            height: h,
                        },
                    ))
                    .id();
                entities.push(cap_entity);
            }
        }

        terrain.link_chunk_entities(*cx, *cz, entities);
    }
}
