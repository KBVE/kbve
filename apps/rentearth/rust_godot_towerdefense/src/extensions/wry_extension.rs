use godot::classes::display_server::HandleType;
use godot::classes::DisplayServer;
use godot::global::godot_print;

#[cfg(target_os = "macos")]
use crate::macos::macos_wry_browser_options::MacOSWryBrowserOptions;
#[cfg(target_os = "windows")]
use crate::windows::windows_wry_browser_options::WindowsWryBrowserOptions;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use raw_window_handle::{ HasWindowHandle, WindowHandle, HandleError };

pub struct GodotBrowser {
  #[cfg(target_os = "macos")]
  inner: MacOSWryBrowserOptions,

  #[cfg(target_os = "windows")]
  inner: WindowsWryBrowserOptions,
}

impl GodotBrowser {
  pub fn new() -> Self {
    Self {
      #[cfg(target_os = "macos")]
      inner: MacOSWryBrowserOptions {},

      #[cfg(target_os = "windows")]
      inner: WindowsWryBrowserOptions {},
    }
  }
}

impl HasWindowHandle for GodotBrowser {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        #[cfg(target_os = "macos")]
        {
            return self.inner.window_handle();
        }

        #[cfg(target_os = "windows")]
        {
            return self.inner.window_handle();
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Err(HandleError::NotSupported)
        }
    }
}