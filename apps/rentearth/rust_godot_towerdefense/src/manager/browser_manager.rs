use godot::prelude::*;
use godot::classes::{ CanvasLayer, ICanvasLayer };

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct BrowserManager {
  base: Base<CanvasLayer>,

  #[cfg(any(target_os = "macos", target_os = "windows"))]
  browser: Option<crate::extensions::wry_extension::GodotBrowser>,
}

#[godot_api]
impl ICanvasLayer for BrowserManager {
  fn init(base: Base<Self::Base>) -> Self {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let browser = Some(crate::extensions::wry_extension::GodotBrowser::new());

    Self {
      base,
      #[cfg(any(target_os = "macos", target_os = "windows"))] browser,
    }
  }

  fn ready(&mut self) {
    godot_print!("[BrowserManager] Ready!");

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
      use raw_window_handle::HasWindowHandle;
      if let Some(ref browser) = self.browser {
        let _window_handle = browser
          .window_handle()
          .expect("[BrowserManager] Failed to get window handle");
        godot_print!("[BrowserManager] Browser initialized.");
      }
    }

    #[cfg(target_arch = "wasm32")]
    {
      godot_print!("[BrowserManager] Running on WASM. JavaScript FFI will be used.");
    }
  }
}

#[godot_api]
impl BrowserManager {
  #[func]
  pub fn open_url(&self, url: GString) {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
      if let Some(ref browser) = self.browser {
        godot_print!("[BrowserManager] Opening URL: {} called...", url);
      }
    }

    #[cfg(target_arch = "wasm32")]
    {
      godot_print!("[BrowserManager] Opening URL via JavaScript FFI: {}", url);
    }
  }
}
