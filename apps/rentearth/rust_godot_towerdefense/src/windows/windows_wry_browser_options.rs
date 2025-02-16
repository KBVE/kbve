#[cfg(target_os = "windows")]
mod windows_wry_browser_options {
  use std::num::{ NonZero, NonZeroIsize };
  use godot::prelude::*;
  use godot::classes::{ DisplayServer };
  use godot::classes::display_server::HandleType;
  use raw_window_handle::{
    Win32WindowHandle,
    WindowHandle,
    RawWindowHandle,
    HasWindowHandle,
    HandleError,
  };

  pub struct WindowsWryBrowserOptions;

  impl WindowsWryBrowserOptions {
    pub fn get_window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
      let display_server = DisplayServer::singleton();
      let window_handle = display_server.window_get_native_handle(HandleType::WINDOW_HANDLE);
      let non_zero_window_handle = NonZero::new(window_handle).expect(
        "WindowHandle creation failed"
      );
      unsafe {
        Ok(
          WindowHandle::borrow_raw(
            RawWindowHandle::Win32(
              Win32WindowHandle::new({
                NonZeroIsize::try_from(non_zero_window_handle).expect("Invalid window_handle")
              })
            )
          )
        )
      }
    }

    pub fn resize_window(&self, width: i32, height: i32) {
      let mut display_server = DisplayServer::singleton();
      display_server.window_set_size(Vector2i::new(width, height));
      godot_print!("[WindowsWryBrowserOptions] Window resized to {}x{}", width, height);
    }

  }

  impl HasWindowHandle for WindowsWryBrowserOptions {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
      self.get_window_handle()
    }
  }
}
