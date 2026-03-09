use bevy::asset::RenderAssetUsages;
use bevy::image::ImageSampler;
use bevy::light::{CascadeShadowConfigBuilder, DirectionalLightShadowMap};
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};

use bevy_rapier3d::prelude::*;

use super::grass::GrassTuft;
use super::player::Player;
use super::terrain::{CHUNK_SIZE, TerrainMap, hash2d};

pub const TILE_SIZE: f32 = 1.0;
/// Thin cap on top of each column — bright surface that contrasts with darker body.
const CAP_HEIGHT: f32 = 0.06;
/// Per-side inset on the cap where a cliff edge faces a lower neighbor.
const EDGE_INSET: f32 = 0.10;

// ---------------------------------------------------------------------------
// Vertex color constants (replaces per-tile materials)
// ---------------------------------------------------------------------------

/// Height-band base colors: grass, dirt, stone, snow
const BAND_COLORS: [(f32, f32, f32); 4] = [
    (0.3, 0.6, 0.2),
    (0.55, 0.4, 0.25),
    (0.5, 0.5, 0.5),
    (0.9, 0.9, 0.95),
];

/// Body darkness factor (45% darker than cap).
const BODY_DARKEN: f32 = 0.55;

/// 12 noise-varied grass cap shades.
const GRASS_SHADES: [(f32, f32, f32); 12] = [
    (0.22, 0.50, 0.15),
    (0.28, 0.55, 0.18),
    (0.30, 0.60, 0.20),
    (0.34, 0.62, 0.22),
    (0.38, 0.65, 0.22),
    (0.42, 0.58, 0.20),
    (0.35, 0.52, 0.18),
    (0.45, 0.55, 0.25),
    (0.26, 0.48, 0.16),
    (0.40, 0.60, 0.18),
    (0.32, 0.58, 0.24),
    (0.48, 0.52, 0.22),
];

/// Convert a single sRGB channel to linear (matches Bevy's Color::srgb internal conversion).
fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

fn body_vertex_color(band: usize) -> [f32; 4] {
    let (r, g, b) = BAND_COLORS[band];
    [
        srgb_to_linear(r * BODY_DARKEN),
        srgb_to_linear(g * BODY_DARKEN),
        srgb_to_linear(b * BODY_DARKEN),
        1.0,
    ]
}

fn cap_vertex_color(band: usize, tx: i32, tz: i32) -> [f32; 4] {
    if band == 0 {
        let idx = (hash2d(tx + 1337, tz) * 12.0) as usize % 12;
        let (r, g, b) = GRASS_SHADES[idx];
        [srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0]
    } else {
        let (r, g, b) = BAND_COLORS[band];
        let d: f32 = 0.04;
        let sign = if (tx + tz) & 1 == 0 { 1.0 } else { -1.0 };
        [
            srgb_to_linear(r + d * sign),
            srgb_to_linear(g + d * sign),
            srgb_to_linear(b + d * sign),
            1.0,
        ]
    }
}

// ---------------------------------------------------------------------------
// Combined mesh helpers
// ---------------------------------------------------------------------------

/// Append one axis-aligned cuboid (24 vertices, 36 indices) to shared buffers.
/// `center` and `half` are in chunk-local coordinates.
fn push_cuboid(
    pos: &mut Vec<[f32; 3]>,
    nor: &mut Vec<[f32; 3]>,
    col: &mut Vec<[f32; 4]>,
    idx: &mut Vec<u32>,
    center: Vec3,
    half: Vec3,
    color: [f32; 4],
) {
    let base = pos.len() as u32;
    let (cx, cy, cz) = (center.x, center.y, center.z);
    let (hx, hy, hz) = (half.x, half.y, half.z);

    // +Y (top)
    pos.extend_from_slice(&[
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 1.0, 0.0]; 4]);

    // -Y (bottom)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, -1.0, 0.0]; 4]);

    // +X (right)
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[1.0, 0.0, 0.0]; 4]);

    // -X (left)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[-1.0, 0.0, 0.0]; 4]);

    // +Z (front)
    pos.extend_from_slice(&[
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, 1.0]; 4]);

    // -Z (back)
    pos.extend_from_slice(&[
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
    ]);
    nor.extend_from_slice(&[[0.0, 0.0, -1.0]; 4]);

    // All 24 vertices share the same color
    col.extend(std::iter::repeat(color).take(24));

    // 6 faces × 2 triangles (CCW winding for Bevy front-faces)
    for face in 0..6u32 {
        let f = base + face * 4;
        idx.extend_from_slice(&[f, f + 2, f + 1, f, f + 3, f + 2]);
    }
}

