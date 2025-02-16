use godot::prelude::*;
use godot::classes::{CanvasLayer, ICanvasLayer};

#[derive(GodotClass)]
#[class(base = CanvasLayer)]
pub struct BrowserManager {
    base: Base<CanvasLayer>,

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    browser: Option<crate::wry_extension::GodotBrowser>,
}
