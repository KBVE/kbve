use bevy::prelude::*;
use bevy::ui::FocusPolicy;
use bevy::window::PrimaryWindow;

// ---------------------------------------------------------------------------
// Shared joystick state — read by player movement system
// ---------------------------------------------------------------------------

#[derive(Resource, Default)]
pub struct VirtualJoystickState {
    /// Whether the joystick is currently being dragged.
    pub active: bool,
    /// Isometric movement direction (XZ plane, not normalized — magnitude = analog intensity).
    pub direction: Vec3,
    /// True when the pointer is over or interacting with the joystick area.
    /// Scene picking systems should skip raycasting when this is true.
    pub pointer_captured: bool,
    /// Set by the Bevy UI jump button; consumed (cleared) each frame by the player system.
    pub jump_requested: bool,
    /// Set by the Bevy UI action button; consumed each frame by the player/combat system.
    pub action_requested: bool,
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

/// Marker for the joystick base (outer ring).
#[derive(Component)]
struct JoystickBase;

/// Marker for the joystick knob (inner circle that moves).
#[derive(Component)]
struct JoystickKnob;

/// Marker for the jump button (bottom-right).
#[derive(Component)]
struct JumpButton;

/// Marker for the action button (bottom-right, above jump).
#[derive(Component)]
struct ActionButton;

/// Tracks joystick drag state.
#[derive(Resource, Default)]
struct JoystickDrag {
    active: bool,
    /// The touch ID that started the drag (prevents multi-touch confusion).
    touch_id: Option<u64>,
    /// Center of the joystick base in logical pixels.
    center: Vec2,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Joystick base diameter in logical pixels.
const BASE_SIZE: f32 = 160.0;
/// Knob diameter in logical pixels.
const KNOB_SIZE: f32 = 64.0;
/// Maximum knob travel from center (in pixels).
const MAX_TRAVEL: f32 = (BASE_SIZE - KNOB_SIZE) / 2.0;
/// Margin from bottom-left corner.
const MARGIN: f32 = 32.0;
/// Action button size.
const ACTION_BTN_SIZE: f32 = 72.0;
/// Margin from bottom-right corner for action buttons.
const ACTION_MARGIN: f32 = 28.0;
/// Gap between stacked action buttons.
const ACTION_GAP: f32 = 14.0;
/// Dead zone — ignore knob movement below this fraction of MAX_TRAVEL.
const DEAD_ZONE: f32 = 0.1;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct VirtualJoystickPlugin;

impl Plugin for VirtualJoystickPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<VirtualJoystickState>();
        app.init_resource::<JoystickDrag>();
        app.add_systems(Startup, spawn_joystick_ui);
        app.add_systems(Update, (handle_joystick_input, handle_action_buttons));
    }
}

// ---------------------------------------------------------------------------
// Spawn UI
// ---------------------------------------------------------------------------

fn spawn_joystick_ui(mut commands: Commands) {
    // Base: semi-transparent circle, bottom-left
    commands
        .spawn(Node {
            position_type: PositionType::Absolute,
            left: Val::Px(MARGIN),
            bottom: Val::Px(MARGIN),
            width: Val::Px(BASE_SIZE),
            height: Val::Px(BASE_SIZE),
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            border_radius: BorderRadius::all(Val::Percent(50.0)),
            ..default()
        })
        .insert(BackgroundColor(Color::srgba(1.0, 1.0, 1.0, 0.12)))
        .insert(Interaction::default())
        .insert(FocusPolicy::Block)
        .insert(JoystickBase)
        .with_children(|parent| {
            // Knob: smaller circle inside
            parent
                .spawn(Node {
                    width: Val::Px(KNOB_SIZE),
                    height: Val::Px(KNOB_SIZE),
                    border_radius: BorderRadius::all(Val::Percent(50.0)),
                    ..default()
                })
                .insert(BackgroundColor(Color::srgba(1.0, 1.0, 1.0, 0.35)))
                .insert(JoystickKnob);
        });

    // --- Action buttons (bottom-right) ---
    // Container for vertical button stack
    commands
        .spawn(Node {
            position_type: PositionType::Absolute,
            right: Val::Px(ACTION_MARGIN),
            bottom: Val::Px(ACTION_MARGIN),
            flex_direction: FlexDirection::Column,
            row_gap: Val::Px(ACTION_GAP),
            align_items: AlignItems::Center,
            ..default()
        })
        .with_children(|parent| {
            // Action button (top of stack)
            parent
                .spawn((
                    Node {
                        width: Val::Px(ACTION_BTN_SIZE),
                        height: Val::Px(ACTION_BTN_SIZE),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border_radius: BorderRadius::all(Val::Percent(50.0)),
                        ..default()
                    },
                    BackgroundColor(Color::srgba(0.9, 0.6, 0.2, 0.25)),
                    Interaction::default(),
                    FocusPolicy::Block,
                    ActionButton,
                ))
                .with_child((
                    Text::new("ACT".to_string()),
                    TextFont {
                        font_size: 14.0,
                        ..default()
                    },
                    TextColor(Color::srgba(1.0, 1.0, 1.0, 0.7)),
                ));
            // Jump button (bottom of stack)
            parent
                .spawn((
                    Node {
                        width: Val::Px(ACTION_BTN_SIZE),
                        height: Val::Px(ACTION_BTN_SIZE),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border_radius: BorderRadius::all(Val::Percent(50.0)),
                        ..default()
                    },
                    BackgroundColor(Color::srgba(0.3, 0.7, 1.0, 0.25)),
                    Interaction::default(),
                    FocusPolicy::Block,
                    JumpButton,
                ))
                .with_child((
                    Text::new("JMP".to_string()),
                    TextFont {
                        font_size: 14.0,
                        ..default()
                    },
                    TextColor(Color::srgba(1.0, 1.0, 1.0, 0.7)),
                ));
        });
}