/// Assemble a Bevy Mesh from the combined vertex buffers.
fn build_chunk_mesh(
    positions: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    colors: Vec<[f32; 4]>,
    indices: Vec<u32>,
) -> Mesh {
    let uv_count = positions.len();
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colors)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, vec![[0.0f32, 0.0]; uv_count])
    .with_inserted_indices(Indices::U32(indices))
}

// ---------------------------------------------------------------------------
// Pre-created materials and meshes
// ---------------------------------------------------------------------------

#[derive(Resource)]
struct TileMaterials {
    /// White material — vertex colors provide the actual RGB.
    chunk_body_mat: Handle<StandardMaterial>,
    chunk_cap_mat: Handle<StandardMaterial>,
    // Vegetation (individual entities, still needed)
    grass_tuft_mat: Handle<StandardMaterial>,
    grass_tall_mat: Handle<StandardMaterial>,
    grass_blade_mat: Handle<StandardMaterial>,
    grass_tuft_mesh: Handle<Mesh>,
    grass_tall_mesh: Handle<Mesh>,
    grass_blade_mesh: Handle<Mesh>,
    flower_mats: [Handle<StandardMaterial>; 4],
    flower_mesh: Handle<Mesh>,
    // Trees
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

// ---------------------------------------------------------------------------
// Vegetation mesh builders (unchanged)
// ---------------------------------------------------------------------------

/// Build a crossed-plane mesh (two quads at 90° forming an X shape).
fn make_grass_mesh(hw: f32, h: f32) -> Mesh {
    #[rustfmt::skip]
    let positions: Vec<[f32; 3]> = vec![
        [-hw, 0.0, 0.0], [ hw, 0.0, 0.0], [ hw,  h, 0.0], [-hw,  h, 0.0],
        [0.0, 0.0, -hw], [0.0, 0.0,  hw], [0.0,  h,  hw], [0.0,  h, -hw],
    ];
    #[rustfmt::skip]
    let normals: Vec<[f32; 3]> = vec![
        [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0],
        [1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0],
    ];
    #[rustfmt::skip]
    let uvs: Vec<[f32; 2]> = vec![
        [0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0],
        [0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0],
    ];
    #[rustfmt::skip]
    let indices: Vec<u32> = vec![
        0, 1, 2,  0, 2, 3,
        4, 5, 6,  4, 6, 7,
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

// ---------------------------------------------------------------------------
// Procedural textures (unchanged)
// ---------------------------------------------------------------------------

fn make_bark_texture() -> Image {
    let (w, h) = (8u32, 8u32);
    let base: [u8; 3] = [110, 75, 45];
    let dark: [u8; 3] = [80, 55, 30];
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
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

fn make_leaf_texture(variant: u32) -> Image {
    let (w, h) = (8u32, 8u32);
    let palettes: [[[u8; 3]; 3]; 3] = [
        [[45, 100, 30], [55, 120, 40], [65, 140, 50]],
        [[60, 130, 35], [70, 150, 45], [80, 160, 55]],
        [[75, 120, 30], [85, 130, 40], [95, 110, 35]],
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

fn setup_tile_materials(
    mut commands: Commands,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut images: ResMut<Assets<Image>>,
) {
    // White materials for vertex-colored chunk meshes
    let chunk_body_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        ..default()
    });
    let chunk_cap_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        ..default()
    });

    let make_veg_mat =
        |mats: &mut Assets<StandardMaterial>, r: f32, g: f32, b: f32| -> Handle<StandardMaterial> {
            mats.add(StandardMaterial {
                base_color: Color::srgb(r, g, b),
                cull_mode: None,
                double_sided: true,
                ..default()
            })
        };

    let grass_tuft_mat = make_veg_mat(&mut materials, 0.25, 0.55, 0.15);
    let grass_tall_mat = make_veg_mat(&mut materials, 0.20, 0.50, 0.12);
    let grass_blade_mat = make_veg_mat(&mut materials, 0.22, 0.48, 0.14);

    let flower_mats: [Handle<StandardMaterial>; 4] = [
        make_veg_mat(&mut materials, 0.95, 0.95, 0.90),
        make_veg_mat(&mut materials, 0.90, 0.55, 0.65),
        make_veg_mat(&mut materials, 0.85, 0.35, 0.45),
        make_veg_mat(&mut materials, 0.95, 0.85, 0.30),
    ];

    let grass_tuft_mesh = meshes.add(make_grass_mesh(0.15, 0.25));
    let grass_tall_mesh = meshes.add(make_grass_mesh(0.10, 0.45));
    let grass_blade_mesh = meshes.add(make_blade_mesh(0.08, 0.35));
    let flower_mesh = meshes.add(make_grass_mesh(0.08, 0.12));

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
        chunk_body_mat,
        chunk_cap_mat,
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
    commands.insert_resource(GlobalAmbientLight {
        color: Color::WHITE,
        brightness: 200.0,
        ..default()
    });
    commands.insert_resource(DirectionalLightShadowMap { size: 4096 });
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

// ---------------------------------------------------------------------------
// Chunk spawn / despawn (combined meshes + compound collider)
// ---------------------------------------------------------------------------

fn process_chunk_spawns_and_despawns(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut terrain: ResMut<TerrainMap>,
    tile_materials: Option<Res<TileMaterials>>,
    player_query: Query<&Transform, With<Player>>,
) {
    let Some(tile_materials) = tile_materials else {
        return;
    };

    // Despawn chunks (all at once — despawning is cheap)
    let despawns: Vec<(i32, i32, Vec<Entity>)> = terrain.chunks_to_despawn.drain(..).collect();
    for (_cx, _cz, entities) in despawns {
        for entity in entities {
            commands.entity(entity).despawn();
        }
    }

    // Rate-limiting: always spawn player's chunk + neighbors immediately,
    // rate-limit distant chunks to avoid frame spikes.
    let player_chunk = player_query.single().ok().map(|tf| {
        TerrainMap::tile_to_chunk(
            tf.translation.x.round() as i32,
            tf.translation.z.round() as i32,
        )
    });

    #[cfg(target_arch = "wasm32")]
    const MAX_DISTANT_SPAWNS: usize = 1;
    #[cfg(not(target_arch = "wasm32"))]
    const MAX_DISTANT_SPAWNS: usize = 2;

    let mut near: Vec<(i32, i32)> = Vec::new();
    let mut far: Vec<(i32, i32)> = Vec::new();
    for (cx, cz) in terrain.chunks_to_spawn.drain(..) {
        let is_near = player_chunk
            .map(|(pcx, pcz)| (cx - pcx).abs() <= 1 && (cz - pcz).abs() <= 1)
            .unwrap_or(true);
        if is_near {
            near.push((cx, cz));
        } else {
            far.push((cx, cz));
        }
    }
    far.truncate(MAX_DISTANT_SPAWNS);
    let mut spawns = near;
    spawns.extend(far);

    for (cx, cz) in &spawns {
        let mut entities = Vec::new();
        let base_x = cx * CHUNK_SIZE;
        let base_z = cz * CHUNK_SIZE;

        // ---- Build combined body mesh, cap mesh, and compound collider ----
        let tile_count = (CHUNK_SIZE * CHUNK_SIZE) as usize;
        let mut body_pos = Vec::with_capacity(tile_count * 24);
        let mut body_nor = Vec::with_capacity(tile_count * 24);
        let mut body_col = Vec::with_capacity(tile_count * 24);
        let mut body_idx = Vec::with_capacity(tile_count * 36);

        let mut cap_pos = Vec::with_capacity(tile_count * 24);
        let mut cap_nor = Vec::with_capacity(tile_count * 24);
        let mut cap_col = Vec::with_capacity(tile_count * 24);
        let mut cap_idx = Vec::with_capacity(tile_count * 36);

        let mut collider_shapes: Vec<(Vec3, Quat, Collider)> = Vec::with_capacity(tile_count);

        for dx in 0..CHUNK_SIZE {
            for dz in 0..CHUNK_SIZE {
                let tx = base_x + dx;
                let tz = base_z + dz;
                let h = terrain.height_at(tx, tz);
                let column_h = h.max(0.5);

                let band = match h as i32 {
                    0..=1 => 0,
                    2..=3 => 1,
                    4..=5 => 2,
                    _ => 3,
                };

                // Chunk-local position
                let lx = dx as f32 * TILE_SIZE;
                let lz = dz as f32 * TILE_SIZE;

                // --- Body cuboid ---
                let body_h = column_h - CAP_HEIGHT;
                push_cuboid(
                    &mut body_pos,
                    &mut body_nor,
                    &mut body_col,
                    &mut body_idx,
                    Vec3::new(lx, body_h / 2.0, lz),
                    Vec3::new(TILE_SIZE / 2.0, body_h / 2.0, TILE_SIZE / 2.0),
                    body_vertex_color(band),
                );

                // Collider sub-shape (relative to chunk entity)
                collider_shapes.push((
                    Vec3::new(lx, body_h / 2.0, lz),
                    Quat::IDENTITY,
                    Collider::cuboid(TILE_SIZE / 2.0, body_h / 2.0, TILE_SIZE / 2.0),
                ));

                // --- Cap cuboid (with edge insets) ---
                let inset = |nh: f32| if h - nh >= 1.0 { EDGE_INSET } else { 0.0 };
                let inset_nx = inset(terrain.height_at(tx - 1, tz));
                let inset_px = inset(terrain.height_at(tx + 1, tz));
                let inset_nz = inset(terrain.height_at(tx, tz - 1));
                let inset_pz = inset(terrain.height_at(tx, tz + 1));

                let cap_w = TILE_SIZE - inset_nx - inset_px;
                let cap_d = TILE_SIZE - inset_nz - inset_pz;
                let cap_offset_x = (inset_nx - inset_px) / 2.0;
                let cap_offset_z = (inset_nz - inset_pz) / 2.0;

                push_cuboid(
                    &mut cap_pos,
                    &mut cap_nor,
                    &mut cap_col,
                    &mut cap_idx,
                    Vec3::new(
                        lx + cap_offset_x,
                        body_h + CAP_HEIGHT / 2.0,
                        lz + cap_offset_z,
                    ),
                    Vec3::new(cap_w / 2.0, CAP_HEIGHT / 2.0, cap_d / 2.0),
                    cap_vertex_color(band, tx, tz),
                );
            }
        }

        // Spawn body entity (combined mesh + compound collider)
        let body_mesh = meshes.add(build_chunk_mesh(body_pos, body_nor, body_col, body_idx));
        let body_entity = commands
            .spawn((
                Mesh3d(body_mesh),
                MeshMaterial3d(tile_materials.chunk_body_mat.clone()),
                Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
                RigidBody::Fixed,
                Collider::compound(collider_shapes),
            ))
            .id();
        entities.push(body_entity);

        // Spawn cap entity (combined mesh, no collider)
        let cap_mesh = meshes.add(build_chunk_mesh(cap_pos, cap_nor, cap_col, cap_idx));
        let cap_entity = commands
            .spawn((
                Mesh3d(cap_mesh),
                MeshMaterial3d(tile_materials.chunk_cap_mat.clone()),
                Transform::from_xyz(base_x as f32 * TILE_SIZE, 0.0, base_z as f32 * TILE_SIZE),
            ))
            .id();
        entities.push(cap_entity);

        // ---- Spawn vegetation & trees (individual entities) ----
        for dx in 0..CHUNK_SIZE {
            for dz in 0..CHUNK_SIZE {
                let tx = base_x + dx;
                let tz = base_z + dz;
                let h = terrain.height_at(tx, tz);
                let column_h = h.max(0.5);
                let body_h = column_h - CAP_HEIGHT;

                let band = match h as i32 {
                    0..=1 => 0,
                    2..=3 => 1,
                    4..=5 => 2,
                    _ => 3,
                };

                if band != 0 {
                    continue; // vegetation only in grass band
                }

                // --- Grass pieces ---
                let grass_slots: [(i32, i32, f32, u8); 5] = [
                    (7919, 3571, 0.40, 0),
                    (2131, 8461, 0.18, 1),
                    (4253, 6173, 0.25, 0),
                    (6091, 1429, 0.30, 2),
                    (9371, 2749, 0.08, 3),
                ];

                for (seed_x, seed_z, density, kind) in grass_slots {
                    #[cfg(target_arch = "wasm32")]
                    let density = density * 0.5;

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
                            let fi = (hash2d(tx + seed_x + 400, tz) * 4.0) as usize % 4;
                            (
                                tile_materials.flower_mesh.clone(),
                                tile_materials.flower_mats[fi].clone(),
                                0.15,
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

                // --- Trees ---
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
                            MeshMaterial3d(tile_materials.tree_canopy_mats[leaf_variant].clone()),
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

        terrain.link_chunk_entities(*cx, *cz, entities);
    }
}
