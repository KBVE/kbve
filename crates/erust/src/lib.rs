#![warn(clippy::all)]

#[cfg(feature = "egui")]
pub mod applicationstate;
#[cfg(feature = "egui")]
pub mod ironatom;
pub mod state;
pub mod supabase;
#[cfg(feature = "egui")]
pub mod widgets;

#[cfg(feature = "tauri")]
pub mod tauri;

#[cfg(feature = "egui")]
pub use applicationstate::*;
#[cfg(feature = "egui")]
pub use ironatom::*;
pub use state::*;
pub use supabase::*;
#[cfg(feature = "egui")]
pub use widgets::*;

#[cfg(feature = "tauri")]
pub use tauri::*;

#[cfg(all(test, feature = "egui"))]
mod tests {
    use super::*;

    #[test]
    fn appstate_accessible_from_lib() {
        let state = AppState::new();
        assert_eq!(state.counter, 1);
    }

    #[test]
    fn darken_image_accessible_from_lib() {
        use image::{DynamicImage, Rgba, RgbaImage};
        let img = RgbaImage::from_pixel(1, 1, Rgba([100, 100, 100, 255]));
        let dynamic = DynamicImage::ImageRgba8(img);
        let darkened = darken_image(&dynamic, 0.5);
        assert_eq!(darkened.get_pixel(0, 0)[0], 50);
    }
}
