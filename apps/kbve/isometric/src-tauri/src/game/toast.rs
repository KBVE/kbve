//! Pooled in-game toast notification system with severity styling.
//!
//! Pre-allocates `MAX_VISIBLE` toast slots at startup. Toasts are shown by
//! making pooled nodes visible and hidden on expiry — no per-toast
//! spawn/despawn overhead.
//!
//! # Usage
//!
//! ```ignore
//! commands.trigger(Toast::loot("+ 3x Wood"));
//! commands.trigger(Toast::info("Connected to server"));
//! commands.trigger(Toast::warn("WebTransport failed — using WebSocket"));
//! commands.trigger(Toast::error("Disconnected from server"));
//! ```

use bevy::prelude::*;
use std::collections::VecDeque;

use super::ui_color;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of visible toasts at once (also the pool size).
const MAX_VISIBLE: usize = 5;

/// Toast panel width.
const TOAST_WIDTH: f32 = 280.0;
/// Toast panel height.
const TOAST_HEIGHT: f32 = 36.0;
/// Width of the colored severity stripe on the left.
const STRIPE_WIDTH: f32 = 4.0;
/// Gap between stacked toasts.
const TOAST_GAP: f32 = 6.0;

// ---------------------------------------------------------------------------
// Toast severity
// ---------------------------------------------------------------------------

/// Severity level determines accent color and display duration.
#[derive(Clone, Copy, Debug, Default)]
pub enum ToastSeverity {
    #[default]
    Info,
    Success,
    Warning,
    Error,
    Loot,
}

impl ToastSeverity {
    /// Accent color for the left border stripe.
    pub fn accent_color(self) -> Color {
        match self {
            Self::Info => ui_color::TOAST_INFO,
            Self::Success => ui_color::TOAST_SUCCESS,
            Self::Warning => ui_color::TOAST_WARNING,
            Self::Error => ui_color::TOAST_ERROR,
            Self::Loot => ui_color::TOAST_LOOT,
        }
    }

    /// How long the toast stays fully visible (seconds).
    pub fn display_duration(self) -> f32 {
        match self {
            Self::Info => 3.0,
            Self::Success => 3.0,
            Self::Warning => 5.0,
            Self::Error => 6.0,
            Self::Loot => 4.0,
        }
    }

    /// Fade-out duration (seconds).
    pub fn fade_duration(self) -> f32 {
        1.0
    }
}

// ---------------------------------------------------------------------------
// Toast event
// ---------------------------------------------------------------------------

/// Event to trigger a toast notification.
#[derive(Event, Clone, Debug)]
pub struct Toast {
    pub message: String,
    pub severity: ToastSeverity,
}

impl Toast {
    pub fn new(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            severity: ToastSeverity::Info,
        }
    }

    pub fn info(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            severity: ToastSeverity::Info,
        }
    }

    pub fn success(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            severity: ToastSeverity::Success,
        }
    }

    pub fn warn(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            severity: ToastSeverity::Warning,
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            severity: ToastSeverity::Error,
        }
    }

    pub fn loot(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
            severity: ToastSeverity::Loot,
        }
    }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/// Marker for the toast container node (top-right anchor).
#[derive(Component)]
struct ToastContainer;

/// Marker for a pooled toast slot (the outer panel node).
#[derive(Component)]
struct ToastSlot {
    /// Pool index (0..MAX_VISIBLE).
    index: usize,
}

/// The colored left stripe inside a toast slot.
#[derive(Component)]
struct ToastStripe {
    index: usize,
}

/// The text node inside a toast slot.
#[derive(Component)]
struct ToastText {
    index: usize,
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/// Tracks active toast state per pool slot.
#[derive(Default)]
struct SlotState {
    active: bool,
    timer: f32,
    display_duration: f32,
    fade_duration: f32,
}

/// Resource managing the toast pool.
#[derive(Resource)]
struct ToastPool {
    slots: Vec<SlotState>,
    /// FIFO queue of pending toasts when all slots are occupied.
    pending: VecDeque<Toast>,
}

impl Default for ToastPool {
    fn default() -> Self {
        Self {
            slots: (0..MAX_VISIBLE).map(|_| SlotState::default()).collect(),
            pending: VecDeque::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct ToastPlugin;

impl Plugin for ToastPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ToastPool>();
        app.add_systems(Startup, spawn_toast_pool);
        app.add_observer(on_toast_event);
        app.add_observer(on_loot_event);
        app.add_systems(Update, update_toast_pool);
    }
}

// ---------------------------------------------------------------------------
// Spawn pre-allocated pool
// ---------------------------------------------------------------------------

fn spawn_toast_pool(mut commands: Commands) {
    // Container: top-right, column flowing downward
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                top: Val::Px(12.0),
                right: Val::Px(12.0),
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(TOAST_GAP),
                align_items: AlignItems::FlexEnd,
                ..default()
            },
            GlobalZIndex(90),
            ToastContainer,
        ))
        .with_children(|container| {
            for i in 0..MAX_VISIBLE {
                // Outer panel (hidden by default)
                container
                    .spawn((
                        Node {
                            width: Val::Px(TOAST_WIDTH),
                            height: Val::Px(TOAST_HEIGHT),
                            flex_direction: FlexDirection::Row,
                            align_items: AlignItems::Center,
                            overflow: Overflow::clip(),
                            border_radius: BorderRadius::all(Val::Px(4.0)),
                            ..default()
                        },
                        BackgroundColor(ui_color::TOAST_BG),
                        Visibility::Hidden,
                        ToastSlot { index: i },
                    ))
                    .with_children(|panel| {
                        // Left accent stripe
                        panel.spawn((
                            Node {
                                width: Val::Px(STRIPE_WIDTH),
                                height: Val::Percent(100.0),
                                ..default()
                            },
                            BackgroundColor(ui_color::TOAST_INFO),
                            ToastStripe { index: i },
                        ));

                        // Text
                        panel.spawn((
                            Text::new(""),
                            TextFont {
                                font_size: 13.0,
                                ..default()
                            },
                            TextColor(ui_color::TEXT_PRIMARY),
                            Node {
                                margin: UiRect::horizontal(Val::Px(10.0)),
                                ..default()
                            },
                            ToastText { index: i },
                        ));
                    });
            }
        });
}

