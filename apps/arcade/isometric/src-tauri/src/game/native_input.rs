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
use bevy::window::{
    CursorEntered, CursorLeft, CursorMoved, PrimaryWindow, Window, WindowEvent, WindowResized,
};

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
    PointerEntered {
        x: f64,
        y: f64,
    },
    PointerLeft,
    Wheel {
        dx: f64,
        dy: f64,
    },
    Key {
        code: String,
        pressed: bool,
        repeat: bool,
    },
    /// JS-reported viewport size. innerWidth/Height are CSS pixels (logical);
    /// dpr is devicePixelRatio. This is the authoritative source for the
    /// Bevy Window's resolution — Tauri's inner_size() on macOS returns
    /// NSView bounds in points which doesn't match the actual webview viewport
    /// after user resizes the window.
    Viewport {
        css_w: f64,
        css_h: f64,
        dpr: f64,
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
        app.add_systems(Update, drain_native_input);
    }
}

#[allow(clippy::too_many_arguments)]
fn drain_native_input(
    mut window_q: Query<(Entity, &mut Window), With<PrimaryWindow>>,
    mut cursor_writer: MessageWriter<CursorMoved>,
    mut entered_writer: MessageWriter<CursorEntered>,
    mut left_writer: MessageWriter<CursorLeft>,
    mut button_writer: MessageWriter<MouseButtonInput>,
    mut wheel_writer: MessageWriter<MouseWheel>,
    mut key_writer: MessageWriter<KeyboardInput>,
    mut window_event_writer: MessageWriter<WindowEvent>,
    mut resize_writer: MessageWriter<WindowResized>,
) {
    let Ok((window_entity, mut window)) = window_q.single_mut() else {
        return;
    };
    let events = drain_events();
    if events.is_empty() {
        return;
    }
    static FIRST_BTN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);
    static FIRST_MOVE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);
    for ev in events {
        match ev {
            NativeInputEvent::PointerMove { x, y } => {
                window.set_physical_cursor_position(Some(DVec2::new(x, y)));
                let logical = Vec2::new(x as f32, y as f32) / window.scale_factor();
                let cm = CursorMoved {
                    window: window_entity,
                    position: logical,
                    delta: None,
                };
                cursor_writer.write(cm.clone());
                window_event_writer.write(WindowEvent::CursorMoved(cm));
                if FIRST_MOVE.swap(false, std::sync::atomic::Ordering::Relaxed) {
                    eprintln!(
                        "[native-input] drain first PointerMove physical=({x},{y}) logical={logical:?}"
                    );
                }
            }
            NativeInputEvent::PointerButton { button, pressed } => {
                let Some(bevy_button) = map_mouse_button(button) else {
                    continue;
                };
                let mbi = MouseButtonInput {
                    button: bevy_button,
                    state: if pressed {
                        ButtonState::Pressed
                    } else {
                        ButtonState::Released
                    },
                    window: window_entity,
                };
                button_writer.write(mbi);
                window_event_writer.write(WindowEvent::MouseButtonInput(mbi));
                if FIRST_BTN.swap(false, std::sync::atomic::Ordering::Relaxed) {
                    eprintln!(
                        "[native-input] drain first PointerButton btn={button} pressed={pressed}"
                    );
                }
            }
            NativeInputEvent::PointerEntered { x, y } => {
                window.set_physical_cursor_position(Some(DVec2::new(x, y)));
                let logical = Vec2::new(x as f32, y as f32) / window.scale_factor();
                let entered = CursorEntered {
                    window: window_entity,
                };
                entered_writer.write(entered.clone());
                window_event_writer.write(WindowEvent::CursorEntered(entered));
                let cm = CursorMoved {
                    window: window_entity,
                    position: logical,
                    delta: None,
                };
                cursor_writer.write(cm.clone());
                window_event_writer.write(WindowEvent::CursorMoved(cm));
            }
            NativeInputEvent::PointerLeft => {
                window.set_physical_cursor_position(None);
                let left = CursorLeft {
                    window: window_entity,
                };
                left_writer.write(left.clone());
                window_event_writer.write(WindowEvent::CursorLeft(left));
            }
            NativeInputEvent::Wheel { dx, dy } => {
                let mw = MouseWheel {
                    unit: MouseScrollUnit::Pixel,
                    x: dx as f32,
                    y: dy as f32,
                    window: window_entity,
                    phase: bevy::input::touch::TouchPhase::Moved,
                };
                wheel_writer.write(mw);
                window_event_writer.write(WindowEvent::MouseWheel(mw));
            }
            NativeInputEvent::Viewport { css_w, css_h, dpr } => {
                let scale = dpr as f32;
                let prev_w = window.resolution.width();
                let prev_h = window.resolution.height();
                window.resolution.set_scale_factor(scale);
                window.resolution.set(css_w as f32, css_h as f32);
                if (prev_w - css_w as f32).abs() > 0.5 || (prev_h - css_h as f32).abs() > 0.5 {
                    let resized = WindowResized {
                        window: window_entity,
                        width: css_w as f32,
                        height: css_h as f32,
                    };
                    resize_writer.write(resized.clone());
                    window_event_writer.write(WindowEvent::WindowResized(resized));
                }
                static FIRST_VP: std::sync::atomic::AtomicBool =
                    std::sync::atomic::AtomicBool::new(true);
                if FIRST_VP.swap(false, std::sync::atomic::Ordering::Relaxed) {
                    eprintln!(
                        "[native-input] drain first Viewport css=({css_w},{css_h}) dpr={dpr}"
                    );
                }
            }
            NativeInputEvent::Key {
                code,
                pressed,
                repeat,
            } => {
                let Some(key_code) = map_key_code(&code) else {
                    continue;
                };
                let ki = KeyboardInput {
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
                };
                key_writer.write(ki.clone());
                window_event_writer.write(WindowEvent::KeyboardInput(ki));
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
