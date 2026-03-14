use avian3d::prelude::*;
use bevy::picking::events::{Out, Over, Pointer};
use bevy::prelude::*;
use bevy::window::PrimaryWindow;
use serde::{Deserialize, Serialize};

use super::camera::IsometricCamera;
use super::player::Player;
use super::tilemap::TileCoord;
use super::virtual_joystick::VirtualJoystickState;

// Desktop: bridged cursor for avian3d raycast hover detection
#[cfg(not(target_arch = "wasm32"))]
use super::input_bridge::BridgedCursorPosition;

// Re-export EntityEvent so event_target() is available
use bevy::ecs::event::EntityEvent;

// Desktop: thread-safe snapshot for selected object
#[cfg(not(target_arch = "wasm32"))]
use std::sync::{LazyLock, Mutex};

// WASM: single-threaded RefCell
#[cfg(target_arch = "wasm32")]
use std::cell::RefCell;

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

// ---------------------------------------------------------------------------
// Generic interactable system
// ---------------------------------------------------------------------------

/// Discriminated union of all clickable object categories.
/// React maps each variant to typed modal content + actions.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InteractableKind {
    Tree,
    Crate,
    Crystal,
    Pillar,
    Sphere,
    Flower,
    Rock,
    Mushroom,
}

/// Sub-type for collectible flowers (composition pattern).
/// Attach alongside `Interactable { kind: Flower }` for flower-specific data.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowerArchetype {
    Tulip,
    Daisy,
    Lavender,
    Bell,
    Wildflower,
    Sunflower,
    Rose,
    Cornflower,
    Allium,
    BlueOrchid,
}

impl FlowerArchetype {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Tulip => "tulip",
            Self::Daisy => "daisy",
            Self::Lavender => "lavender",
            Self::Bell => "bell",
            Self::Wildflower => "wildflower",
            Self::Sunflower => "sunflower",
            Self::Rose => "rose",
            Self::Cornflower => "cornflower",
            Self::Allium => "allium",
            Self::BlueOrchid => "blue_orchid",
        }
    }
}

/// Sub-type for rocks/boulders/ores (composition pattern).
/// Attach alongside `Interactable { kind: Rock }` for rock-specific data.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RockKind {
    Boulder,
    MossyRock,
    OreCopper,
    OreIron,
    OreCrystal,
}

impl RockKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Boulder => "boulder",
            Self::MossyRock => "mossy_rock",
            Self::OreCopper => "ore_copper",
            Self::OreIron => "ore_iron",
            Self::OreCrystal => "ore_crystal",
        }
    }
}

/// Sub-type for forageable mushrooms (composition pattern).
/// Attach alongside `Interactable { kind: Mushroom }` for mushroom-specific data.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MushroomKind {
    Porcini,
    Chanterelle,
    FlyAgaric,
}

impl MushroomKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Porcini => "porcini",
            Self::Chanterelle => "chanterelle",
            Self::FlyAgaric => "fly_agaric",
        }
    }
}

/// Marker: this entity can be clicked to open an interaction modal.
/// Attach to any entity that also has `HoverOutline`.
#[derive(Component)]
pub struct Interactable {
    pub kind: InteractableKind,
}

/// Fired when the player clicks a collectible object (tree, rock, flower, mushroom).
/// The networking layer picks this up and sends a CollectRequest to the server.
#[derive(Event)]
pub struct CollectEvent {
    pub tx: i32,
    pub tz: i32,
    pub kind: InteractableKind,
}

/// Snapshot written on click, read (and cleared) by React polling.
#[derive(Clone, Serialize, Deserialize)]
pub struct SelectedObject {
    pub kind: InteractableKind,
    pub position: [f32; 3],
    pub entity_id: u64,
    /// Optional sub-type detail (e.g. flower archetype name).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_kind: Option<String>,
}