// ---------------------------------------------------------------------------
// Action button handler
// ---------------------------------------------------------------------------

fn handle_action_buttons(
    jump_query: Query<&Interaction, With<JumpButton>>,
    action_query: Query<&Interaction, (With<ActionButton>, Without<JumpButton>)>,
    mut joystick_state: ResMut<VirtualJoystickState>,
) {
    if let Ok(interaction) = jump_query.single() {
        if *interaction == Interaction::Pressed {
            joystick_state.jump_requested = true;
        }
    }
    if let Ok(interaction) = action_query.single() {
        if *interaction == Interaction::Pressed {
            joystick_state.action_requested = true;
        }
    }
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

fn handle_joystick_input(
    mouse_button: Res<ButtonInput<MouseButton>>,
    touches: Res<Touches>,
    windows: Query<&Window, With<PrimaryWindow>>,
    mut drag: ResMut<JoystickDrag>,
    mut joystick_state: ResMut<VirtualJoystickState>,
    base_query: Query<&Interaction, With<JoystickBase>>,
    mut knob_query: Query<&mut Node, (With<JoystickKnob>, Without<JoystickBase>)>,
) {
    let Ok(window) = windows.single() else {
        return;
    };

    let base_center = Vec2::new(
        MARGIN + BASE_SIZE / 2.0,
        window.height() - MARGIN - BASE_SIZE / 2.0,
    );

    // ---- Touch-based drag (tracks a specific finger) ----

    // Check if the tracked touch is still active
    if let Some(tid) = drag.touch_id {
        if let Some(touch) = touches.get_pressed(tid) {
            // Still held — update position
            update_joystick(
                touch.position(),
                &mut drag,
                &mut joystick_state,
                &mut knob_query,
            );
            joystick_state.pointer_captured = true;
            return;
        }
        // Touch released — end drag
        reset_joystick(&mut drag, &mut joystick_state, &mut knob_query);
    }

    // Check for new touch starting on the joystick base area
    for touch in touches.iter_just_pressed() {
        let pos = touch.position();
        if (pos - base_center).length() <= BASE_SIZE / 2.0 {
            drag.active = true;
            drag.touch_id = Some(touch.id());
            drag.center = base_center;
            joystick_state.pointer_captured = true;
            update_joystick(pos, &mut drag, &mut joystick_state, &mut knob_query);
            return;
        }
    }

    // ---- Mouse fallback (desktop) ----

    let base_interaction = base_query
        .single()
        .ok()
        .copied()
        .unwrap_or(Interaction::None);

    joystick_state.pointer_captured = base_interaction != Interaction::None || drag.active;

    if base_interaction == Interaction::Pressed && !drag.active && drag.touch_id.is_none() {
        drag.active = true;
        drag.touch_id = None;
        drag.center = base_center;
    }

    if drag.active && drag.touch_id.is_none() {
        if !mouse_button.pressed(MouseButton::Left) {
            reset_joystick(&mut drag, &mut joystick_state, &mut knob_query);
            return;
        }
        if let Some(pos) = window.cursor_position() {
            update_joystick(pos, &mut drag, &mut joystick_state, &mut knob_query);
        }
    }
}

fn update_joystick(
    pos: Vec2,
    drag: &mut JoystickDrag,
    joystick_state: &mut VirtualJoystickState,
    knob_query: &mut Query<&mut Node, (With<JoystickKnob>, Without<JoystickBase>)>,
) {
    let offset = pos - drag.center;
    let distance = offset.length();
    let clamped_distance = distance.min(MAX_TRAVEL);
    let norm = if distance > 1.0 {
        offset / distance
    } else {
        Vec2::ZERO
    };
    let clamped_offset = norm * clamped_distance;

    // Move the knob visually
    if let Ok(mut knob_node) = knob_query.single_mut() {
        knob_node.left = Val::Px(clamped_offset.x);
        knob_node.top = Val::Px(clamped_offset.y);
    }

    // Apply dead zone
    let intensity = clamped_distance / MAX_TRAVEL;
    if intensity < DEAD_ZONE {
        joystick_state.active = false;
        joystick_state.direction = Vec3::ZERO;
        return;
    }

    // Remap intensity past dead zone to 0..1
    let remapped = (intensity - DEAD_ZONE) / (1.0 - DEAD_ZONE);
    let screen_x = norm.x * remapped;
    let screen_y = -norm.y * remapped;

    // Map screen axes to isometric: right=(1,0,-1), up=(-1,0,-1)
    let iso_dir = Vec3::new(screen_x - screen_y, 0.0, -screen_x - screen_y);

    joystick_state.active = iso_dir.length_squared() > 0.001;
    joystick_state.direction = iso_dir;
}

fn reset_joystick(
    drag: &mut JoystickDrag,
    joystick_state: &mut VirtualJoystickState,
    knob_query: &mut Query<&mut Node, (With<JoystickKnob>, Without<JoystickBase>)>,
) {
    drag.active = false;
    drag.touch_id = None;
    joystick_state.active = false;
    joystick_state.direction = Vec3::ZERO;
    joystick_state.pointer_captured = false;

    if let Ok(mut knob_node) = knob_query.single_mut() {
        knob_node.left = Val::Auto;
        knob_node.top = Val::Auto;
    }
}
