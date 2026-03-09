use bevy::asset::RenderAssetUsages;
use bevy::image::ImageSampler;
use bevy::light::{CascadeShadowConfigBuilder, DirectionalLightShadowMap};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};

use bevy_rapier3d::prelude::*;

use super::grass::GrassTuft;
use super::terrain::{CHUNK_SIZE, TerrainMap, hash2d};

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

/// Pre-created materials and meshes for all tiles.
#[derive(Resource)]
struct TileMaterials {
    cap: [[Handle<StandardMaterial>; 2]; 4],
    body: [Handle<StandardMaterial>; 4],
    grass_caps: [Handle<StandardMaterial>; 12],
    grass_tuft_mat: Handle<StandardMaterial>,
    grass_tall_mat: Handle<StandardMaterial>,
    grass_blade_mat: Handle<StandardMaterial>,
    grass_tuft_mesh: Handle<Mesh>,
    grass_tall_mesh: Handle<Mesh>,
    grass_blade_mesh: Handle<Mesh>,
    flower_mats: [Handle<StandardMaterial>; 4],
    flower_mesh: Handle<Mesh>,
    tree_trunk_mat: Handle<StandardMaterial>,
    tree_canopy_mats: [Handle<StandardMaterial>; 3],
    tree_trunk_mesh: Handle<Mesh>,
    tree_canopy_mesh: Handle<Mesh>,
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

/// Build a crossed-plane mesh (two quads at 90° forming an X shape).
fn make_grass_mesh(hw: f32, h: f32) -> Mesh {
    // Plane 1: along X axis (vertices at ±hw X, 0..h Y, Z=0)
    // Plane 2: along Z axis (vertices at X=0, 0..h Y, ±hw Z)
    #[rustfmt::skip]
    let positions: Vec<[f32; 3]> = vec![
        // Plane 1
        [-hw, 0.0, 0.0], [ hw, 0.0, 0.0], [ hw,  h, 0.0], [-hw,  h, 0.0],
        // Plane 2
        [0.0, 0.0, -hw], [0.0, 0.0,  hw], [0.0,  h,  hw], [0.0,  h, -hw],
    ];

    #[rustfmt::skip]
    let normals: Vec<[f32; 3]> = vec![
        // Plane 1 normals (face +Z)
        [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0],
        // Plane 2 normals (face +X)
        [1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0],
    ];

    #[rustfmt::skip]
    let uvs: Vec<[f32; 2]> = vec![
        [0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0],
        [0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0],
    ];

    // Double-sided via material cull_mode: None, so we only need front-facing tris
    #[rustfmt::skip]
    let indices: Vec<u32> = vec![
        0, 1, 2,  0, 2, 3, // Plane 1
        4, 5, 6,  4, 6, 7, // Plane 2
    ];

    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_indices(Indices::U32(indices))
}

/// Build a single tapered blade (one quad, narrower at top).
fn make_blade_mesh(hw: f32, h: f32) -> Mesh {
    let taper = 0.6;
    #[rustfmt::skip]
    let positions: Vec<[f32; 3]> = vec![
        [-hw, 0.0, 0.0], [hw, 0.0, 0.0],
        [hw * taper, h, 0.0], [-hw * taper, h, 0.0],
    ];
    #[rustfmt::skip]
    let normals: Vec<[f32; 3]> = vec![
        [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0],
    ];
    #[rustfmt::skip]
    let uvs: Vec<[f32; 2]> = vec![
        [0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0],
    ];
    let indices: Vec<u32> = vec![0, 1, 2, 0, 2, 3];

    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_indices(Indices::U32(indices))
}

/// Generate an 8x8 pixel-art bark texture with vertical grain.
fn make_bark_texture() -> Image {
    let (w, h) = (8u32, 8u32);
    let base: [u8; 3] = [110, 75, 45];
    let dark: [u8; 3] = [80, 55, 30];
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            // Vertical grain: deterministic columns get dark streaks
            let grain = hash2d(x as i32 + 9999, y as i32 + 7777);
            let rgb = if grain < 0.30 { dark } else { base };
            data.extend_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
        }
    }
    let mut img = Image::new(
        Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    img.sampler = ImageSampler::nearest();
    img
}

/// Generate an 8x8 pixel-art leaf canopy texture with dappled shading.
fn make_leaf_texture(variant: u32) -> Image {
    let (w, h) = (8u32, 8u32);
    let palettes: [[[u8; 3]; 3]; 3] = [
        [[45, 100, 30], [55, 120, 40], [65, 140, 50]], // dark forest
        [[60, 130, 35], [70, 150, 45], [80, 160, 55]], // bright meadow
        [[75, 120, 30], [85, 130, 40], [95, 110, 35]], // warm autumn
    ];
    let pal = &palettes[variant as usize % 3];
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            let shade = (hash2d(x as i32 + variant as i32 * 100, y as i32) * 3.0) as usize % 3;
            let rgb = pal[shade];
            data.extend_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
        }
    }
    let mut img = Image::new(
        Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    img.sampler = ImageSampler::nearest();
    img
}