/// Snapshot of the currently hovered interactable (overwritten each frame).
#[derive(Clone, Serialize, Deserialize)]
pub struct HoveredObject {
    pub kind: InteractableKind,
    pub position: [f32; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_kind: Option<String>,
}

#[cfg(not(target_arch = "wasm32"))]
pub static SELECTED_OBJECT_SNAPSHOT: LazyLock<Mutex<Option<SelectedObject>>> =
    LazyLock::new(|| Mutex::new(None));

#[cfg(not(target_arch = "wasm32"))]
pub static HOVERED_OBJECT_SNAPSHOT: LazyLock<Mutex<Option<HoveredObject>>> =
    LazyLock::new(|| Mutex::new(None));

#[cfg(target_arch = "wasm32")]
thread_local! {
    pub static SELECTED_OBJECT_SNAPSHOT_WASM: RefCell<Option<SelectedObject>> =
        const { RefCell::new(None) };
    pub static HOVERED_OBJECT_SNAPSHOT_WASM: RefCell<Option<HoveredObject>> =
        const { RefCell::new(None) };
}

/// Read and clear the selected object snapshot (take semantics).
pub fn get_selected_snapshot() -> Option<SelectedObject> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        SELECTED_OBJECT_SNAPSHOT.lock().unwrap().take()
    }
    #[cfg(target_arch = "wasm32")]
    {
        SELECTED_OBJECT_SNAPSHOT_WASM.with(|cell| cell.borrow_mut().take())
    }
}

/// Read the hovered object snapshot (peek — does not clear).
pub fn get_hovered_snapshot() -> Option<HoveredObject> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        HOVERED_OBJECT_SNAPSHOT.lock().unwrap().clone()
    }
    #[cfg(target_arch = "wasm32")]
    {
        HOVERED_OBJECT_SNAPSHOT_WASM.with(|cell| cell.borrow().clone())
    }
}

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
                update_hovered_snapshot,
                detect_click_selection,
            ),
        );

        // Avian raycast hover — MeshPickingPlugin can't work with offscreen render target
        #[cfg(not(target_arch = "wasm32"))]
        app.add_systems(Update, raycast_hover_detection_desktop);
        #[cfg(target_arch = "wasm32")]
        app.add_systems(Update, raycast_hover_detection_wasm);
    }
}

/// Pointer-event observer: add Hovered on pointer over (used by WASM + MeshPickingPlugin).
pub(crate) fn on_pointer_over(trigger: On<Pointer<Over>>, mut commands: Commands) {
    commands.entity(trigger.event_target()).insert(Hovered);
}

/// Pointer-event observer: remove Hovered on pointer out (used by WASM + MeshPickingPlugin).
pub(crate) fn on_pointer_out(trigger: On<Pointer<Out>>, mut commands: Commands) {
    commands.entity(trigger.event_target()).remove::<Hovered>();
}

/// Custom hover detection using avian3d raycasting through the scene camera.
/// Scene camera renders to offscreen texture, so MeshPickingPlugin can't map cursor.
#[cfg(not(target_arch = "wasm32"))]
fn raycast_hover_detection_desktop(
    windows: Query<&Window, With<PrimaryWindow>>,
    cursor: Res<BridgedCursorPosition>,
    camera_query: Query<(&GlobalTransform, &Projection), With<IsometricCamera>>,
    spatial_query: SpatialQuery,
    hoverable: Query<(), With<HoverOutline>>,
    current_hovered: Query<Entity, With<Hovered>>,
    player_query: Query<Entity, With<Player>>,
    mut commands: Commands,
) {
    let Ok(window) = windows.single() else { return };
    let Ok((cam_gt, projection)) = camera_query.single() else {
        return;
    };

    // Remove hover if cursor is outside window
    let Some(cursor_pos) = cursor.position else {
        for entity in &current_hovered {
            commands.entity(entity).remove::<Hovered>();
        }
        return;
    };

    // Extract orthographic half-extents from the scene camera's projection
    let Projection::Orthographic(ortho) = projection else {
        return;
    };
    let viewport_height = match ortho.scaling_mode {
        bevy::camera::ScalingMode::FixedVertical { viewport_height } => viewport_height,
        _ => return,
    };
    let half_h = (viewport_height / 2.0) * ortho.scale;
    let aspect = window.width() / window.height();
    let half_w = half_h * aspect;

    // Cursor to NDC
    let ndc_x = (cursor_pos.x / window.width()) * 2.0 - 1.0;
    let ndc_y = 1.0 - (cursor_pos.y / window.height()) * 2.0;

    // Compute orthographic ray from scene camera
    let cam_tf = cam_gt.compute_transform();
    let right = cam_tf.right().as_vec3();
    let up = cam_tf.up().as_vec3();
    let forward = cam_tf.forward().as_vec3();

    let ray_origin = cam_tf.translation + right * (ndc_x * half_w) + up * (ndc_y * half_h);
    let ray_dir = forward;

    // Build filter excluding the player
    let filter = if let Ok(player_entity) = player_query.single() {
        SpatialQueryFilter::default().with_excluded_entities([player_entity])
    } else {
        SpatialQueryFilter::default()
    };

    // Cast ray and check if hit entity has HoverOutline
    let new_hovered = Dir3::new(ray_dir)
        .ok()
        .and_then(|dir| spatial_query.cast_ray(ray_origin, dir, 1000.0, true, &filter))
        .and_then(|hit| {
            if hoverable.get(hit.entity).is_ok() {
                Some(hit.entity)
            } else {
                None
            }
        });

    // Update Hovered components
    for entity in &current_hovered {
        if Some(entity) != new_hovered {
            commands.entity(entity).remove::<Hovered>();
        }
    }
    if let Some(entity) = new_hovered {
        if current_hovered.get(entity).is_err() {
            commands.entity(entity).insert(Hovered);
        }
    }
}

