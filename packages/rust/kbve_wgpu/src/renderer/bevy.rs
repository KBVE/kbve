use isometric_game::mobile::{self, GameHandle};

use super::{InputEvent, SurfaceRenderer};
use crate::handle::MobileWindow;

const DEFAULT_ASSET_ROOT: &str = "assets";

/// Hosts the Bevy isometric game on the native surface. Builds the game `App`
/// from the provided [`MobileWindow`] and drives one frame per `render()` call.
pub struct BevyRenderer {
    game: GameHandle,
    width: u32,
    height: u32,
    paused: bool,
}

impl BevyRenderer {
    pub fn new(window: MobileWindow, width: u32, height: u32) -> Result<Self, String> {
        Self::with_assets(window, width, height, DEFAULT_ASSET_ROOT)
    }

    pub fn with_assets(
        window: MobileWindow,
        width: u32,
        height: u32,
        asset_root: &str,
    ) -> Result<Self, String> {
        let game = mobile::init_game(window, width.max(1), height.max(1), 1.0, asset_root);
        Ok(Self {
            game,
            width: width.max(1),
            height: height.max(1),
            paused: false,
        })
    }
}

impl SurfaceRenderer for BevyRenderer {
    fn resize(&mut self, width: u32, height: u32) {
        self.width = width.max(1);
        self.height = height.max(1);
    }

    fn render(&mut self) -> Result<(), super::RenderError> {
        if self.paused {
            return Ok(());
        }
        mobile::tick(&mut self.game);
        Ok(())
    }

    fn set_jwt(&mut self, jwt: &str) {
        mobile::sign_in(jwt);
    }

    fn input(&mut self, event: InputEvent) {
        mobile::on_pointer(event.kind, event.x, event.y);
    }

    fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
    }
}
