//! Bridge JS-captured webview events into Bevy's input pipeline for the
//! native Tauri build. Tauri's `WindowEvent` enum doesn't expose pointer or
//! keyboard variants, so the webview consumes the raw stream. JS attaches
//! `window` listeners (capture phase), invokes the matching Tauri command,
//! which pushes a typed `NativeInputEvent` into a static buffer. The Bevy
//! system here drains the buffer once per frame and emits the corresponding
//! Bevy events.
//!
//! WASM has its own canvas-driven winit web backend and bypasses this whole
//! module via cfg.

#![cfg(not(target_arch = "wasm32"))]

use std::sync::{LazyLock, Mutex};

use bevy::input::ButtonState;
use bevy::input::keyboard::{Key, KeyCode, KeyboardInput};
use bevy::input::mouse::{MouseButton, MouseButtonInput, MouseScrollUnit, MouseWheel};
use bevy::math::DVec2;
use bevy::prelude::*;
use bevy::window::{CursorMoved, PrimaryWindow, Window};

use super::phase::GamePhase;

#[derive(Clone, Debug)]
pub enum NativeInputEvent {
    PointerMove {
        x: f64,
        y: f64,
    },
    PointerButton {
        button: u8,
        pressed: bool,
    },
    Wheel {
        dx: f64,
        dy: f64,
    },
    Key {
        code: String,
        pressed: bool,
        repeat: bool,
    },
}

static INPUT_BUFFER: LazyLock<Mutex<Vec<NativeInputEvent>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

pub fn push_event(ev: NativeInputEvent) {
    INPUT_BUFFER.lock().unwrap().push(ev);
}

fn drain_events() -> Vec<NativeInputEvent> {
    std::mem::take(&mut *INPUT_BUFFER.lock().unwrap())
}

pub struct NativeInputPlugin;

impl Plugin for NativeInputPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            drain_native_input.run_if(in_state(GamePhase::Playing)),
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn drain_native_input(
    mut window_q: Query<(Entity, &mut Window), With<PrimaryWindow>>,
    mut cursor_writer: MessageWriter<CursorMoved>,
    mut button_writer: MessageWriter<MouseButtonInput>,
    mut wheel_writer: MessageWriter<MouseWheel>,
    mut key_writer: MessageWriter<KeyboardInput>,
) {
    let Ok((window_entity, mut window)) = window_q.single_mut() else {
        return;
    };
    let events = drain_events();
    if events.is_empty() {
        return;
    }
    for ev in events {
        match ev {
            NativeInputEvent::PointerMove { x, y } => {
                // Bevy's picking + hover systems read Window.physical_cursor_
                // position(), not the CursorMoved event. Sync both so picking
                // works.
                window.set_physical_cursor_position(Some(DVec2::new(x, y)));
                cursor_writer.write(CursorMoved {
                    window: window_entity,
                    position: Vec2::new(x as f32, y as f32) / window.scale_factor(),
                    delta: None,
                });
            }
            NativeInputEvent::PointerButton { button, pressed } => {
                let Some(bevy_button) = map_mouse_button(button) else {
                    continue;
                };
                button_writer.write(MouseButtonInput {
                    button: bevy_button,
                    state: if pressed {
                        ButtonState::Pressed
                    } else {
                        ButtonState::Released
                    },
                    window: window_entity,
                });
            }
            NativeInputEvent::Wheel { dx, dy } => {
                wheel_writer.write(MouseWheel {
                    unit: MouseScrollUnit::Pixel,
                    x: dx as f32,
                    y: dy as f32,
                    window: window_entity,
                });
            }
            NativeInputEvent::Key {
                code,
                pressed,
                repeat,
            } => {
                let Some(key_code) = map_key_code(&code) else {
                    continue;
                };
                key_writer.write(KeyboardInput {
                    key_code,
                    logical_key: Key::Unidentified(bevy::input::keyboard::NativeKey::Unidentified),
                    state: if pressed {
                        ButtonState::Pressed
                    } else {
                        ButtonState::Released
                    },
                    repeat,
                    window: window_entity,
                    text: None,
                });
            }
        }
    }
}

fn map_mouse_button(b: u8) -> Option<MouseButton> {
    match b {
        0 => Some(MouseButton::Left),
        1 => Some(MouseButton::Middle),
        2 => Some(MouseButton::Right),
        3 => Some(MouseButton::Back),
        4 => Some(MouseButton::Forward),
        _ => None,
    }
}

/// Map JS `KeyboardEvent.code` (e.g. "KeyW", "Digit1", "ArrowUp") to a Bevy
/// `KeyCode`. Limited to the keys the game actually binds today — extend as
/// new bindings land. Anything unmapped is silently dropped.
fn map_key_code(code: &str) -> Option<KeyCode> {
    Some(match code {
        // Letters
        "KeyA" => KeyCode::KeyA,
        "KeyB" => KeyCode::KeyB,
        "KeyC" => KeyCode::KeyC,
        "KeyD" => KeyCode::KeyD,
        "KeyE" => KeyCode::KeyE,
        "KeyF" => KeyCode::KeyF,
        "KeyG" => KeyCode::KeyG,
        "KeyH" => KeyCode::KeyH,
        "KeyI" => KeyCode::KeyI,
        "KeyJ" => KeyCode::KeyJ,
        "KeyK" => KeyCode::KeyK,
        "KeyL" => KeyCode::KeyL,
        "KeyM" => KeyCode::KeyM,
        "KeyN" => KeyCode::KeyN,
        "KeyO" => KeyCode::KeyO,
        "KeyP" => KeyCode::KeyP,
        "KeyQ" => KeyCode::KeyQ,
        "KeyR" => KeyCode::KeyR,
        "KeyS" => KeyCode::KeyS,
        "KeyT" => KeyCode::KeyT,
        "KeyU" => KeyCode::KeyU,
        "KeyV" => KeyCode::KeyV,
        "KeyW" => KeyCode::KeyW,
        "KeyX" => KeyCode::KeyX,
        "KeyY" => KeyCode::KeyY,
        "KeyZ" => KeyCode::KeyZ,
        // Digits
        "Digit0" => KeyCode::Digit0,
        "Digit1" => KeyCode::Digit1,
        "Digit2" => KeyCode::Digit2,
        "Digit3" => KeyCode::Digit3,
        "Digit4" => KeyCode::Digit4,
        "Digit5" => KeyCode::Digit5,
        "Digit6" => KeyCode::Digit6,
        "Digit7" => KeyCode::Digit7,
        "Digit8" => KeyCode::Digit8,
        "Digit9" => KeyCode::Digit9,
        // Arrows + space + escape + enter + modifiers
        "ArrowUp" => KeyCode::ArrowUp,
        "ArrowDown" => KeyCode::ArrowDown,
        "ArrowLeft" => KeyCode::ArrowLeft,
        "ArrowRight" => KeyCode::ArrowRight,
        "Space" => KeyCode::Space,
        "Escape" => KeyCode::Escape,
        "Enter" => KeyCode::Enter,
        "Tab" => KeyCode::Tab,
        "Backspace" => KeyCode::Backspace,
        "ShiftLeft" => KeyCode::ShiftLeft,
        "ShiftRight" => KeyCode::ShiftRight,
        "ControlLeft" => KeyCode::ControlLeft,
        "ControlRight" => KeyCode::ControlRight,
        "AltLeft" => KeyCode::AltLeft,
        "AltRight" => KeyCode::AltRight,
        "MetaLeft" => KeyCode::SuperLeft,
        "MetaRight" => KeyCode::SuperRight,
        _ => return None,
    })
}