/// WASM hover detection: same avian3d raycast approach but reads cursor from the Window.
#[cfg(target_arch = "wasm32")]
fn raycast_hover_detection_wasm(
    windows: Query<&Window, With<PrimaryWindow>>,
    camera_query: Query<(&GlobalTransform, &Projection), With<IsometricCamera>>,
    spatial_query: SpatialQuery,
    hoverable: Query<(), With<HoverOutline>>,
    current_hovered: Query<Entity, With<Hovered>>,
    player_query: Query<Entity, With<Player>>,
    joystick: Res<VirtualJoystickState>,
    mut commands: Commands,
) {
    let Ok(window) = windows.single() else { return };
    let Ok((cam_gt, projection)) = camera_query.single() else {
        return;
    };

    // Skip raycasting when the pointer is captured by the joystick UI.
    if joystick.pointer_captured {
        for entity in &current_hovered {
            commands.entity(entity).remove::<Hovered>();
        }
        return;
    }

    let Some(cursor_pos) = window.cursor_position() else {
        for entity in &current_hovered {
            commands.entity(entity).remove::<Hovered>();
        }
        return;
    };

    let Projection::Orthographic(ortho) = projection else {
        return;
    };
    let viewport_height = match ortho.scaling_mode {
        bevy::camera::ScalingMode::FixedVertical { viewport_height } => viewport_height,
        _ => return,
    };
    let half_h = (viewport_height / 2.0) * ortho.scale;
    let aspect = window.width() / window.height();
    let half_w = half_h * aspect;

    let ndc_x = (cursor_pos.x / window.width()) * 2.0 - 1.0;
    let ndc_y = 1.0 - (cursor_pos.y / window.height()) * 2.0;

    let cam_tf = cam_gt.compute_transform();
    let right = cam_tf.right().as_vec3();
    let up = cam_tf.up().as_vec3();
    let forward = cam_tf.forward().as_vec3();

    let ray_origin = cam_tf.translation + right * (ndc_x * half_w) + up * (ndc_y * half_h);
    let ray_dir = forward;

    let filter = if let Ok(player_entity) = player_query.single() {
        SpatialQueryFilter::default().with_excluded_entities([player_entity])
    } else {
        SpatialQueryFilter::default()
    };

    let new_hovered = Dir3::new(ray_dir)
        .ok()
        .and_then(|dir| spatial_query.cast_ray(ray_origin, dir, 1000.0, true, &filter))
        .and_then(|hit| {
            if hoverable.get(hit.entity).is_ok() {
                Some(hit.entity)
            } else {
                None
            }
        });

    for entity in &current_hovered {
        if Some(entity) != new_hovered {
            commands.entity(entity).remove::<Hovered>();
        }
    }
    if let Some(entity) = new_hovered {
        if current_hovered.get(entity).is_err() {
            commands.entity(entity).insert(Hovered);
        }
    }
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

/// Boost emissive glow on hovered objects (only affects Occludable entities —
/// object_registry objects have unique materials, so this is safe).
/// Only calls get_mut when the value actually changes to avoid triggering
/// Bevy change detection / GPU re-uploads every frame.
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
        let target = LinearRgba::new(
            original.0.red + 0.5,
            original.0.green + 0.5,
            original.0.blue + 0.5,
            1.0,
        );
        if let Some(mat) = materials.get(&mat_handle.0) {
            if mat.emissive != target {
                if let Some(mat) = materials.get_mut(&mat_handle.0) {
                    mat.emissive = target;
                }
            }
        }
    }
    for (mat_handle, original) in &unhovered {
        if let Some(mat) = materials.get(&mat_handle.0) {
            if mat.emissive != original.0 {
                if let Some(mat) = materials.get_mut(&mat_handle.0) {
                    mat.emissive = original.0;
                }
            }
        }
    }
}

