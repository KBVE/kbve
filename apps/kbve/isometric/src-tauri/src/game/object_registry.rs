use bevy::prelude::*;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::f32::consts::PI;
use std::sync::LazyLock;

use bevy_rapier3d::prelude::*;

use super::scene_objects::{
    AnimatedCrystal, HoverOutline, Occludable, OriginalEmissive, RotatingBox,
};
use super::terrain::TerrainMap;

// ---------------------------------------------------------------------------
// Object Kind
// ---------------------------------------------------------------------------

/// Every placeable object type in the game.
/// Adding a new variant requires updating `spawn_object_entity()`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Component, Reflect)]
pub enum ObjectKind {
    Crate,
    DarkCrate,
    Crystal,
    Pillar,
    MetallicSphere,
    SpotLight,
    PointLight,
}

// ---------------------------------------------------------------------------
// Placement record (serializable, no ECS coupling)
// ---------------------------------------------------------------------------

/// A serializable description of one placed object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectPlacement {
    pub kind: ObjectKind,
    pub position: [f32; 3],
    pub rotation_y: f32,
}

// ---------------------------------------------------------------------------
// ECS component linking entity to registry
// ---------------------------------------------------------------------------

#[derive(Component)]
pub struct ObjectInstance {
    pub registry_id: u64,
}

// ---------------------------------------------------------------------------
// Registry resource
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ObjectRegistryEntry {
    pub placement: ObjectPlacement,
    pub entity: Option<Entity>,
}

/// Central source of truth for all placed objects.
#[derive(Resource, Default)]
pub struct ObjectRegistry {
    next_id: u64,
    entries: HashMap<u64, ObjectRegistryEntry>,
    spatial_index: HashMap<(i32, i32), Vec<u64>>,
}

impl ObjectRegistry {
    pub fn insert(&mut self, placement: ObjectPlacement) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let tile = Self::pos_to_tile(&placement.position);
        self.spatial_index.entry(tile).or_default().push(id);
        self.entries.insert(
            id,
            ObjectRegistryEntry {
                placement,
                entity: None,
            },
        );
        id
    }

    pub fn link_entity(&mut self, id: u64, entity: Entity) {
        if let Some(entry) = self.entries.get_mut(&id) {
            entry.entity = Some(entity);
        }
    }

    pub fn remove(&mut self, id: u64) -> Option<Entity> {
        if let Some(entry) = self.entries.remove(&id) {
            let tile = Self::pos_to_tile(&entry.placement.position);
            if let Some(ids) = self.spatial_index.get_mut(&tile) {
                ids.retain(|&stored| stored != id);
            }
            entry.entity
        } else {
            None
        }
    }

    pub fn all_placements(&self) -> Vec<ObjectPlacement> {
        self.entries.values().map(|e| e.placement.clone()).collect()
    }

    fn pos_to_tile(pos: &[f32; 3]) -> (i32, i32) {
        (pos[0].round() as i32, pos[2].round() as i32)
    }
}

// ---------------------------------------------------------------------------
// IPC snapshot (mirrors state.rs pattern)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectRegistrySnapshot {
    pub objects: Vec<ObjectPlacement>,
    pub count: usize,
}

pub static OBJECT_REGISTRY_SNAPSHOT: LazyLock<DashMap<(), ObjectRegistrySnapshot>> =
    LazyLock::new(DashMap::new);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[derive(Message)]
pub struct SpawnObjectMessage {
    pub kind: ObjectKind,
    pub position: Vec3,
    pub rotation_y: f32,
}

#[derive(Message)]
pub struct DespawnObjectMessage {
    pub registry_id: u64,
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct ObjectRegistryPlugin;

impl Plugin for ObjectRegistryPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ObjectRegistry>()
            .add_message::<SpawnObjectMessage>()
            .add_message::<DespawnObjectMessage>()
            .add_systems(Startup, spawn_initial_scene)
            .add_systems(
                Update,
                (
                    handle_spawn_messages,
                    handle_despawn_messages,
                    snapshot_object_registry,
                ),
            );
    }
}

// ---------------------------------------------------------------------------
// Initial scene (replaces hard-coded spawn_scene_objects)
// ---------------------------------------------------------------------------

