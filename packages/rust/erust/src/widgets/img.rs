use image::{self, DynamicImage, Rgba, RgbaImage};
use ehttp::{Request, Response};
use egui::{
	ColorImage,
	Context as EguiContext,
	TextureHandle,
	TextureFilter,
	TextureOptions,
};
use base64::Engine;

/// Structs
#[derive(Debug)]
pub enum ImageError {
	NetworkError(String),
	ImageProcessing(image::ImageError),
	IoError(std::io::Error),
}

impl From<image::ImageError> for ImageError {
	fn from(err: image::ImageError) -> Self {
		ImageError::ImageProcessing(err)
	}
}

/// Loaders

pub fn dev_load_image_from_base64(base64_string: &str) -> Result<DynamicImage, ImageError> {
    let image_data = base64::engine::general_purpose::STANDARD.decode(base64_string)
        .map_err(|e| ImageError::IoError(std::io::Error::new(std::io::ErrorKind::InvalidData, e)))?;

    let image = image::load_from_memory(&image_data)?;
    Ok(image)
}

/// Asynchronously loads an image from the given URL.
pub fn load_image_from_url<F>(url: &str, callback: F)
	where F: FnOnce(Result<DynamicImage, ImageError>) + Send + 'static
{
	let request = Request::get(url);
	ehttp::fetch(request, move |result| {
		match result {
			Ok(response) => on_image_loaded(response, callback),
			Err(error) => {
				callback(
					Err(
						ImageError::NetworkError(
							format!("HTTP request failed: {}", error)
						)
					)
				);
			}
		}
	});
}

/// Loads an image from the given file path.
pub fn load_image_from_path(
	path: &str
) -> Result<DynamicImage, image::ImageError> {
	image::open(path)
}

/// Darkens the given image by the specified factor.
pub fn darken_image(image: &DynamicImage, factor: f32) -> RgbaImage {
	let mut darkened_image = image.to_rgba8();

	for (_x, _y, pixel) in darkened_image.enumerate_pixels_mut() {
		let [r, g, b, a] = pixel.0;
		*pixel = Rgba([
			darken_channel(r, factor),
			darken_channel(g, factor),
			darken_channel(b, factor),
			a,
		]);
	}

	darkened_image
}

/// Helper function to darken a single color channel.
fn darken_channel(channel: u8, factor: f32) -> u8 {
	((channel as f32) * factor).min(255.0) as u8
}

fn on_image_loaded(
    response: Response,
    callback: impl FnOnce(Result<DynamicImage, ImageError>)
) {
    if response.status == 200 {
        if response.bytes.is_empty() {
            callback(Err(ImageError::NetworkError("Empty response".to_string())));
        } else {
            let result = image::load_from_memory(&response.bytes)
                .map_err(ImageError::from);
            callback(result);
        }
    } else {
        callback(Err(ImageError::NetworkError(format!("HTTP error: {}", response.status))));
    }
}

/// Creates an `egui` texture from an RGBA image.
pub fn create_egui_texture_from_image(
	egui_ctx: &EguiContext,
	image: RgbaImage
) -> TextureHandle {
	let size = [image.width() as _, image.height() as _];

	let texture_options = TextureOptions {
		magnification: TextureFilter::Linear,
		minification: TextureFilter::Linear,
		..Default::default()
	};

	egui_ctx.load_texture(
		"loaded_image",
		ColorImage::from_rgba_unmultiplied(size, &image),
		texture_options
	)
}