/// Each frame, write the hovered interactable (if any) to the snapshot for React labels.
fn update_hovered_snapshot(
    hovered_query: Query<
        (
            &GlobalTransform,
            &Interactable,
            Option<&FlowerArchetype>,
            Option<&RockKind>,
            Option<&MushroomKind>,
        ),
        With<Hovered>,
    >,
) {
    let snapshot = hovered_query
        .iter()
        .next()
        .map(|(gt, interactable, flower, rock, mushroom)| {
            let pos = gt.translation();
            let sub_kind = flower
                .map(|f| f.as_str().to_owned())
                .or_else(|| rock.map(|r| r.as_str().to_owned()))
                .or_else(|| mushroom.map(|m| m.as_str().to_owned()));
            HoveredObject {
                kind: interactable.kind,
                position: [pos.x, pos.y, pos.z],
                sub_kind,
            }
        });

    #[cfg(not(target_arch = "wasm32"))]
    {
        *HOVERED_OBJECT_SNAPSHOT.lock().unwrap() = snapshot;
    }
    #[cfg(target_arch = "wasm32")]
    {
        HOVERED_OBJECT_SNAPSHOT_WASM.with(|cell| {
            *cell.borrow_mut() = snapshot;
        });
    }
}

/// On left-click, if a hovered entity has Interactable, write its data to the snapshot.
/// React polls this snapshot to open a modal with object-specific content.
fn detect_click_selection(
    mut commands: Commands,
    mouse: Res<ButtonInput<MouseButton>>,
    hovered_query: Query<
        (
            Entity,
            &GlobalTransform,
            &Interactable,
            Option<&FlowerArchetype>,
            Option<&RockKind>,
            Option<&MushroomKind>,
            Option<&TileCoord>,
        ),
        With<Hovered>,
    >,
) {
    if !mouse.just_pressed(MouseButton::Left) {
        return;
    }

    let Some((entity, gt, interactable, flower, rock, mushroom, tile_coord)) =
        hovered_query.iter().next()
    else {
        return;
    };

    let pos = gt.translation();
    let sub_kind = flower
        .map(|f| f.as_str().to_owned())
        .or_else(|| rock.map(|r| r.as_str().to_owned()))
        .or_else(|| mushroom.map(|m| m.as_str().to_owned()));
    let snapshot = SelectedObject {
        kind: interactable.kind,
        position: [pos.x, pos.y, pos.z],
        entity_id: entity.to_bits(),
        sub_kind,
    };

    #[cfg(not(target_arch = "wasm32"))]
    {
        *SELECTED_OBJECT_SNAPSHOT.lock().unwrap() = Some(snapshot);
    }
    #[cfg(target_arch = "wasm32")]
    {
        SELECTED_OBJECT_SNAPSHOT_WASM.with(|cell| {
            *cell.borrow_mut() = Some(snapshot);
        });
    }

    // CollectEvent is NOT triggered here — the player must press the action
    // button (Chop / Mine / Collect) in the UI modal. That triggers it via
    // process_action_buffer in actions.rs, which sends CollectRequest to server.
}

/// Make Occludable objects semi-transparent when they block the player from the camera.
/// Only object_registry objects have Occludable (each with unique materials), so this is safe.
fn update_occlusion(
    camera_query: Query<&GlobalTransform, With<IsometricCamera>>,
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

    let view_dir = (cam_gt.rotation() * Vec3::NEG_Z).normalize();
    let player_depth = (player_pos - cam_pos).dot(view_dir);
    let player_offset = player_pos - cam_pos;
    let player_lateral = player_offset - player_depth * view_dir;

    for (obj_gt, mat_handle) in &occludable_query {
        let obj_pos = obj_gt.translation();
        let obj_depth = (obj_pos - cam_pos).dot(view_dir);
        let obj_offset = obj_pos - cam_pos;
        let obj_lateral = obj_offset - obj_depth * view_dir;
        let lateral_dist = (player_lateral - obj_lateral).length();

        let occludes = obj_depth < player_depth && lateral_dist < 2.0;

        if let Some(mat) = materials.get(&mat_handle.0) {
            let needs_blend = occludes && mat.alpha_mode != AlphaMode::Blend;
            let needs_opaque = !occludes && mat.alpha_mode != AlphaMode::Opaque;
            if needs_blend || needs_opaque {
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
    }
}
