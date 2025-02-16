use godot::prelude::*;
use godot::classes::{ CanvasLayer, ICanvasLayer, IControl };

#[cfg(any(target_os = "macos", target_os = "windows"))]
use crate::extensions::wry_extension::GodotBrowser;

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct BrowserManager {
  base: Base<CanvasLayer>,

  #[cfg(any(target_os = "macos", target_os = "windows"))]
  browser: Option<Gd<GodotBrowser>>,
}

#[godot_api]
impl ICanvasLayer for BrowserManager {
  fn init(base: Base<Self::Base>) -> Self {
    Self {
      base,
      #[cfg(any(target_os = "macos", target_os = "windows"))]
      browser: Some(Gd::from_init_fn(|base| GodotBrowser::init(base))),

      #[cfg(not(any(target_os = "macos", target_os = "windows")))]
      browser: None,
    }
  }

  fn ready(&mut self) {
    godot_print!("[BrowserManager] Ready!");

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
      // use raw_window_handle::HasWindowHandle;
      let browser_clone = self.browser.clone();
      {
        let mut base = self.base_mut();
        base.add_child(&browser_clone.expect("failed to updoot browser").upcast::<Node>());
      }

      if let Some(browser_gd) = &self.browser {
          let browser = browser_gd.bind();
          if browser.is_initialized() {
            godot_print!("[BrowserManager] Browser initialized.");
          } else {
            godot_error!("[BrowserManager] WebView failed to initialize.");
          }
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
