use bevy::picking::events::{Out, Over, Pointer};
use bevy::prelude::*;

use super::player::Player;

// Re-export EntityEvent so event_target() is available
use bevy::ecs::event::EntityEvent;

/// Axis-aligned bounding box collider (half-extents on X and Z).
#[derive(Component)]
pub struct Collider {
    pub half_x: f32,
    pub half_z: f32,
}

/// Marker for objects that become semi-transparent when occluding the player.
#[derive(Component)]
pub struct Occludable;

/// Stores the original emissive color so we can restore it after hover.
#[derive(Component)]
pub(crate) struct OriginalEmissive(pub(crate) LinearRgba);

/// Marker added when the mouse pointer is hovering over an object.
#[derive(Component)]
struct Hovered;

/// Visual half-extents for the hover outline gizmo.
#[derive(Component)]
pub(crate) struct HoverOutline {
    pub(crate) half_extents: Vec3,
}

#[derive(Component)]
pub struct AnimatedCrystal {
    pub(crate) base_y: f32,
}

#[derive(Component)]
pub struct RotatingBox;

pub struct SceneObjectsPlugin;

impl Plugin for SceneObjectsPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            (
                animate_crystal,
                rotate_boxes,
                update_occlusion,
                update_hover_highlight,
                draw_hover_outline,
            ),
        );
    }
}

pub(crate) fn on_pointer_over(trigger: On<Pointer<Over>>, mut commands: Commands) {
    commands.entity(trigger.event_target()).insert(Hovered);
}

pub(crate) fn on_pointer_out(trigger: On<Pointer<Out>>, mut commands: Commands) {
    commands.entity(trigger.event_target()).remove::<Hovered>();
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

/// Boost emissive glow on hovered objects so the pixelation edge detection
/// naturally creates a stronger outline (selection highlight).
fn update_hover_highlight(
    hovered: Query<
        (&MeshMaterial3d<StandardMaterial>, &OriginalEmissive),
        (With<Hovered>, With<Occludable>),
    >,
    unhovered: Query<
        (&MeshMaterial3d<StandardMaterial>, &OriginalEmissive),
        (Without<Hovered>, With<Occludable>),
    >,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    for (mat_handle, original) in &hovered {
        if let Some(mat) = materials.get_mut(&mat_handle.0) {
            mat.emissive = LinearRgba::new(
                original.0.red + 0.5,
                original.0.green + 0.5,
                original.0.blue + 0.5,
                1.0,
            );
        }
    }
    for (mat_handle, original) in &unhovered {
        if let Some(mat) = materials.get_mut(&mat_handle.0) {
            mat.emissive = original.0;
        }
    }
}

/// Draw a wireframe outline around hovered objects using gizmos.
/// The pixelation shader will pixelate the lines into chunky pixel-art borders.
fn draw_hover_outline(
    mut gizmos: Gizmos,
    query: Query<(&GlobalTransform, &HoverOutline), With<Hovered>>,
) {
    let outline_color = Color::srgba(1.0, 0.85, 0.2, 0.9);
    for (gt, outline) in &query {
        let base = gt.compute_transform();
        let outline_transform = Transform {
            translation: base.translation,
            rotation: base.rotation,
            // Scale to match visual size + 10% margin
            scale: outline.half_extents * 2.2,
        };
        gizmos.cube(outline_transform, outline_color);
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
