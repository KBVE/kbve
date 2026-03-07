use bevy::prelude::*;

use super::state::PlayerState;

#[derive(Component)]
pub struct Player;

pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_player);
        app.add_systems(Update, (move_player, sync_player_state));
    }
}

fn spawn_player(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Player represented as a colored cube
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.6, 1.2, 0.6))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.2, 0.4, 0.8),
            ..default()
        })),
        Transform::from_xyz(0.0, 0.6, 0.0),
        Player,
    ));
}

fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut query: Query<&mut Transform, With<Player>>,
) {
    let speed = 5.0;
    let mut direction = Vec3::ZERO;

    // WASD movement in isometric space
    if keyboard.pressed(KeyCode::KeyW) {
        direction += Vec3::new(-1.0, 0.0, -1.0);
    }
    if keyboard.pressed(KeyCode::KeyS) {
        direction += Vec3::new(1.0, 0.0, 1.0);
    }
    if keyboard.pressed(KeyCode::KeyA) {
        direction += Vec3::new(-1.0, 0.0, 1.0);
    }
    if keyboard.pressed(KeyCode::KeyD) {
        direction += Vec3::new(1.0, 0.0, -1.0);
    }

    if direction != Vec3::ZERO {
        direction = direction.normalize();
        for mut transform in &mut query {
            transform.translation += direction * speed * time.delta_secs();
        }
    }
}

fn sync_player_state(
    query: Query<&Transform, With<Player>>,
    mut player_state: ResMut<PlayerState>,
) {
    if let Ok(transform) = query.get_single() {
        let pos = transform.translation;
        player_state.position = [pos.x, pos.y, pos.z];
    }
}
