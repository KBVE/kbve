use godot::classes::display_server::HandleType;
use godot::classes::DisplayServer;
use godot::global::godot_print;

#[cfg(target_os = "macos")]
use crate::macos_wry_browser_options::MacOSWryBrowserOptions;
#[cfg(target_os = "windows")]
use crate::windows_wry_browser_options::WindowsWryBrowserOptions;

pub struct GodotBrowser;

impl GodotBrowser {
    #[cfg(target_os = "macos")]
    pub fn new() -> MacOSWryBrowserOptions {
        MacOSWryBrowserOptions
    }

    #[cfg(target_os = "windows")]
    pub fn new() -> WindowsWryBrowserOptions {
        WindowsWryBrowserOptions
    }

}