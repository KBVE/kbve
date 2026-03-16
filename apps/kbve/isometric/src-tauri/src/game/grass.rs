use bevy::prelude::*;

use super::player::Player;

const FLATTEN_RADIUS: f32 = 1.5;
const FLATTEN_SPEED: f32 = 8.0;
const WIND_SPEED: f32 = 1.2;
const WIND_STRENGTH: f32 = 0.15; // ~8° max tilt

#[derive(Component)]
pub struct GrassTuft {
    pub wind_phase: f32,
    pub flatten: f32,
}

pub struct GrassPlugin;

impl Plugin for GrassPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            (animate_grass_wind, flatten_grass_near_player).run_if(any_with_component::<GrassTuft>),
        );
    }
}

/// Gentle sinusoidal sway — each tuft has a unique phase so they don't move in unison.
fn animate_grass_wind(time: Res<Time>, mut query: Query<(&mut Transform, &GrassTuft)>) {
    let t = time.elapsed_secs();

    for (mut tf, tuft) in &mut query {
        // Skip tufts that are being flattened (flatten system handles their rotation)
        if tuft.flatten > 0.05 {
            continue;
        }

        let sway = (t * WIND_SPEED + tuft.wind_phase).sin() * WIND_STRENGTH;
        let base_rot = Quat::from_rotation_y(tuft.wind_phase);
        let wind_rot = Quat::from_rotation_x(sway);
        tf.rotation = base_rot * wind_rot;
    }
}

/// Scale down and tilt tufts away from the player when within range.
fn flatten_grass_near_player(
    time: Res<Time>,
    player_q: Query<&Transform, With<Player>>,
    mut grass_q: Query<(&mut Transform, &mut GrassTuft), Without<Player>>,
) {
    let Ok(player_tf) = player_q.single() else {
        return;
    };
    let player_xz = Vec2::new(player_tf.translation.x, player_tf.translation.z);
    let dt = time.delta_secs();
    let t = time.elapsed_secs();

    for (mut tf, mut tuft) in &mut grass_q {
        let tuft_xz = Vec2::new(tf.translation.x, tf.translation.z);
        let dist = player_xz.distance(tuft_xz);

        let target = if dist < FLATTEN_RADIUS {
            ((FLATTEN_RADIUS - dist) / FLATTEN_RADIUS).clamp(0.0, 1.0)
        } else {
            0.0
        };

        tuft.flatten += (target - tuft.flatten) * (dt * FLATTEN_SPEED).min(1.0);

        // Scale Y down when flattened (min 30% height), preserve original XZ scale
        let base_scale = tf.scale.x; // uniform base from spawn
        let scale_y = base_scale * (1.0 - tuft.flatten * 0.7);
        tf.scale = Vec3::new(base_scale, scale_y, base_scale);

        if tuft.flatten > 0.05 {
            // Tilt away from player
            let away = (tuft_xz - player_xz).normalize_or_zero();
            let tilt_angle = tuft.flatten * 0.8; // ~45° max lean
            let tilt_rot =
                Quat::from_rotation_y(away.y.atan2(away.x)) * Quat::from_rotation_z(tilt_angle);

            // Blend wind with flatten
            let wind_amount = 1.0 - tuft.flatten;
            let wind_sway = (t * WIND_SPEED + tuft.wind_phase).sin() * WIND_STRENGTH * wind_amount;
            let wind_rot =
                Quat::from_rotation_y(tuft.wind_phase) * Quat::from_rotation_x(wind_sway);

            tf.rotation = wind_rot.slerp(tilt_rot, tuft.flatten);
        }
    }
}
