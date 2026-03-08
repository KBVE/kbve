use std::sync::Mutex;

use bevy::input::keyboard::KeyboardInput;
use bevy::input::mouse::{MouseButtonInput, MouseWheel};
use bevy::input::ButtonState;
use bevy::prelude::*;
use bevy::window::PrimaryWindow;

// ---------------------------------------------------------------------------
// Bridged cursor position (replaces window.cursor_position() since we
// skip WinitPlugin and can't update the Window's internal cursor state)
// ---------------------------------------------------------------------------

#[derive(Resource, Default)]
pub struct BridgedCursorPosition {
    pub position: Option<Vec2>,
}

// ---------------------------------------------------------------------------
// Input frame from JavaScript
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct InputFrame {
    pub keys_pressed: Vec<KeyCode>,
    pub keys_released: Vec<KeyCode>,
    pub cursor_x: f32,
    pub cursor_y: f32,
    pub cursor_valid: bool,
    pub mouse_buttons_pressed: Vec<MouseButton>,
    pub mouse_buttons_released: Vec<MouseButton>,
    pub scroll_delta_y: f32,
}

pub static INPUT_BUFFER: Mutex<Option<InputFrame>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Public API called from Tauri command handler
// ---------------------------------------------------------------------------

pub fn receive_input(
    keys_pressed: Vec<String>,
    keys_released: Vec<String>,
    cursor_x: f32,
    cursor_y: f32,
    cursor_valid: bool,
    mouse_pressed: Vec<u8>,
    mouse_released: Vec<u8>,
    scroll_y: f32,
) {
    let frame = InputFrame {
        keys_pressed: keys_pressed
            .iter()
            .filter_map(|k| js_to_keycode(k))
            .collect(),
        keys_released: keys_released
            .iter()
            .filter_map(|k| js_to_keycode(k))
            .collect(),
        cursor_x,
        cursor_y,
        cursor_valid,
        mouse_buttons_pressed: mouse_pressed.iter().map(|&b| js_to_mouse_button(b)).collect(),
        mouse_buttons_released: mouse_released
            .iter()
            .map(|&b| js_to_mouse_button(b))
            .collect(),
        scroll_delta_y: scroll_y,
    };
    *INPUT_BUFFER.lock().unwrap() = Some(frame);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct InputBridgePlugin;

impl Plugin for InputBridgePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<BridgedCursorPosition>();
        app.add_systems(
            PreUpdate,
            inject_input_from_ipc.before(bevy::input::InputSystems),
        );
    }
}

// ---------------------------------------------------------------------------
// System: reads INPUT_BUFFER and writes Bevy input messages
// ---------------------------------------------------------------------------

fn inject_input_from_ipc(
    mut keyboard_writer: MessageWriter<KeyboardInput>,
    mut mouse_button_writer: MessageWriter<MouseButtonInput>,
    mut mouse_wheel_writer: MessageWriter<MouseWheel>,
    mut cursor_pos: ResMut<BridgedCursorPosition>,
    window_query: Query<Entity, With<PrimaryWindow>>,
) {
    let frame = INPUT_BUFFER.lock().unwrap().take();
    let Some(frame) = frame else { return };
    let Ok(window_entity) = window_query.single() else {
        return;
    };

    // Keyboard
    for key in frame.keys_pressed {
        keyboard_writer.write(KeyboardInput {
            key_code: key,
            logical_key: bevy::input::keyboard::Key::Unidentified(
                bevy::input::keyboard::NativeKey::Unidentified,
            ),
            state: ButtonState::Pressed,
            text: None,
            repeat: false,
            window: window_entity,
        });
    }
    for key in frame.keys_released {
        keyboard_writer.write(KeyboardInput {
            key_code: key,
            logical_key: bevy::input::keyboard::Key::Unidentified(
                bevy::input::keyboard::NativeKey::Unidentified,
            ),
            state: ButtonState::Released,
            text: None,
            repeat: false,
            window: window_entity,
        });
    }

    // Cursor position
    if frame.cursor_valid {
        cursor_pos.position = Some(Vec2::new(frame.cursor_x, frame.cursor_y));
    }

    // Mouse buttons
    for btn in frame.mouse_buttons_pressed {
        mouse_button_writer.write(MouseButtonInput {
            button: btn,
            state: ButtonState::Pressed,
            window: window_entity,
        });
    }
    for btn in frame.mouse_buttons_released {
        mouse_button_writer.write(MouseButtonInput {
            button: btn,
            state: ButtonState::Released,
            window: window_entity,
        });
    }

    // Scroll wheel
    if frame.scroll_delta_y != 0.0 {
        mouse_wheel_writer.write(MouseWheel {
            unit: bevy::input::mouse::MouseScrollUnit::Line,
            x: 0.0,
            y: frame.scroll_delta_y,
            window: window_entity,
        });
    }
}

// ---------------------------------------------------------------------------
// JS key code to Bevy KeyCode conversion
// ---------------------------------------------------------------------------

fn js_to_keycode(code: &str) -> Option<KeyCode> {
    match code {
        "KeyW" => Some(KeyCode::KeyW),
        "KeyA" => Some(KeyCode::KeyA),
        "KeyS" => Some(KeyCode::KeyS),
        "KeyD" => Some(KeyCode::KeyD),
        "KeyE" => Some(KeyCode::KeyE),
        "KeyQ" => Some(KeyCode::KeyQ),
        "KeyR" => Some(KeyCode::KeyR),
        "KeyF" => Some(KeyCode::KeyF),
        "KeyI" => Some(KeyCode::KeyI),
        "Space" => Some(KeyCode::Space),
        "Escape" => Some(KeyCode::Escape),
        "Enter" => Some(KeyCode::Enter),
        "Tab" => Some(KeyCode::Tab),
        "ShiftLeft" => Some(KeyCode::ShiftLeft),
        "ShiftRight" => Some(KeyCode::ShiftRight),
        "ControlLeft" => Some(KeyCode::ControlLeft),
        "ControlRight" => Some(KeyCode::ControlRight),
        "AltLeft" => Some(KeyCode::AltLeft),
        "AltRight" => Some(KeyCode::AltRight),
        "ArrowUp" => Some(KeyCode::ArrowUp),
        "ArrowDown" => Some(KeyCode::ArrowDown),
        "ArrowLeft" => Some(KeyCode::ArrowLeft),
        "ArrowRight" => Some(KeyCode::ArrowRight),
        "Digit1" => Some(KeyCode::Digit1),
        "Digit2" => Some(KeyCode::Digit2),
        "Digit3" => Some(KeyCode::Digit3),
        "Digit4" => Some(KeyCode::Digit4),
        "Digit5" => Some(KeyCode::Digit5),
        "Digit6" => Some(KeyCode::Digit6),
        "Digit7" => Some(KeyCode::Digit7),
        "Digit8" => Some(KeyCode::Digit8),
        "Digit9" => Some(KeyCode::Digit9),
        "Digit0" => Some(KeyCode::Digit0),
        _ => None,
    }
}

fn js_to_mouse_button(button: u8) -> MouseButton {
    match button {
        0 => MouseButton::Left,
        1 => MouseButton::Middle,
        2 => MouseButton::Right,
        _ => MouseButton::Other(button as u16),
    }
}
