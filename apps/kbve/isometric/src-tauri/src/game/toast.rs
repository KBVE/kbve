//! Simple in-game toast notification system.
//!
//! Toasts are temporary text messages that appear at the bottom of the screen
//! and fade out after a few seconds. Works on both native and WASM.
//!
//! # Usage
//!
//! ```ignore
//! commands.trigger(Toast::new("Found 1x Wood"));
//! commands.trigger(Toast::info("Connected to server"));
//! commands.trigger(Toast::warn("WebTransport failed — using WebSocket"));
//! ```

use bevy::prelude::*;
use std::collections::VecDeque;

/// Maximum number of visible toasts at once.
const MAX_VISIBLE: usize = 5;

/// How long a toast stays fully visible (seconds).
const DISPLAY_DURATION: f32 = 3.0;

/// How long the fade-out takes (seconds).
const FADE_DURATION: f32 = 1.0;

/// Event to trigger a toast notification.
#[derive(Event, Clone, Debug)]
pub struct Toast {
    pub message: String,
    pub color: Color,
}

impl Toast {
    pub fn new(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            color: Color::srgb(0.9, 0.88, 0.75),
        }
    }

    pub fn info(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            color: Color::srgb(0.6, 0.85, 0.6),
        }
    }

    pub fn warn(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            color: Color::srgb(0.95, 0.75, 0.3),
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            color: Color::srgb(0.95, 0.4, 0.35),
        }
    }
}

/// Internal state for an active toast.
struct ActiveToast {
    entity: Entity,
    timer: f32,
}

/// Resource tracking active toasts.
#[derive(Resource, Default)]
struct ToastQueue {
    active: VecDeque<ActiveToast>,
}

/// Marker for the toast container node.
#[derive(Component)]
struct ToastContainer;

/// Marker for individual toast text entities.
#[derive(Component)]
struct ToastEntry;

pub struct ToastPlugin;

impl Plugin for ToastPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ToastQueue>();
        app.add_systems(Startup, spawn_toast_container);
        app.add_observer(on_toast_event);
        app.add_observer(on_loot_event);
        app.add_systems(Update, update_toasts);
    }
}

/// Show a toast when the player receives loot.
fn on_loot_event(
    trigger: On<super::inventory::LootEvent<super::inventory::ItemKind>>,
    mut commands: Commands,
) {
    use bevy_inventory::ItemKind as _;
    let loot = trigger.event();
    let name = loot.kind.display_name();
    let qty = loot.quantity;
    commands.trigger(Toast::new(format!("+ {qty}x {name}")));
}

fn spawn_toast_container(mut commands: Commands) {
    commands
        .spawn(Node {
            position_type: PositionType::Absolute,
            bottom: Val::Px(16.0),
            left: Val::Px(16.0),
            flex_direction: FlexDirection::ColumnReverse,
            row_gap: Val::Px(4.0),
            ..default()
        })
        .insert(ToastContainer);
}

fn on_toast_event(
    trigger: On<Toast>,
    mut commands: Commands,
    mut queue: ResMut<ToastQueue>,
    container_q: Query<Entity, With<ToastContainer>>,
) {
    let Ok(container) = container_q.single() else {
        return;
    };

    let toast = trigger.event();

    // Spawn toast text as child of container
    let entry = commands
        .spawn(Text::new(&toast.message))
        .insert(TextFont {
            font_size: 14.0,
            ..default()
        })
        .insert(TextColor(toast.color))
        .insert(ToastEntry)
        .id();

    commands.entity(container).add_child(entry);

    queue.active.push_back(ActiveToast {
        entity: entry,
        timer: 0.0,
    });

    // Remove oldest if over limit
    while queue.active.len() > MAX_VISIBLE {
        if let Some(old) = queue.active.pop_front() {
            commands.entity(old.entity).try_despawn();
        }
    }
}

fn update_toasts(
    time: Res<Time>,
    mut commands: Commands,
    mut queue: ResMut<ToastQueue>,
    mut text_colors: Query<&mut TextColor, With<ToastEntry>>,
) {
    let dt = time.delta_secs();
    let total_duration = DISPLAY_DURATION + FADE_DURATION;

    queue.active.retain_mut(|toast| {
        toast.timer += dt;

        if toast.timer >= total_duration {
            commands.entity(toast.entity).try_despawn();
            return false;
        }

        // Fade out during the last FADE_DURATION seconds
        if toast.timer > DISPLAY_DURATION {
            let fade_progress = (toast.timer - DISPLAY_DURATION) / FADE_DURATION;
            let alpha = 1.0 - fade_progress;
            if let Ok(mut color) = text_colors.get_mut(toast.entity) {
                let c = color.0.to_srgba();
                color.0 = Color::srgba(c.red, c.green, c.blue, alpha);
            }
        }

        true
    });
}
