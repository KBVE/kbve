use bevy::prelude::*;
use std::f32::consts::PI;

use super::player::Player;

/// Axis-aligned bounding box collider (half-extents on X and Z).
#[derive(Component)]
pub struct Collider {
    pub half_x: f32,
    pub half_z: f32,
}

/// Marker for objects that become semi-transparent when occluding the player.
#[derive(Component)]
pub struct Occludable;

#[derive(Component)]
pub struct AnimatedCrystal {
    base_y: f32,
}

#[derive(Component)]
pub struct RotatingBox;

pub struct SceneObjectsPlugin;

impl Plugin for SceneObjectsPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_scene_objects);
        app.add_systems(Update, (animate_crystal, rotate_boxes, update_occlusion));
    }
}

fn spawn_scene_objects(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Box 1 — checker-style two-tone crate
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(2.0, 2.0, 2.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.8, 0.65, 0.4),
            perceptual_roughness: 0.9,
            ..default()
        })),
        Transform::from_xyz(3.0, 1.0, -2.0).with_rotation(Quat::from_rotation_y(PI / 4.0)),
        RotatingBox,
        Collider {
            half_x: 1.0,
            half_z: 1.0,
        },
        Occludable,
    ));

    // Box 2 — darker crate
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(2.5, 2.5, 2.5))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.55, 0.45, 0.35),
            perceptual_roughness: 0.8,
            ..default()
        })),
        Transform::from_xyz(-3.0, 1.25, -3.0).with_rotation(Quat::from_rotation_y(PI / 6.0)),
        RotatingBox,
        Collider {
            half_x: 1.25,
            half_z: 1.25,
        },
        Occludable,
    ));

    // Crystal — icosphere with emissive glow (floats at y=4, no ground collider)
    let crystal_y = 4.0;
    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(1.0).mesh().ico(2).unwrap())),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.41, 0.72, 0.91),
            emissive: LinearRgba::new(0.31, 0.49, 0.55, 1.0),
            metallic: 0.3,
            perceptual_roughness: 0.2,
            ..default()
        })),
        Transform::from_xyz(0.0, crystal_y, 0.0),
        AnimatedCrystal { base_y: crystal_y },
        Occludable,
    ));

    // Pillar — tall cylinder-like box
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.8, 4.0, 0.8))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.7, 0.7, 0.75),
            metallic: 0.1,
            perceptual_roughness: 0.6,
            ..default()
        })),
        Transform::from_xyz(-5.0, 2.0, 2.0),
        Collider {
            half_x: 0.4,
            half_z: 0.4,
        },
        Occludable,
    ));

    // Metallic sphere
    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(0.8).mesh().ico(3).unwrap())),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.9, 0.85, 0.7),
            metallic: 1.0,
            perceptual_roughness: 0.1,
            ..default()
        })),
        Transform::from_xyz(4.0, 0.8, 3.0),
        Collider {
            half_x: 0.8,
            half_z: 0.8,
        },
        Occludable,
    ));

    // Spot light — amber accent
    commands.spawn((
        SpotLight {
            color: Color::srgb(1.0, 0.76, 0.0),
            intensity: 80000.0,
            range: 30.0,
            outer_angle: PI / 8.0,
            inner_angle: PI / 16.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(6.0, 10.0, 0.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));

    // Point light — soft blue fill
    commands.spawn((
        PointLight {
            color: Color::srgb(0.5, 0.6, 0.9),
            intensity: 40000.0,
            range: 20.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(-4.0, 6.0, 4.0),
    ));
}

fn animate_crystal(time: Res<Time>, mut query: Query<(&mut Transform, &AnimatedCrystal)>) {
    for (mut transform, crystal) in &mut query {
        let t = time.elapsed_secs();
        transform.translation.y = crystal.base_y + (t * 1.5).sin() * 0.5;
        transform.rotate_y(time.delta_secs() * 1.2);
        transform.rotate_x(time.delta_secs() * 0.4);
    }
}

fn rotate_boxes(time: Res<Time>, mut query: Query<&mut Transform, With<RotatingBox>>) {
    for mut transform in &mut query {
        transform.rotate_y(time.delta_secs() * 0.3);
    }
}

/// Make objects semi-transparent when they occlude the player from the camera's view.
fn update_occlusion(
    camera_query: Query<&GlobalTransform, With<Camera3d>>,
    player_query: Query<&GlobalTransform, With<Player>>,
    occludable_query: Query<
        (&GlobalTransform, &MeshMaterial3d<StandardMaterial>),
        With<Occludable>,
    >,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let Ok(cam_gt) = camera_query.single() else {
        return;
    };
    let Ok(player_gt) = player_query.single() else {
        return;
    };

    let cam_pos = cam_gt.translation();
    let player_pos = player_gt.translation();

    // View direction from camera into the scene
    let view_dir = (cam_gt.rotation() * Vec3::NEG_Z).normalize();

    // Player depth along view direction
    let player_depth = (player_pos - cam_pos).dot(view_dir);

    // Player lateral position (perpendicular to view)
    let player_offset = player_pos - cam_pos;
    let player_lateral = player_offset - player_depth * view_dir;

    for (obj_gt, mat_handle) in &occludable_query {
        let obj_pos = obj_gt.translation();
        let obj_depth = (obj_pos - cam_pos).dot(view_dir);

        let obj_offset = obj_pos - cam_pos;
        let obj_lateral = obj_offset - obj_depth * view_dir;

        let lateral_dist = (player_lateral - obj_lateral).length();

        // Object occludes player if it's closer to the camera AND laterally nearby
        let occludes = obj_depth < player_depth && lateral_dist < 2.0;

        if let Some(mat) = materials.get_mut(&mat_handle.0) {
            if occludes {
                mat.base_color = mat.base_color.with_alpha(0.3);
                mat.alpha_mode = AlphaMode::Blend;
            } else {
                mat.base_color = mat.base_color.with_alpha(1.0);
                mat.alpha_mode = AlphaMode::Opaque;
            }
        }
    }
}
