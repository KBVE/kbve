//! Client-side campfire system — procedural pixel-art fire on billboard quads
//! with warm point lights. Fires are placed at fixed world positions near spawn.

use bevy::asset::RenderAssetUsages;
use bevy::camera::visibility::NoFrustumCulling;
use bevy::light::NotShadowCaster;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::shader::ShaderRef;

use super::camera::IsometricCamera;
use super::terrain::TerrainMap;

// ---------------------------------------------------------------------------
// Fire material
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, ShaderType)]
pub struct FireUniforms {
    pub time: f32,
    pub intensity: f32,
    pub pixel_size: f32,
    /// Shader quality: 0.0 = low (mobile), 1.0 = high (desktop).
    pub quality: f32,
    pub color_core: Vec4,
    pub color_mid: Vec4,
    pub color_outer: Vec4,
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct FireMaterial {
    #[uniform(0)]
    pub uniforms: FireUniforms,
}

impl Material for FireMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/fire.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/// Marker for campfire billboard entities.
#[derive(Component)]
struct Campfire {
    phase: f32,
    /// Base world position (without billboard push-back applied).
    base_pos: Vec3,
}

/// Marker for the point light child of a campfire.
#[derive(Component)]
struct CampfireLight;

// ---------------------------------------------------------------------------
// Campfire positions (client-side, near world origin / spawn)
// ---------------------------------------------------------------------------

/// Fixed campfire spawn positions (world XZ). Y is resolved from terrain.
const CAMPFIRE_POSITIONS: &[(f32, f32)] = &[(3.0, 3.0), (-4.0, 5.0), (6.0, -2.0)];

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

fn setup_campfires(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut fire_materials: ResMut<Assets<FireMaterial>>,
    mut terrain: ResMut<TerrainMap>,
    perf_tier: Res<super::PerfTier>,
) {
    let quality = match *perf_tier {
        super::PerfTier::Low => 0.0,
        super::PerfTier::Medium => 0.5,
        super::PerfTier::High => 1.0,
    };
    let quad = meshes.add(build_fire_quad(1.3, 1.7));

    // Shared unlit material for stone ring + logs (vertex-colored)
    let pit_mat = materials.add(StandardMaterial {
        base_color: Color::WHITE,
        unlit: true,
        ..default()
    });

    for (i, &(wx, wz)) in CAMPFIRE_POSITIONS.iter().enumerate() {
        let ground_y = terrain.height_at_world(wx, wz);
        let phase = wx * 7.31 + wz * 13.17;
        let seed = i as f32 * 31.7;

        let material = fire_materials.add(FireMaterial {
            uniforms: FireUniforms {
                time: 0.0,
                intensity: 1.0,
                pixel_size: if quality < 0.5 { 16.0 } else { 24.0 },
                quality,
                color_core: Vec4::new(1.0, 0.92, 0.55, 1.0),
                color_mid: Vec4::new(1.0, 0.55, 0.0, 1.0),
                color_outer: Vec4::new(0.85, 0.12, 0.0, 1.0),
            },
        });

        // Stone ring (sits on the ground around the fire)
        let stone_mesh = meshes.add(build_stone_ring(0.55, 8, seed));
        commands.spawn((
            Mesh3d(stone_mesh),
            MeshMaterial3d(pit_mat.clone()),
            Transform::from_xyz(wx, ground_y + 0.01, wz),
            Pickable::IGNORE,
        ));

        // Crossed logs inside the ring
        let log_mesh = meshes.add(build_log_cross(0.65, 0.06, seed));
        commands.spawn((
            Mesh3d(log_mesh),
            MeshMaterial3d(pit_mat.clone()),
            Transform::from_xyz(wx, ground_y + 0.02, wz),
            Pickable::IGNORE,
        ));

        // Fire billboard (sits above the logs)
        commands.spawn((
            Mesh3d(quad.clone()),
            MeshMaterial3d(material),
            Transform::from_xyz(wx, ground_y + 0.05, wz),
            NoFrustumCulling,
            NotShadowCaster,
            Campfire {
                phase,
                base_pos: Vec3::new(wx, ground_y + 0.05, wz),
            },
        ));

        // Warm point light — skip on Low tier (PointLights are expensive on mobile)
        if *perf_tier != super::PerfTier::Low {
            commands.spawn((
                PointLight {
                    color: Color::srgb(1.0, 0.62, 0.18),
                    intensity: 120000.0,
                    radius: 1.0,
                    range: 40.0,
                    shadows_enabled: false,
                    ..default()
                },
                Transform::from_xyz(wx, ground_y + 1.4, wz),
                CampfireLight,
            ));
        }
    }
}

/// Billboard campfires toward the camera and update the fire material time uniform.
/// Each campfire gets a phase-offset time so they don't animate in sync.
fn animate_campfires(
    time: Res<Time>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut fire_materials: ResMut<Assets<FireMaterial>>,
    mut campfire_q: Query<
        (&mut Transform, &Campfire, &MeshMaterial3d<FireMaterial>),
        Without<IsometricCamera>,
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let t = time.elapsed_secs();

    // Push the billboard plane backward along the camera's XZ view direction
    // (no Y shift) so it doesn't intersect nearby geometry but stays at the
    // correct height above the pit.
    let cam_fwd = cam_tf.forward().as_vec3();
    let push_back = Vec3::new(-cam_fwd.x, 0.0, -cam_fwd.z).normalize_or_zero() * 0.35;

    for (mut tf, campfire, mat_handle) in &mut campfire_q {
        tf.translation = campfire.base_pos + push_back;
        tf.look_to(cam_tf.forward().as_vec3(), Vec3::Y);

        if let Some(mat) = fire_materials.get_mut(&mat_handle.0) {
            mat.uniforms.time = t + campfire.phase;
        }
    }
}

/// Flicker the campfire point lights — dramatic, visible swings.
fn flicker_lights(time: Res<Time>, mut light_q: Query<&mut PointLight, With<CampfireLight>>) {
    let t = time.elapsed_secs();

    for (i, mut pl) in light_q.iter_mut().enumerate() {
        let phase = i as f32 * 3.71;
        // Deep slow pulse + fast crackle + random-feeling spikes
        let slow = (t * 1.8 + phase).sin() * 0.10;
        let med = (t * 6.0 + phase * 2.3).sin() * 0.12;
        let fast = (t * 14.0 + phase * 0.7).sin() * 0.06;
        let crackle = ((t * 23.0 + phase * 1.3).sin() * (t * 37.0 + phase).cos()).max(0.0) * 0.08;
        let flicker = 0.80 + slow + med + fast + crackle;
        pl.intensity = 120000.0 * flicker;
    }
}

// ---------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------

/// Build a ring of stones (low-poly rock lumps in a circle).
/// Returns vertex-colored mesh at origin — caller positions via Transform.
fn build_stone_ring(ring_radius: f32, stone_count: u32, seed: f32) -> Mesh {
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut colors: Vec<[f32; 4]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let tau = std::f32::consts::TAU;

    for i in 0..stone_count {
        let angle = (i as f32 / stone_count as f32) * tau + ((seed + i as f32 * 7.3).sin() * 0.15); // slight irregularity
        let cx = angle.cos() * ring_radius;
        let cz = angle.sin() * ring_radius;

        // Each stone: squashed box with random size variation
        let s = seed + i as f32 * 13.7;
        let hw = 0.12 + (s * 3.1).sin().abs() * 0.06; // half-width
        let hh = 0.06 + (s * 5.7).sin().abs() * 0.04; // half-height
        let hd = 0.10 + (s * 7.3).sin().abs() * 0.05; // half-depth

        // Rotate stone to face outward from ring center
        let (sa, ca) = angle.sin_cos();

        // Color: gray with slight warm/cool variation per stone
        let bright = 0.30 + (s * 2.1).sin().abs() * 0.15;
        let warm = (s * 4.3).sin() * 0.03;
        // Outer face: normal gray stone
        let col_outer = [
            srgb_to_linear(bright + warm),
            srgb_to_linear(bright),
            srgb_to_linear(bright - warm * 0.5),
            1.0,
        ];
        // Bottom: slightly darker
        let col_bottom = [
            srgb_to_linear((bright - 0.08).max(0.0) + warm),
            srgb_to_linear((bright - 0.08).max(0.0)),
            srgb_to_linear((bright - 0.08 - warm * 0.5).max(0.0)),
            1.0,
        ];
        // Inner face (facing fire): dark soot/tar
        let col_soot = [
            srgb_to_linear(0.08),
            srgb_to_linear(0.06),
            srgb_to_linear(0.05),
            1.0,
        ];

        // 8 vertices of a box, rotated around Y by angle.
        // Local Z-: faces outward (away from ring center)
        // Local Z+: faces inward (toward fire) — gets soot color
        let base = positions.len() as u32;
        let corners: [(f32, f32, f32); 8] = [
            (-hw, 0.0, -hd),      // 0: bottom outer-left
            (hw, 0.0, -hd),       // 1: bottom outer-right
            (hw, 0.0, hd),        // 2: bottom inner-right
            (-hw, 0.0, hd),       // 3: bottom inner-left
            (-hw, hh * 2.0, -hd), // 4: top outer-left
            (hw, hh * 2.0, -hd),  // 5: top outer-right
            (hw, hh * 2.0, hd),   // 6: top inner-right
            (-hw, hh * 2.0, hd),  // 7: top inner-left
        ];
        // Color per vertex: inner verts (z+) get soot, outer (z-) get stone
        let vert_colors: [[f32; 4]; 8] = [
            col_bottom, // 0: bottom outer
            col_bottom, // 1: bottom outer
            col_soot,   // 2: bottom inner
            col_soot,   // 3: bottom inner
            col_outer,  // 4: top outer
            col_outer,  // 5: top outer
            col_soot,   // 6: top inner
            col_soot,   // 7: top inner
        ];
        for (ci, &(lx, ly, lz)) in corners.iter().enumerate() {
            let rx = lx * ca - lz * sa;
            let rz = lx * sa + lz * ca;
            positions.push([cx + rx, ly, cz + rz]);
            normals.push([0.0, 1.0, 0.0]);
            colors.push(vert_colors[ci]);
        }

        // 6 faces × 2 triangles
        let face_idx: [u32; 36] = [
            0, 1, 5, 0, 5, 4, // front
            1, 2, 6, 1, 6, 5, // right
            2, 3, 7, 2, 7, 6, // back
            3, 0, 4, 3, 4, 7, // left
            4, 5, 6, 4, 6, 7, // top
            0, 3, 2, 0, 2, 1, // bottom
        ];
        for &fi in &face_idx {
            indices.push(base + fi);
        }
    }

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

/// Build crossed logs sitting inside the stone ring.
/// Two cylinders (approximated as hexagonal prisms) crossing in an X.
fn build_log_cross(log_length: f32, log_radius: f32, seed: f32) -> Mesh {
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut colors: Vec<[f32; 4]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let tau = std::f32::consts::TAU;
    let segments: u32 = 6;
    let hl = log_length / 2.0;

    // Two logs rotated 90° from each other, slightly tilted
    let log_angles = [0.4f32, 0.4 + std::f32::consts::FRAC_PI_2];
    let log_tilts = [0.08f32, -0.06];

    for (li, &la) in log_angles.iter().enumerate() {
        let (sa, ca) = la.sin_cos();
        let tilt = log_tilts[li];

        // Wood color: brown with per-log variation
        let s = seed + li as f32 * 17.3;
        let bright = 0.28 + (s * 2.7).sin().abs() * 0.08;
        let col_bark = [
            srgb_to_linear(bright * 1.1),
            srgb_to_linear(bright * 0.75),
            srgb_to_linear(bright * 0.45),
            1.0,
        ];
        let col_end = [
            srgb_to_linear(bright * 1.4),
            srgb_to_linear(bright * 1.1),
            srgb_to_linear(bright * 0.7),
            1.0,
        ];

        // Two end caps + barrel
        for end in 0..2i32 {
            let sign = if end == 0 { -1.0f32 } else { 1.0 };
            let lx = sign * hl;
            let ly = log_radius + tilt * sign * hl;

            let base = positions.len() as u32;
            // Center of end cap
            let wcx = lx * ca;
            let wcz = lx * sa;
            positions.push([wcx, ly, wcz]);
            normals.push([sign * ca, 0.0, sign * sa]);
            colors.push(col_end);

            // Ring vertices
            for j in 0..segments {
                let a = (j as f32 / segments as f32) * tau;
                let (sj, cj) = a.sin_cos();
                // Local: perpendicular to log axis
                let py = cj * log_radius;
                let perp = sj * log_radius;
                let wx = lx * ca - perp * sa;
                let wz = lx * sa + perp * ca;
                positions.push([wx, ly + py, wz]);
                normals.push([0.0, cj, sj]);
                colors.push(col_bark);
            }

            // End cap fan
            for j in 0..segments {
                let j_next = (j + 1) % segments;
                if end == 0 {
                    indices.extend_from_slice(&[base, base + 1 + j_next, base + 1 + j]);
                } else {
                    indices.extend_from_slice(&[base, base + 1 + j, base + 1 + j_next]);
                }
            }
        }

        // Barrel: connect the two rings
        let ring0_base = positions.len() as u32 - (segments + 1) * 2;
        let r0 = ring0_base + 1; // first ring verts start after center
        let r1 = ring0_base + (segments + 1) + 1;
        for j in 0..segments {
            let j_next = (j + 1) % segments;
            indices.extend_from_slice(&[
                r0 + j,
                r1 + j,
                r0 + j_next,
                r0 + j_next,
                r1 + j,
                r1 + j_next,
            ]);
        }
    }

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

fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// Build a fire billboard with a curved bottom edge.
///
/// Instead of a flat-bottomed rectangle (which creates a visible horizontal
/// cutoff), the bottom edge is an arc that curves upward at the sides.
/// This lets the shader's ember bed round off naturally without geometry
/// clipping it into a straight line.
///
/// Shape (12 bottom-edge vertices + 2 top corners + 1 top center):
/// ```text
///     TL ──── TC ──── TR        (top: flat, for smoke headroom)
///      |               |
///      |   fire area   |
///      |               |
///     BL0 ── ... ── BLn         (bottom: curved arc, center is lowest)
/// ```
fn build_fire_quad(width: f32, height: f32) -> Mesh {
    let hw = width / 2.0;
    // How far the bottom center dips below the sides
    let bottom_curve = height * 0.18;
    let bottom_segments: u32 = 12;

    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut uvs: Vec<[f32; 2]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    // Bottom edge vertices: arc from left to right
    // Index 0..=bottom_segments
    for i in 0..=bottom_segments {
        let frac = i as f32 / bottom_segments as f32; // 0 at left, 1 at right
        let x = -hw + frac * width;
        // Cosine curve: 0 at edges, dips down at center
        let curve = (frac * std::f32::consts::PI).sin() * bottom_curve;
        let y = -curve; // center dips below y=0
        positions.push([x, y, 0.0]);
        normals.push([0.0, 0.0, 1.0]);
        // UV: bottom row. Center has lowest UV.y (most "bottom" in shader)
        uvs.push([frac, 1.0 + curve / height]);
    }

    // Top-left corner
    let tl = positions.len() as u32;
    positions.push([-hw, height, 0.0]);
    normals.push([0.0, 0.0, 1.0]);
    uvs.push([0.0, 0.0]);

    // Top-right corner
    let tr = positions.len() as u32;
    positions.push([hw, height, 0.0]);
    normals.push([0.0, 0.0, 1.0]);
    uvs.push([1.0, 0.0]);

    // Triangulate: fan from top-left and top-right to bottom arc
    // Left half: TL connects to bottom verts 0..mid
    // Right half: TR connects to bottom verts mid..end
    // Plus a row of quads between TL-TR and the bottom arc
    for i in 0..bottom_segments {
        let b0 = i;
        let b1 = i + 1;
        // Triangle: TL, bottom[i], bottom[i+1] (left-leaning fan)
        // Triangle: TR, bottom[i+1], bottom[i] (right-leaning fan)
        // Better: create a quad strip between top edge and bottom arc
        let top_x0 = -hw + (i as f32 / bottom_segments as f32) * width;
        let top_x1 = -hw + ((i + 1) as f32 / bottom_segments as f32) * width;
        let _ = (top_x0, top_x1); // used implicitly via TL/TR interpolation

        // Simple approach: two triangles per segment connecting to TL or TR
        let mid = bottom_segments / 2;
        if i < mid {
            indices.extend_from_slice(&[tl, b0, b1]);
        } else {
            indices.extend_from_slice(&[tr, b0, b1]);
        }
    }
    // Fill the top area: TL -> TR -> rightmost bottom, TL -> leftmost..mid bottom already covered
    // Connect TL-TR with the middle bottom vertex
    let mid_b = bottom_segments / 2;
    indices.extend_from_slice(&[tl, mid_b, tr]);

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
// Plugin
// ---------------------------------------------------------------------------

pub struct CampfirePlugin;

impl Plugin for CampfirePlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(MaterialPlugin::<FireMaterial>::default());
        app.add_systems(Startup, setup_campfires);
        app.add_systems(
            Update,
            (animate_campfires, flicker_lights).run_if(any_with_component::<Campfire>),
        );
    }
}
