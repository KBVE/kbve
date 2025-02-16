use godot::prelude::*;
use godot::classes::{ DisplayServer };
use godot::classes::display_server::HandleType;
use core::ffi::c_void;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
  GetWindowLongPtrW,
  GetWindowLongW,
  GWLP_HWNDPARENT,
  GWL_HWNDPARENT,
};

#[cfg(target_os = "windows")]
use std::num::{ NonZero, NonZeroIsize };

#[cfg(target_os = "windows")]
use raw_window_handle::{
  Win32WindowHandle,
  WindowHandle,
  RawWindowHandle,
  HasWindowHandle,
  HandleError,
};

#[cfg(target_os = "windows")]
pub struct WindowsWryBrowserOptions;

#[cfg(target_os = "windows")]
impl WindowsWryBrowserOptions {
  pub fn get_window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
    godot_print!("[WindowsWryBrowserOptions] Fetching native window handle...");

    unsafe {
      let mut hwnd: HWND = HWND(
        DisplayServer::singleton().window_get_native_handle(
          HandleType::WINDOW_HANDLE
        ) as *mut c_void
      );
      if hwnd.0.is_null() {
        godot_error!("[WindowsWryBrowserOptions] ERROR: GetForegroundWindow() returned NULL!");
        return Err(HandleError::Unavailable);
      }
      godot_print!("[WindowsWryBrowserOptions] Successfully retrieved HWND: {:?}", hwnd);
    }
    Err(HandleError::Unavailable)
  }

  pub fn resize_window(&self, width: i32, height: i32) {
    let mut display_server = DisplayServer::singleton();
    display_server.window_set_size(Vector2i::new(width, height));
    godot_print!("[WindowsWryBrowserOptions] Window resized to {}x{}", width, height);
  }
}

#[cfg(target_os = "windows")]
impl HasWindowHandle for WindowsWryBrowserOptions {
  fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
    self.get_window_handle()
  }
}
