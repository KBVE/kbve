use bevy::prelude::*;

pub const TILE_SIZE: f32 = 1.0;
pub const MAP_SIZE: i32 = 8;

#[derive(Component)]
pub struct Tile {
    pub x: i32,
    pub z: i32,
}

pub struct TilemapPlugin;

impl Plugin for TilemapPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_tilemap);
    }
}

fn spawn_tilemap(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let tile_mesh = meshes.add(Plane3d::default().mesh().size(TILE_SIZE, TILE_SIZE));

    let grass_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.3, 0.6, 0.2),
        ..default()
    });

    let stone_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.5, 0.5, 0.5),
        ..default()
    });

    for x in -MAP_SIZE..MAP_SIZE {
        for z in -MAP_SIZE..MAP_SIZE {
            let is_stone = (x + z) % 5 == 0;
            let material = if is_stone {
                stone_material.clone()
            } else {
                grass_material.clone()
            };

            commands.spawn((
                Mesh3d(tile_mesh.clone()),
                MeshMaterial3d(material),
                Transform::from_xyz(x as f32 * TILE_SIZE, 0.0, z as f32 * TILE_SIZE),
                Tile { x, z },
            ));
        }
    }

    // Ambient light
    commands.insert_resource(AmbientLight {
        color: Color::WHITE,
        brightness: 500.0,
    });

    // Directional light (sun)
    commands.spawn((
        DirectionalLight {
            illuminance: 3000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(10.0, 20.0, 10.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}
