#[cfg(target_os = "macos")]
mod macos_wry_browser_options {
  use std::ptr::NonNull;
  use godot::prelude::*;
  use godot::classes::{ DisplayServer };
  use godot::classes::display_server::HandleType;
  use raw_window_handle::{ AppKitWindowHandle, WindowHandle, RawWindowHandle, HasWindowHandle };

  pub struct MacOSWryBrowserOptions;

  impl HasWindowHandle for MacOSWryBrowserOptions {
    fn window_handle(&self) -> Result<WindowHandle<'_>, ()> {
      let display_server = DisplayServer::singleton();
      let window_handle = display_server.window_get_native_handle(HandleType::WINDOW_VIEW);
      Ok(
        WindowHandle::borrow_raw(
          RawWindowHandle::AppKit(
            AppKitWindowHandle::new(NonNull::new(window_handle as *mut _).unwrap())
          )
        )
      )
    }
  }
}
