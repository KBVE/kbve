use bevy_app::App;

use super::{InputEvent, SurfaceRenderer};
use crate::handle::MobileWindow;

/// Engine seam for hosting a Bevy game on the native surface.
///
/// This drives a Bevy `App` once per display-link / Choreographer tick. The
/// surface handoff (mounting a `RawHandleWrapper` built from [`MobileWindow`]
/// onto the primary window + `RenderCreation::Manual`, mirroring
/// `apps/kbve/isometric/src-tauri/src/renderer.rs` and `tauri_plugin.rs`) and
/// the isometric `GamePluginGroup` are wired when the game crate exposes a
/// no-tauri mobile entry. Until then this hosts a headless app so the FFI +
/// frame-loop contract is exercised end-to-end.
pub struct BevyRenderer {
    app: App,
    window: MobileWindow,
    width: u32,
    height: u32,
    paused: bool,
}

impl BevyRenderer {
    pub fn new(window: MobileWindow, width: u32, height: u32) -> Result<Self, String> {
        let app = App::new();
        Ok(Self {
            app,
            window,
            width: width.max(1),
            height: height.max(1),
            paused: false,
        })
    }

    pub fn window(&self) -> MobileWindow {
        self.window
    }
}

impl SurfaceRenderer for BevyRenderer {
    fn resize(&mut self, width: u32, height: u32) {
        self.width = width.max(1);
        self.height = height.max(1);
    }

    fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        if self.paused {
            return Ok(());
        }
        self.app.update();
        Ok(())
    }

    fn input(&mut self, _event: InputEvent) {}

    fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
    }
}
