use godot::prelude::*;
use core::ffi::c_void;
use godot::classes::{CanvasLayer, Window, DisplayServer};
use godot::classes::display_server::HandleType;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{ HWND, COLORREF };
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
  GetForegroundWindow,
  GetWindowLongW,
  SetLayeredWindowAttributes,
  SetWindowLongW,
  GWL_EXSTYLE,
  LWA_ALPHA,
  WS_EX_LAYERED,
};

#[cfg(target_os = "windows")]
pub fn set_windows_opacity(transparency_value: f64, gui_manager: &Gd<CanvasLayer>) {
  unsafe {
    let hwnd: HWND = HWND(DisplayServer::singleton().window_get_native_handle(HandleType::WINDOW_HANDLE) as *mut c_void);
    if hwnd.0.is_null() {
      godot_print!("[Windows] ERROR: Failed to get active window handle.");
      return;
    }

    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
    SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | (WS_EX_LAYERED.0 as i32));

    let alpha_value = (transparency_value.clamp(0.0, 1.0) * 255.0) as u8;

    if SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha_value, LWA_ALPHA).is_err() {
      godot_print!("[Windows] ERROR: Failed to set window opacity.");
    } else {
      godot_print!(
        "[Windows] Window opacity set to {} (alpha {}).",
        transparency_value,
        alpha_value
      );
    }
  }
}
