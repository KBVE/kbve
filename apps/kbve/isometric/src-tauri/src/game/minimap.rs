//! Top-right corner minimap overlay (#11248).
//!
//! Draws an 80-world-unit-radius view around the local player into a small
//! procedural RGBA image. Refresh capped at ~10 Hz to keep the cost trivial
//! even with hundreds of creatures in range. Toggle via `M`.

use bevy::asset::RenderAssetUsages;
use bevy::image::Image;
use bevy::picking::Pickable;
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
use bevy::ui::FocusPolicy;
use bevy::ui::widget::ImageNode;

use super::phase::GamePhase;
use super::player::Player;
use super::scene_objects::{Interactable, InteractableKind};

const MAP_SIZE: u32 = 160;
const MAP_RADIUS_WORLD: f32 = 80.0;
const REFRESH_HZ: f32 = 10.0;
const REFRESH_PERIOD: f32 = 1.0 / REFRESH_HZ;

/// Background tint (mostly-opaque dark slate).
const BG: [u8; 4] = [12, 14, 22, 220];
/// Subtle grid dot color.
const GRID_DOT: [u8; 4] = [40, 46, 58, 255];
const PLAYER_DOT: [u8; 4] = [255, 215, 64, 255];
const OTHER_PLAYER_DOT: [u8; 4] = [80, 170, 255, 255];
const CREATURE_DOT: [u8; 4] = [220, 110, 110, 255];
const TREE_DOT: [u8; 4] = [70, 180, 90, 255];
const ROCK_DOT: [u8; 4] = [170, 170, 170, 255];
const MUSHROOM_DOT: [u8; 4] = [200, 140, 220, 255];
const CRYSTAL_DOT: [u8; 4] = [120, 220, 220, 255];
const DEFAULT_DOT: [u8; 4] = [200, 200, 200, 255];

#[derive(Component)]
struct MinimapRoot;

#[derive(Component)]
struct MinimapImage;

#[derive(Resource)]
struct MinimapHandle(Handle<Image>);

#[derive(Resource)]
struct MinimapTimer(Timer);

#[derive(Resource, Default)]
struct MinimapVisible(bool);

pub struct MinimapPlugin;

impl Plugin for MinimapPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(MinimapTimer(Timer::from_seconds(
            REFRESH_PERIOD,
            TimerMode::Repeating,
        )));
        app.insert_resource(MinimapVisible(true));
        app.add_systems(OnEnter(GamePhase::Playing), spawn_minimap);
        app.add_systems(
            Update,
            (redraw_minimap, toggle_minimap).run_if(in_state(GamePhase::Playing)),
        );
    }
}

fn spawn_minimap(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    let buffer = vec![BG[0]; (MAP_SIZE * MAP_SIZE * 4) as usize];
    let mut img = Image::new(
        Extent3d {
            width: MAP_SIZE,
            height: MAP_SIZE,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        buffer,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::MAIN_WORLD | RenderAssetUsages::RENDER_WORLD,
    );
    paint_background(&mut img);
    let handle = images.add(img);
    commands.insert_resource(MinimapHandle(handle.clone()));

    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                top: Val::Px(16.0),
                right: Val::Px(16.0),
                width: Val::Px(MAP_SIZE as f32),
                height: Val::Px(MAP_SIZE as f32),
                border_radius: BorderRadius::all(Val::Px(6.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.04, 0.05, 0.08, 0.92)),
            GlobalZIndex(60),
            FocusPolicy::Pass,
            Pickable::IGNORE,
            DespawnOnExit(GamePhase::Playing),
            MinimapRoot,
        ))
        .with_child((
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                ..default()
            },
            ImageNode::new(handle),
            FocusPolicy::Pass,
            Pickable::IGNORE,
            MinimapImage,
        ));
}

