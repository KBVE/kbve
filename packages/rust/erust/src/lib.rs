#![warn(clippy::all)]

pub mod ironatom;
pub mod applicationstate;
pub mod widgets;
pub mod state;

pub use ironatom::*;
pub use applicationstate::*;
pub use widgets::*;
pub use state::*;


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appstate_accessible_from_lib() {
        let state = AppState::new();
        assert_eq!(state.counter, 1);
    }

    #[test]
    fn darken_image_accessible_from_lib() {
        use image::{RgbaImage, Rgba, DynamicImage};
        let img = RgbaImage::from_pixel(1, 1, Rgba([100, 100, 100, 255]));
        let dynamic = DynamicImage::ImageRgba8(img);
        let darkened = darken_image(&dynamic, 0.5);
        assert_eq!(darkened.get_pixel(0, 0)[0], 50);
    }
}