// ---------------------------------------------------------------------------
// Observers
// ---------------------------------------------------------------------------

fn on_toast_event(trigger: On<Toast>, mut pool: ResMut<ToastPool>) {
    let toast = trigger.event().clone();

    // Find a free slot
    if let Some(slot_idx) = pool.slots.iter().position(|s| !s.active) {
        activate_slot(&mut pool.slots[slot_idx], &toast);
        // We can't update the UI nodes here (no query access in observer),
        // so we store the toast data in pending with a marker
        pool.pending.push_back(toast);
    } else {
        // All slots full — queue it
        pool.pending.push_back(toast);
    }
}

fn on_loot_event(
    trigger: On<super::inventory::LootEvent<super::inventory::ItemKind>>,
    mut commands: Commands,
) {
    use bevy_inventory::ItemKind as _;
    let loot = trigger.event();
    let name = loot.kind.display_name();
    let qty = loot.quantity;
    commands.trigger(Toast::loot(format!("+ {qty}x {name}")));
}

fn activate_slot(slot: &mut SlotState, toast: &Toast) {
    slot.active = true;
    slot.timer = 0.0;
    slot.display_duration = toast.severity.display_duration();
    slot.fade_duration = toast.severity.fade_duration();
}

// ---------------------------------------------------------------------------
// Update system: applies pending toasts to UI nodes, ticks timers, fades
// ---------------------------------------------------------------------------

fn update_toast_pool(
    time: Res<Time>,
    mut pool: ResMut<ToastPool>,
    mut slot_q: Query<(&ToastSlot, &mut Visibility, &mut BackgroundColor)>,
    mut stripe_q: Query<(&ToastStripe, &mut BackgroundColor), Without<ToastSlot>>,
    mut text_q: Query<(&ToastText, &mut Text, &mut TextColor)>,
) {
    let dt = time.delta_secs();

    // Apply pending toasts to free slots and update their UI
    while let Some(toast) = pool.pending.front().cloned() {
        if let Some(slot_idx) = pool.slots.iter().position(|s| !s.active) {
            pool.pending.pop_front();
            activate_slot(&mut pool.slots[slot_idx], &toast);

            // Update UI nodes for this slot
            for (slot, mut vis, _) in &mut slot_q {
                if slot.index == slot_idx {
                    *vis = Visibility::Visible;
                }
            }
            for (stripe, mut bg) in &mut stripe_q {
                if stripe.index == slot_idx {
                    *bg = toast.severity.accent_color().into();
                }
            }
            for (text, mut txt, mut color) in &mut text_q {
                if text.index == slot_idx {
                    **txt = toast.message.clone();
                    color.0 = ui_color::TEXT_PRIMARY;
                }
            }
        } else {
            break; // No free slots — wait
        }
    }

    // Tick active slots, fade out, and recycle
    for i in 0..MAX_VISIBLE {
        let slot = &mut pool.slots[i];
        if !slot.active {
            continue;
        }

        slot.timer += dt;
        let total = slot.display_duration + slot.fade_duration;

        if slot.timer >= total {
            // Expired — hide and recycle
            slot.active = false;
            for (s, mut vis, _) in &mut slot_q {
                if s.index == i {
                    *vis = Visibility::Hidden;
                }
            }
            continue;
        }

        // Fade out during the last fade_duration seconds
        if slot.timer > slot.display_duration {
            let fade_progress = (slot.timer - slot.display_duration) / slot.fade_duration;
            let alpha = 1.0 - fade_progress;

            for (s, _, mut bg) in &mut slot_q {
                if s.index == i {
                    let c = ui_color::TOAST_BG.to_srgba();
                    *bg = Color::srgba(c.red, c.green, c.blue, c.alpha * alpha).into();
                }
            }
            for (text, _, mut color) in &mut text_q {
                if text.index == i {
                    let c = ui_color::TEXT_PRIMARY.to_srgba();
                    color.0 = Color::srgba(c.red, c.green, c.blue, alpha);
                }
            }
            for (stripe, mut bg) in &mut stripe_q {
                if stripe.index == i {
                    let c = bg.0.to_srgba();
                    *bg = Color::srgba(c.red, c.green, c.blue, alpha).into();
                }
            }
        }
    }
}