fn toggle_minimap(
    keys: Res<ButtonInput<KeyCode>>,
    mut visible: ResMut<MinimapVisible>,
    mut q: Query<&mut Visibility, With<MinimapRoot>>,
) {
    if !keys.just_pressed(KeyCode::KeyM) {
        return;
    }
    visible.0 = !visible.0;
    for mut v in &mut q {
        *v = if visible.0 {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
    }
}

fn redraw_minimap(
    time: Res<Time>,
    mut timer: ResMut<MinimapTimer>,
    visible: Res<MinimapVisible>,
    handle: Option<Res<MinimapHandle>>,
    mut images: ResMut<Assets<Image>>,
    player_q: Query<&GlobalTransform, With<Player>>,
    other_players_q: Query<&GlobalTransform, (With<bevy_kbve_net::PlayerId>, Without<Player>)>,
    creature_q: Query<&GlobalTransform, With<bevy_kbve_net::creatures::types::Creature>>,
    interactable_q: Query<(&GlobalTransform, &Interactable)>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }
    if !visible.0 {
        return;
    }
    let Some(handle) = handle else {
        return;
    };
    let Ok(player_tf) = player_q.single() else {
        return;
    };
    let Some(mut img) = images.get_mut(&handle.0) else {
        return;
    };
    let img = &mut *img;

    paint_background(img);

    let player_xz = Vec2::new(player_tf.translation().x, player_tf.translation().z);

    // Other players first so the local player sits on top.
    for tf in &other_players_q {
        plot_world(img, player_xz, tf, OTHER_PLAYER_DOT, 2);
    }
    for tf in &creature_q {
        plot_world(img, player_xz, tf, CREATURE_DOT, 1);
    }
    for (tf, interactable) in &interactable_q {
        let color = match interactable.kind {
            InteractableKind::Tree => TREE_DOT,
            InteractableKind::Rock => ROCK_DOT,
            InteractableKind::Mushroom => MUSHROOM_DOT,
            InteractableKind::Crystal => CRYSTAL_DOT,
            _ => DEFAULT_DOT,
        };
        plot_world(img, player_xz, tf, color, 1);
    }

    // Local player marker — bigger + brighter, centered.
    let cx = MAP_SIZE as i32 / 2;
    let cy = MAP_SIZE as i32 / 2;
    draw_dot(img, cx, cy, PLAYER_DOT, 3);
}

fn paint_background(img: &mut Image) {
    let data = img.data.as_mut().expect("minimap image has data");
    for chunk in data.chunks_exact_mut(4) {
        chunk.copy_from_slice(&BG);
    }
    // Sparse grid dots every 16 px so the player has spatial reference even
    // when nothing is around.
    for y in (0..MAP_SIZE as i32).step_by(16) {
        for x in (0..MAP_SIZE as i32).step_by(16) {
            draw_pixel(img, x, y, GRID_DOT);
        }
    }
}

fn plot_world(img: &mut Image, player_xz: Vec2, tf: &GlobalTransform, color: [u8; 4], radius: i32) {
    let world = Vec2::new(tf.translation().x, tf.translation().z);
    let rel = world - player_xz;
    if rel.length() > MAP_RADIUS_WORLD {
        return;
    }
    let scale = (MAP_SIZE as f32 / 2.0) / MAP_RADIUS_WORLD;
    let cx = MAP_SIZE as i32 / 2;
    let cy = MAP_SIZE as i32 / 2;
    let px = cx + (rel.x * scale).round() as i32;
    let py = cy + (rel.y * scale).round() as i32;
    draw_dot(img, px, py, color, radius);
}

fn draw_dot(img: &mut Image, cx: i32, cy: i32, color: [u8; 4], radius: i32) {
    let r2 = radius * radius;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            if dx * dx + dy * dy > r2 {
                continue;
            }
            draw_pixel(img, cx + dx, cy + dy, color);
        }
    }
}

fn draw_pixel(img: &mut Image, x: i32, y: i32, color: [u8; 4]) {
    if x < 0 || y < 0 || x >= MAP_SIZE as i32 || y >= MAP_SIZE as i32 {
        return;
    }
    let Some(data) = img.data.as_mut() else {
        return;
    };
    let idx = ((y as u32 * MAP_SIZE + x as u32) * 4) as usize;
    if idx + 4 > data.len() {
        return;
    }
    data[idx..idx + 4].copy_from_slice(&color);
}