fn spawn_initial_scene(mut writer: MessageWriter<SpawnObjectMessage>) {
    let objects = [
        SpawnObjectMessage {
            kind: ObjectKind::Crate,
            position: Vec3::new(3.0, 1.0, -2.0),
            rotation_y: PI / 4.0,
        },
        SpawnObjectMessage {
            kind: ObjectKind::DarkCrate,
            position: Vec3::new(-3.0, 1.25, -3.0),
            rotation_y: PI / 6.0,
        },
        SpawnObjectMessage {
            kind: ObjectKind::Crystal,
            position: Vec3::new(0.0, 4.0, 0.0),
            rotation_y: 0.0,
        },
        SpawnObjectMessage {
            kind: ObjectKind::Pillar,
            position: Vec3::new(-5.0, 2.0, 2.0),
            rotation_y: 0.0,
        },
        SpawnObjectMessage {
            kind: ObjectKind::MetallicSphere,
            position: Vec3::new(4.0, 0.8, 3.0),
            rotation_y: 0.0,
        },
        SpawnObjectMessage {
            kind: ObjectKind::SpotLight,
            position: Vec3::new(6.0, 10.0, 0.0),
            rotation_y: 0.0,
        },
        SpawnObjectMessage {
            kind: ObjectKind::PointLight,
            position: Vec3::new(-4.0, 6.0, 4.0),
            rotation_y: 0.0,
        },
    ];
    for msg in objects {
        writer.write(msg);
    }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

fn handle_spawn_messages(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut registry: ResMut<ObjectRegistry>,
    mut terrain: ResMut<TerrainMap>,
    mut messages: MessageReader<SpawnObjectMessage>,
) {
    for msg in messages.read() {
        // Y is terrain-relative: adjust to absolute position
        let terrain_h = terrain.height_at_world(msg.position.x, msg.position.z);
        let absolute_pos = Vec3::new(msg.position.x, terrain_h + msg.position.y, msg.position.z);

        let placement = ObjectPlacement {
            kind: msg.kind,
            position: [absolute_pos.x, absolute_pos.y, absolute_pos.z],
            rotation_y: msg.rotation_y,
        };
        let id = registry.insert(placement);
        let entity = spawn_object_entity(
            &mut commands,
            &mut meshes,
            &mut materials,
            msg.kind,
            absolute_pos,
            msg.rotation_y,
            id,
        );
        registry.link_entity(id, entity);
    }
}

fn handle_despawn_messages(
    mut commands: Commands,
    mut registry: ResMut<ObjectRegistry>,
    mut messages: MessageReader<DespawnObjectMessage>,
) {
    for msg in messages.read() {
        if let Some(entity) = registry.remove(msg.registry_id) {
            commands.entity(entity).despawn();
        }
    }
}

fn snapshot_object_registry(registry: Res<ObjectRegistry>) {
    if registry.is_changed() {
        let placements = registry.all_placements();
        let snapshot = ObjectRegistrySnapshot {
            count: placements.len(),
            objects: placements,
        };
        OBJECT_REGISTRY_SNAPSHOT.insert((), snapshot);
    }
}

// ---------------------------------------------------------------------------
// Central spawn function — exhaustive match on ObjectKind
// ---------------------------------------------------------------------------

fn spawn_object_entity(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
    kind: ObjectKind,
    position: Vec3,
    rotation_y: f32,
    registry_id: u64,
) -> Entity {
    match kind {
        ObjectKind::Crate => {
            let size = 2.0;
            let half = size / 2.0;
            commands
                .spawn((
                    Mesh3d(meshes.add(Cuboid::new(size, size, size))),
                    MeshMaterial3d(materials.add(StandardMaterial {
                        base_color: Color::srgb(0.8, 0.65, 0.4),
                        perceptual_roughness: 0.9,
                        ..default()
                    })),
                    Transform::from_translation(position)
                        .with_rotation(Quat::from_rotation_y(rotation_y)),
                    kind,
                    ObjectInstance { registry_id },
                    RotatingBox,
                    RigidBody::Fixed,
                    Collider::cylinder(half, half * 1.2),
                    Occludable,
                    OriginalEmissive(LinearRgba::BLACK),
                    HoverOutline {
                        half_extents: Vec3::splat(half),
                    },
                ))
                .id()
        }
        ObjectKind::DarkCrate => {
            let size = 2.5;
            let half = size / 2.0;
            commands
                .spawn((
                    Mesh3d(meshes.add(Cuboid::new(size, size, size))),
                    MeshMaterial3d(materials.add(StandardMaterial {
                        base_color: Color::srgb(0.55, 0.45, 0.35),
                        perceptual_roughness: 0.8,
                        ..default()
                    })),
                    Transform::from_translation(position)
                        .with_rotation(Quat::from_rotation_y(rotation_y)),
                    kind,
                    ObjectInstance { registry_id },
                    RotatingBox,
                    RigidBody::Fixed,
                    Collider::cylinder(half, half * 1.2),
                    Occludable,
                    OriginalEmissive(LinearRgba::BLACK),
                    HoverOutline {
                        half_extents: Vec3::splat(half),
                    },
                ))
                .id()
        }
        ObjectKind::Crystal => {
            let emissive = LinearRgba::new(0.31, 0.49, 0.55, 1.0);
            commands
                .spawn((
                    Mesh3d(meshes.add(Sphere::new(1.0).mesh().ico(2).unwrap())),
                    MeshMaterial3d(materials.add(StandardMaterial {
                        base_color: Color::srgb(0.41, 0.72, 0.91),
                        emissive,
                        metallic: 0.3,
                        perceptual_roughness: 0.2,
                        ..default()
                    })),
                    Transform::from_translation(position),
                    kind,
                    ObjectInstance { registry_id },
                    AnimatedCrystal { base_y: position.y },
                    Occludable,
                    OriginalEmissive(emissive),
                    HoverOutline {
                        half_extents: Vec3::splat(1.0),
                    },
                ))
                .id()
        }
        ObjectKind::Pillar => commands
            .spawn((
                Mesh3d(meshes.add(Cuboid::new(0.8, 4.0, 0.8))),
                MeshMaterial3d(materials.add(StandardMaterial {
                    base_color: Color::srgb(0.7, 0.7, 0.75),
                    metallic: 0.1,
                    perceptual_roughness: 0.6,
                    ..default()
                })),
                Transform::from_translation(position),
                kind,
                ObjectInstance { registry_id },
                RigidBody::Fixed,
                Collider::cuboid(0.4, 2.0, 0.4),
                Occludable,
                OriginalEmissive(LinearRgba::BLACK),
                HoverOutline {
                    half_extents: Vec3::new(0.4, 2.0, 0.4),
                },
            ))
            .id(),
        ObjectKind::MetallicSphere => {
            let radius = 0.8;
            commands
                .spawn((
                    Mesh3d(meshes.add(Sphere::new(radius).mesh().ico(3).unwrap())),
                    MeshMaterial3d(materials.add(StandardMaterial {
                        base_color: Color::srgb(0.9, 0.85, 0.7),
                        metallic: 1.0,
                        perceptual_roughness: 0.1,
                        ..default()
                    })),
                    Transform::from_translation(position),
                    kind,
                    ObjectInstance { registry_id },
                    RigidBody::Fixed,
                    Collider::ball(radius),
                    Occludable,
                    OriginalEmissive(LinearRgba::BLACK),
                    HoverOutline {
                        half_extents: Vec3::splat(radius),
                    },
                ))
                .id()
        }
        ObjectKind::SpotLight => commands
            .spawn((
                SpotLight {
                    color: Color::srgb(1.0, 0.76, 0.0),
                    intensity: 80000.0,
                    range: 30.0,
                    outer_angle: PI / 8.0,
                    inner_angle: PI / 16.0,
                    shadows_enabled: true,
                    ..default()
                },
                Transform::from_translation(position).looking_at(Vec3::ZERO, Vec3::Y),
                kind,
                ObjectInstance { registry_id },
            ))
            .id(),
        ObjectKind::PointLight => commands
            .spawn((
                PointLight {
                    color: Color::srgb(0.5, 0.6, 0.9),
                    intensity: 40000.0,
                    range: 20.0,
                    shadows_enabled: true,
                    ..default()
                },
                Transform::from_translation(position),
                kind,
                ObjectInstance { registry_id },
            ))
            .id(),
    }
}
