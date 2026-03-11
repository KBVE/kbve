use bevy::prelude::*;
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

/// Tracks joystick drag state.
#[derive(Resource, Default)]
struct JoystickDrag {
    active: bool,
    /// Center of the joystick base in logical pixels.
    center: Vec2,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Joystick base diameter in logical pixels.
const BASE_SIZE: f32 = 120.0;
/// Knob diameter in logical pixels.
const KNOB_SIZE: f32 = 48.0;
/// Maximum knob travel from center (in pixels).
const MAX_TRAVEL: f32 = (BASE_SIZE - KNOB_SIZE) / 2.0;
/// Margin from bottom-left corner.
const MARGIN: f32 = 24.0;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct VirtualJoystickPlugin;

impl Plugin for VirtualJoystickPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<VirtualJoystickState>();
        app.init_resource::<JoystickDrag>();
        app.add_systems(Startup, spawn_joystick_ui);
        app.add_systems(Update, handle_joystick_input);
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
    base_query: Query<(&Node, &GlobalTransform), With<JoystickBase>>,
    mut knob_query: Query<&mut Node, (With<JoystickKnob>, Without<JoystickBase>)>,
) {
    let Ok(window) = windows.single() else {
        return;
    };

    // Determine active pointer position (touch takes priority over mouse)
    let pointer_pos = if let Some(touch) = touches.iter().next() {
        Some(touch.position())
    } else {
        window.cursor_position()
    };

    let pointer_pressed =
        !touches.iter().next().is_none() || mouse_button.pressed(MouseButton::Left);
    let pointer_just_pressed = touches.iter_just_pressed().next().is_some()
        || mouse_button.just_pressed(MouseButton::Left);

    // Get joystick base center in screen space
    let Ok((_base_node, _base_gt)) = base_query.single() else {
        return;
    };
    let base_center = Vec2::new(
        MARGIN + BASE_SIZE / 2.0,
        window.height() - MARGIN - BASE_SIZE / 2.0,
    );

    // Start drag if pointer pressed inside the base circle
    if pointer_just_pressed {
        if let Some(pos) = pointer_pos {
            if pos.distance(base_center) <= BASE_SIZE / 2.0 {
                drag.active = true;
                drag.center = base_center;
            }
        }
    }

    // End drag when pointer released
    if !pointer_pressed {
        drag.active = false;
        joystick_state.active = false;
        joystick_state.direction = Vec3::ZERO;

        // Reset knob to center
        if let Ok(mut knob_node) = knob_query.single_mut() {
            knob_node.left = Val::Auto;
            knob_node.top = Val::Auto;
        }
        return;
    }

    // Update joystick while dragging
    if drag.active {
        if let Some(pos) = pointer_pos {
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
                // Knob is centered by flexbox; use margin to offset it
                knob_node.left = Val::Px(clamped_offset.x);
                // Screen Y is down, but we want up = negative Y offset
                knob_node.top = Val::Px(clamped_offset.y);
            }

            // Convert screen direction to isometric world direction.
            // Screen right → isometric (+X, -Z), Screen up → isometric (-X, -Z)
            let intensity = clamped_distance / MAX_TRAVEL; // 0..1 analog
            let screen_x = norm.x * intensity;
            let screen_y = -norm.y * intensity; // flip Y (screen down → world forward)

            // Map screen axes to isometric: right=(1,0,-1), up=(-1,0,-1)
            let iso_dir = Vec3::new(
                screen_x - screen_y, // right component - up component
                0.0,
                -screen_x - screen_y, // negative of both
            );

            joystick_state.active = iso_dir.length_squared() > 0.001;
            joystick_state.direction = iso_dir;
        }
    }
}