fn setup_tile_materials(
    mut commands: Commands,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut images: ResMut<Assets<Image>>,
) {
    // Base colors per height band: grass, dirt, stone, snow
    let bands: [(f32, f32, f32); 4] = [
        (0.3, 0.6, 0.2),
        (0.55, 0.4, 0.25),
        (0.5, 0.5, 0.5),
        (0.9, 0.9, 0.95),
    ];

    // 12 noise-varied grass shades (dark forest → dry/yellow)
    let grass_shades: [(f32, f32, f32); 12] = [
        (0.22, 0.50, 0.15),
        (0.28, 0.55, 0.18),
        (0.30, 0.60, 0.20),
        (0.34, 0.62, 0.22),
        (0.38, 0.65, 0.22),
        (0.42, 0.58, 0.20),
        (0.35, 0.52, 0.18),
        (0.45, 0.55, 0.25),
        (0.26, 0.48, 0.16), // mossy dark
        (0.40, 0.60, 0.18), // warm meadow
        (0.32, 0.58, 0.24), // lush green
        (0.48, 0.52, 0.22), // dry patch
    ];

    let grass_caps: [Handle<StandardMaterial>; 12] = grass_shades.map(|(r, g, b)| {
        materials.add(StandardMaterial {
            base_color: Color::srgb(r, g, b),
            ..default()
        })
    });

    let make_vegetation_mat =
        |mats: &mut Assets<StandardMaterial>, r: f32, g: f32, b: f32| -> Handle<StandardMaterial> {
            mats.add(StandardMaterial {
                base_color: Color::srgb(r, g, b),
                cull_mode: None,
                double_sided: true,
                ..default()
            })
        };

    let grass_tuft_mat = make_vegetation_mat(&mut materials, 0.25, 0.55, 0.15);
    let grass_tall_mat = make_vegetation_mat(&mut materials, 0.20, 0.50, 0.12);
    let grass_blade_mat = make_vegetation_mat(&mut materials, 0.22, 0.48, 0.14);

    let flower_mats: [Handle<StandardMaterial>; 4] = [
        make_vegetation_mat(&mut materials, 0.95, 0.95, 0.90), // white daisy
        make_vegetation_mat(&mut materials, 0.90, 0.55, 0.65), // pink
        make_vegetation_mat(&mut materials, 0.85, 0.35, 0.45), // rose
        make_vegetation_mat(&mut materials, 0.95, 0.85, 0.30), // yellow
    ];

    let grass_tuft_mesh = meshes.add(make_grass_mesh(0.15, 0.25));
    let grass_tall_mesh = meshes.add(make_grass_mesh(0.10, 0.45));
    let grass_blade_mesh = meshes.add(make_blade_mesh(0.08, 0.35));
    let flower_mesh = meshes.add(make_grass_mesh(0.08, 0.12));

    // Tree materials with procedural pixel-art textures
    let bark_img = images.add(make_bark_texture());
    let tree_trunk_mat = materials.add(StandardMaterial {
        base_color_texture: Some(bark_img),
        ..default()
    });
    let tree_canopy_mats: [Handle<StandardMaterial>; 3] = [0u32, 1, 2].map(|v| {
        let img = images.add(make_leaf_texture(v));
        materials.add(StandardMaterial {
            base_color_texture: Some(img),
            ..default()
        })
    });
    let tree_trunk_mesh = meshes.add(Cuboid::new(0.15, 0.7, 0.15));
    let tree_canopy_mesh = meshes.add(Cuboid::new(0.55, 0.45, 0.55));

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
        grass_caps,
        grass_tuft_mat,
        grass_tall_mat,
        grass_blade_mat,
        grass_tuft_mesh,
        grass_tall_mesh,
        grass_blade_mesh,
        flower_mats,
        flower_mesh,
        tree_trunk_mat,
        tree_canopy_mats,
        tree_trunk_mesh,
        tree_canopy_mesh,
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

                // Height band index
                let band = match h as i32 {
                    0..=1 => 0,
                    2..=3 => 1,
                    4..=5 => 2,
                    _ => 3,
                };

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
                        RigidBody::Fixed,
                        Collider::cuboid(TILE_SIZE / 2.0, body_h / 2.0, TILE_SIZE / 2.0),
                    ))
                    .id();
                entities.push(body_entity);

                // --- Cap (thin bright top surface) ---
                let inset = |nh: f32| if h - nh >= 1.0 { EDGE_INSET } else { 0.0 };
                let inset_nx = inset(terrain.height_at(tx - 1, tz));
                let inset_px = inset(terrain.height_at(tx + 1, tz));
                let inset_nz = inset(terrain.height_at(tx, tz - 1));
                let inset_pz = inset(terrain.height_at(tx, tz + 1));

                let cap_w = TILE_SIZE - inset_nx - inset_px;
                let cap_d = TILE_SIZE - inset_nz - inset_pz;
                let cap_offset_x = (inset_nx - inset_px) / 2.0;
                let cap_offset_z = (inset_nz - inset_pz) / 2.0;

                // Grass band: use noise-varied shade; others: checkerboard
                let cap_material = if band == 0 {
                    let shade_idx = (hash2d(tx + 1337, tz) * 12.0) as usize % 12;
                    tile_materials.grass_caps[shade_idx].clone()
                } else {
                    let checker = ((tx + tz) & 1) as usize;
                    tile_materials.cap[band][checker].clone()
                };

                let cap_mesh = meshes.add(Cuboid::new(cap_w, CAP_HEIGHT, cap_d));
                let cap_entity = commands
                    .spawn((
                        Mesh3d(cap_mesh),
                        MeshMaterial3d(cap_material),
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

                // --- Grass pieces (multiple per tile with variety) ---
                // kind: 0=tuft, 1=tall, 2=blade, 3=flower
                if band == 0 {
                    let grass_slots: [(i32, i32, f32, u8); 5] = [
                        (7919, 3571, 0.40, 0), // short tuft ~40%
                        (2131, 8461, 0.18, 1), // tall grass ~18%
                        (4253, 6173, 0.25, 0), // short tuft ~25%
                        (6091, 1429, 0.30, 2), // blade grass ~30%
                        (9371, 2749, 0.08, 3), // flower ~8%
                    ];

                    for (seed_x, seed_z, density, kind) in grass_slots {
                        let noise = hash2d(tx + seed_x, tz + seed_z);
                        if noise >= density {
                            continue;
                        }

                        let jx = (hash2d(tx + seed_x + 100, tz + seed_z) - 0.5) * 0.85;
                        let jz = (hash2d(tx + seed_x, tz + seed_z + 100) - 0.5) * 0.85;

                        let scale_noise = hash2d(tx + seed_x + 200, tz + seed_z + 200);
                        let scale = 0.7 + scale_noise * 0.7;

                        let wind_phase = noise * std::f32::consts::TAU;
                        let rot_y =
                            hash2d(tx + seed_x + 300, tz + seed_z + 300) * std::f32::consts::TAU;

                        let (mesh, mat, y_offset) = match kind {
                            1 => (
                                tile_materials.grass_tall_mesh.clone(),
                                tile_materials.grass_tall_mat.clone(),
                                0.0,
                            ),
                            2 => (
                                tile_materials.grass_blade_mesh.clone(),
                                tile_materials.grass_blade_mat.clone(),
                                0.0,
                            ),
                            3 => {
                                let flower_idx = (hash2d(tx + seed_x + 400, tz) * 4.0) as usize % 4;
                                (
                                    tile_materials.flower_mesh.clone(),
                                    tile_materials.flower_mats[flower_idx].clone(),
                                    0.15, // raised on a stem
                                )
                            }
                            _ => (
                                tile_materials.grass_tuft_mesh.clone(),
                                tile_materials.grass_tuft_mat.clone(),
                                0.0,
                            ),
                        };

                        let tuft = commands
                            .spawn((
                                Mesh3d(mesh),
                                MeshMaterial3d(mat),
                                Transform::from_xyz(
                                    tx as f32 * TILE_SIZE + jx,
                                    body_h + CAP_HEIGHT + y_offset,
                                    tz as f32 * TILE_SIZE + jz,
                                )
                                .with_rotation(Quat::from_rotation_y(rot_y))
                                .with_scale(Vec3::splat(scale)),
                                GrassTuft {
                                    wind_phase,
                                    flatten: 0.0,
                                },
                            ))
                            .id();
                        entities.push(tuft);
                    }

                    // --- Tree (sparse, pixel-art textured) ---
                    let tree_noise = hash2d(tx + 11317, tz + 5471);
                    if tree_noise < 0.06 {
                        let trunk_h: f32 = 0.7;
                        let canopy_h: f32 = 0.45;
                        let jx = (hash2d(tx + 11417, tz + 5471) - 0.5) * 0.3;
                        let jz = (hash2d(tx + 11317, tz + 5571) - 0.5) * 0.3;
                        let leaf_variant = (hash2d(tx + 11517, tz + 5671) * 3.0) as usize % 3;

                        let trunk = commands
                            .spawn((
                                Mesh3d(tile_materials.tree_trunk_mesh.clone()),
                                MeshMaterial3d(tile_materials.tree_trunk_mat.clone()),
                                Transform::from_xyz(
                                    tx as f32 * TILE_SIZE + jx,
                                    body_h + CAP_HEIGHT + trunk_h / 2.0,
                                    tz as f32 * TILE_SIZE + jz,
                                ),
                                RigidBody::Fixed,
                                Collider::cuboid(0.075, trunk_h / 2.0, 0.075),
                            ))
                            .id();
                        entities.push(trunk);

                        let canopy = commands
                            .spawn((
                                Mesh3d(tile_materials.tree_canopy_mesh.clone()),
                                MeshMaterial3d(
                                    tile_materials.tree_canopy_mats[leaf_variant].clone(),
                                ),
                                Transform::from_xyz(
                                    tx as f32 * TILE_SIZE + jx,
                                    body_h + CAP_HEIGHT + trunk_h + canopy_h / 2.0,
                                    tz as f32 * TILE_SIZE + jz,
                                ),
                            ))
                            .id();
                        entities.push(canopy);
                    }
                }
            }
        }

        terrain.link_chunk_entities(*cx, *cz, entities);
    }
}
