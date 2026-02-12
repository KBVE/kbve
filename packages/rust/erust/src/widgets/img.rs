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

#[cfg(test)]
mod tests {
	use super::*;
	use image::{DynamicImage, RgbaImage, Rgba};
	use base64::Engine;

	#[test]
	fn darken_channel_zero_factor() {
		assert_eq!(darken_channel(255, 0.0), 0);
		assert_eq!(darken_channel(128, 0.0), 0);
		assert_eq!(darken_channel(0, 0.0), 0);
	}

	#[test]
	fn darken_channel_full_factor() {
		assert_eq!(darken_channel(255, 1.0), 255);
		assert_eq!(darken_channel(128, 1.0), 128);
		assert_eq!(darken_channel(0, 1.0), 0);
	}

	#[test]
	fn darken_channel_half_factor() {
		assert_eq!(darken_channel(200, 0.5), 100);
		assert_eq!(darken_channel(255, 0.5), 127);
		assert_eq!(darken_channel(1, 0.5), 0);
	}

	#[test]
	fn darken_channel_clamps_at_255() {
		// Factor > 1 should still clamp to 255
		assert_eq!(darken_channel(255, 2.0), 255);
	}

	#[test]
	fn darken_image_preserves_alpha() {
		let mut img = RgbaImage::new(2, 2);
		img.put_pixel(0, 0, Rgba([200, 100, 50, 255]));
		img.put_pixel(1, 0, Rgba([100, 100, 100, 128]));
		img.put_pixel(0, 1, Rgba([0, 0, 0, 0]));
		img.put_pixel(1, 1, Rgba([255, 255, 255, 200]));

		let dynamic = DynamicImage::ImageRgba8(img);
		let darkened = darken_image(&dynamic, 0.5);

		// Alpha channels should be unchanged
		assert_eq!(darkened.get_pixel(0, 0)[3], 255);
		assert_eq!(darkened.get_pixel(1, 0)[3], 128);
		assert_eq!(darkened.get_pixel(0, 1)[3], 0);
		assert_eq!(darkened.get_pixel(1, 1)[3], 200);

		// RGB channels should be halved
		assert_eq!(darkened.get_pixel(0, 0)[0], 100);
		assert_eq!(darkened.get_pixel(0, 0)[1], 50);
		assert_eq!(darkened.get_pixel(0, 0)[2], 25);
	}

	#[test]
	fn darken_image_factor_one_is_identity() {
		let mut img = RgbaImage::new(1, 1);
		img.put_pixel(0, 0, Rgba([123, 45, 67, 89]));

		let dynamic = DynamicImage::ImageRgba8(img);
		let darkened = darken_image(&dynamic, 1.0);

		assert_eq!(darkened.get_pixel(0, 0), &Rgba([123, 45, 67, 89]));
	}

	#[test]
	fn dev_load_image_from_base64_with_valid_png() {
		let img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(1, 1, Rgba([255, 0, 0, 255])));
		let mut png_bytes: Vec<u8> = Vec::new();
		img.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png).unwrap();

		let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
		let result = dev_load_image_from_base64(&b64);
		assert!(result.is_ok());

		let loaded = result.unwrap().to_rgba8();
		assert_eq!(loaded.width(), 1);
		assert_eq!(loaded.height(), 1);
		assert_eq!(loaded.get_pixel(0, 0)[0], 255); // red
	}

	#[test]
	fn dev_load_image_from_base64_with_invalid_data() {
		let result = dev_load_image_from_base64("not-valid-base64!!!");
		assert!(result.is_err());
	}

	#[test]
	fn dev_load_image_from_base64_with_valid_base64_but_not_image() {
		let b64 = base64::engine::general_purpose::STANDARD.encode(b"hello world");
		let result = dev_load_image_from_base64(&b64);
		assert!(result.is_err());
	}

	#[test]
	fn on_image_loaded_success_with_valid_png() {
		let img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(2, 2, Rgba([0, 255, 0, 255])));
		let mut png_bytes: Vec<u8> = Vec::new();
		img.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png).unwrap();

		let response = Response {
			url: "http://example.com/img.png".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: png_bytes,
			headers: ehttp::Headers::new(&[]),
		};

		let mut called = false;
		on_image_loaded(response, |result| {
			called = true;
			assert!(result.is_ok());
			let img = result.unwrap().to_rgba8();
			assert_eq!(img.width(), 2);
			assert_eq!(img.height(), 2);
		});
		assert!(called);
	}

	#[test]
	fn on_image_loaded_empty_response() {
		let response = Response {
			url: "http://example.com/img.png".to_string(),
			ok: true,
			status: 200,
			status_text: "OK".to_string(),
			bytes: vec![],
			headers: ehttp::Headers::new(&[]),
		};

		on_image_loaded(response, |result| {
			assert!(result.is_err());
		});
	}

	#[test]
	fn on_image_loaded_http_error() {
		let response = Response {
			url: "http://example.com/img.png".to_string(),
			ok: false,
			status: 404,
			status_text: "Not Found".to_string(),
			bytes: vec![],
			headers: ehttp::Headers::new(&[]),
		};

		on_image_loaded(response, |result| {
			assert!(result.is_err());
		});
	}

	#[test]
	fn image_error_from_image_error() {
		let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "test");
		let img_err = image::ImageError::IoError(io_err);
		let err: ImageError = img_err.into();
		assert!(matches!(err, ImageError::ImageProcessing(_)));
	}
}
