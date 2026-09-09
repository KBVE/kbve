//! The ring under whatever you have selected.
//!
//! One reusable entity rather than one per character. A selection marker is a
//! property of the *selection*, not of the thing selected, and only one thing
//! is selected at a time -- spawning and despawning a mesh on every Tab press
//! would churn the render world for no reason.

use bevy::prelude::*;

use super::camera::CameraSystems;
use super::character::{CHARACTER_HEIGHT, CHARACTER_RADIUS};
use super::combat::Target;
use super::player::Player;
use super::theme::ACTIVE;

pub struct TargetRingPlugin;

impl Plugin for TargetRingPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_ring).add_systems(
            PostUpdate,
            place_ring
                .before(CameraSystems)
                .before(TransformSystems::Propagate),
        );
    }
}

const INNER_RADIUS: f32 = 0.52;
const OUTER_RADIUS: f32 = 0.68;

/// How far above the target's feet the ring sits.
///
/// The ground is a triangle mesh, so a ring exactly at foot height z-fights
/// with it in bands as the camera moves. Lifting it a few millimetres is
/// cheaper and steadier than a depth bias, and at this camera distance it reads
/// as flat on the floor anyway.
const GROUND_CLEARANCE: f32 = 0.02;

/// How fast the ring breathes, in radians per second, and by how much.
///
/// A pulse rather than a spin: an annulus is rotationally symmetric, so turning
/// it changes nothing anybody can see. Scale does, and it is what makes the
/// marker read as a live selection rather than a decal painted on the terrain.
const PULSE_RATE: f32 = 3.0;
const PULSE_DEPTH: f32 = 0.04;

/// Bridges an egui colour into bevy's.
///
/// egui works in sRGB bytes and bevy in floats, and getting that conversion
/// wrong is how the ring ends up a different red from the health bar that is
/// supposed to match it.
fn from_theme(colour: bevy_egui::egui::Color32) -> Color {
    let [r, g, b, _] = colour.to_array();
    Color::srgb_u8(r, g, b)
}

#[derive(Component)]
struct TargetRing;

fn spawn_ring(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // An annulus is authored in XY, so it stands upright by default; the
    // quarter turn lays it on the ground.
    let mesh = meshes.add(Annulus::new(INNER_RADIUS, OUTER_RADIUS));

    let material = materials.add(StandardMaterial {
        // The same red the target's health bar uses, so the marker in the world
        // and the frame on the screen are visibly the same idea.
        base_color: from_theme(ACTIVE.red).with_alpha(0.85),
        // Unlit and emissive: a selection marker has to stay readable in shadow
        // and at night, and the moment it takes lighting it stops being
        // reliable interface and becomes scenery.
        unlit: true,
        emissive: from_theme(ACTIVE.red).to_linear() * 1.4,
        alpha_mode: AlphaMode::Blend,
        double_sided: true,
        cull_mode: None,
        ..default()
    });

    commands.spawn((
        TargetRing,
        Mesh3d(mesh),
        MeshMaterial3d(material),
        Transform::from_rotation(Quat::from_rotation_x(-core::f32::consts::FRAC_PI_2)),
        Visibility::Hidden,
    ));
}

/// Puts the ring under the player's target, or hides it when there is none.
fn place_ring(
    time: Res<Time>,
    player: Single<&Target, With<Player>>,
    targets: Query<&Transform, Without<TargetRing>>,
    ring: Single<(&mut Transform, &mut Visibility), With<TargetRing>>,
) {
    let (mut transform, mut visibility) = ring.into_inner();

    let Some(subject) = player.0.and_then(|entity| targets.get(entity).ok()) else {
        *visibility = Visibility::Hidden;
        return;
    };

    *visibility = Visibility::Visible;

    // The character's origin is the middle of its capsule, so the feet are a
    // half-height and a radius below it.
    let feet = subject.translation.y - (CHARACTER_HEIGHT * 0.5 + CHARACTER_RADIUS);

    transform.translation = Vec3::new(
        subject.translation.x,
        feet + GROUND_CLEARANCE,
        subject.translation.z,
    );
    transform.scale = Vec3::splat(1.0 + (time.elapsed_secs() * PULSE_RATE).sin() * PULSE_DEPTH);
}
