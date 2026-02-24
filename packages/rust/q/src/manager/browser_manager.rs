use crate::debug_print;
use crate::find_game_manager;
use crate::manager::game_manager::GameManager;
use godot::classes::{CanvasLayer, ICanvasLayer, IControl};
use godot::prelude::*;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
use crate::platform::browser::GodotBrowser;

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct BrowserManager {
    base: Base<CanvasLayer>,

    game_manager: Option<Gd<GameManager>>,

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    browser: Option<Gd<GodotBrowser>>,
}

#[godot_api]
impl ICanvasLayer for BrowserManager {
    fn init(base: Base<Self::Base>) -> Self {
        Self {
            base,
            #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
            browser: Some(Gd::from_init_fn(GodotBrowser::init)),

            game_manager: None,
        }
    }

    fn ready(&mut self) {
        find_game_manager!(self);
        #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
        {
            // use raw_window_handle::HasWindowHandle;
            let browser_clone = self.browser.clone();
            {
                let mut base = self.base_mut();
                base.add_child(
                    &browser_clone
                        .expect("failed to updoot browser")
                        .upcast::<Node>(),
                );
                base.set_follow_viewport(true);
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

        {
            let base = self.base_mut();
            if let Some(tree) = base.get_tree() {
                if let Some(mut root) = tree.get_root() {
                    let callable = Callable::from_object_method(
                        &base.clone().upcast::<Node>(),
                        "on_window_resize",
                    );

                    let error = root.connect("size_changed", &callable);
                    if error != godot::global::Error::OK {
                        godot_error!(
                            "[BrowserManager] Failed to connect root size_changed: {:?}",
                            error
                        );
                    } else {
                        godot_print!(
                            "[BrowserManager] Connected root size_changed to on_window_resize."
                        );
                    }
                }
            }
        }
    }
}

#[godot_api]
impl BrowserManager {
    #[func]
    pub fn on_window_resize(&self) {
        godot_print!("[BrowserManager] Browser Event Trigger...");

        #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
        {
            if let Some(ref browser) = self.browser {
                godot_print!("[BrowserManager] Resizing browser after window resize event.");
                browser.bind().resize();
            }
        }
    }

    #[func]
    pub fn open_url(&self, url: GString) {
        #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
        {
            if let Some(ref browser) = self.browser {
                browser.bind().open_url(url.clone());
            } else {
                godot_warn!("[BrowserManager] Browser not initialized. Cannot open URL.");
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            godot_print!("[BrowserManager] Opening URL via JavaScript FFI: {}", url);
        }
    }
}
