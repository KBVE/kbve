#[cfg(target_os = "macos")]
use std::ptr::NonNull;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
#[cfg(target_os = "macos")]
use std::mem::transmute;
#[cfg(target_os = "macos")]
use godot::prelude::*;
#[cfg(target_os = "macos")]
use godot::classes::{ DisplayServer };
#[cfg(target_os = "macos")]
use godot::classes::display_server::HandleType;
#[cfg(target_os = "macos")]
use raw_window_handle::{
  AppKitWindowHandle,
  WindowHandle,
  RawWindowHandle,
  HasWindowHandle,
  HandleError,
};


#[cfg(target_os = "macos")]
pub struct MacOSWryBrowserOptions;

#[cfg(target_os = "macos")]
impl MacOSWryBrowserOptions {
  pub fn get_window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
    let display_server = DisplayServer::singleton();
    let window_handle = display_server.window_get_native_handle(HandleType::WINDOW_VIEW);
    unsafe {
      Ok(
        WindowHandle::borrow_raw(
          RawWindowHandle::AppKit(
            AppKitWindowHandle::new({
              let ptr: *mut c_void = transmute(window_handle);
              NonNull::new(ptr).expect("Id<T> should never be null")
            })
          )
        )
      )
    }
  }

  pub fn resize_window(&self, width: i32, height: i32) {
    let mut display_server = DisplayServer::singleton();
    display_server.window_set_size(Vector2i::new(width, height));
    godot_print!("[MacOSWryBrowserOptions] Window resized to {}x{}", width, height);
  }
}

#[cfg(target_os = "macos")]
impl HasWindowHandle for MacOSWryBrowserOptions {
  fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
    godot_print!("[BrowserManager] -> [MacOSWryBrowserOptions] Window Handle");
    self.get_window_handle()
  }
}
