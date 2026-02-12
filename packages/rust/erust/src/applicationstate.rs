use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use crate::img::{load_image_from_url, create_egui_texture_from_image, ImageError};
use base64::Engine;

use log::warn;



#[derive(serde::Deserialize, serde::Serialize, Default)]
pub struct AppState {
	pub counter: i32,
	pub username: String,
	pub email: String,
	pub session_id: Option<String>,
	pub bio: String,
	pub avatar_url: Option<String>,
	pub label: String,
	pub value: f32,
	pub is_dark_mode: bool,

	#[serde(skip)]
	pub is_image_loaded: bool,
	#[serde(skip)]
	pub is_loading_image: Arc<AtomicBool>,
	#[serde(skip)]
	pub load_error: Arc<Mutex<Option<String>>>,
	#[serde(skip)]
	pub image_texture: Arc<Mutex<Option<egui::TextureHandle>>>,
}

impl AppState {
	pub fn new() -> Self {
		Self {
			counter: 1,
			username: String::new(),
			email: String::new(),
			session_id: None,
			bio: String::new(),
			avatar_url: None,
			label: "Hello World!".to_owned(),
			value: 2.7,
			is_dark_mode: true,
			is_image_loaded: false,
			is_loading_image: Arc::new(AtomicBool::new(false)),
			load_error: Arc::new(Mutex::new(None)),
			image_texture: Arc::new(Mutex::new(None)),
		}
	}

	pub fn increment_counter(&mut self) {
		self.counter += 1;
	}

	pub fn save(&self, storage: &mut dyn eframe::Storage) {
		if let Ok(serialized) = serde_json::to_string(self) {
			storage.set_string(eframe::APP_KEY, serialized);
		}
	}

	pub fn load(storage: Option<&dyn eframe::Storage>) -> Option<Self> {
		if let Some(storage) = storage {
			if let Some(serialized) = storage.get_string(eframe::APP_KEY) {
				return serde_json::from_str(&serialized).ok();
			}
		}
		None
	}

	pub fn load_image(&mut self, ctx: &egui::Context, url: &str) {
        let texture_handle = self.image_texture.clone();
        let loading_flag = self.is_loading_image.clone();
        let error_flag = self.load_error.clone(); 
    
        loading_flag.store(true, Ordering::Release);
        *error_flag.lock().expect("load_error mutex poisoned") = None;

        let ctx_clone = ctx.clone();
        load_image_from_url(url, move |result| {
            match result {
                Ok(dynamic_image) => {
                    let rgba_image = dynamic_image.to_rgba8();
                    let texture = create_egui_texture_from_image(&ctx_clone, rgba_image);
                    *texture_handle.lock().expect("image_texture mutex poisoned") = Some(texture);
                }
                Err(error) => {
                    warn!("Error loading image: {}", error);
                    *error_flag.lock().expect("load_error mutex poisoned") = Some(match error {
                        ImageError::NetworkError(ref msg) if msg == "Empty response" =>
                            "Image not found or empty response".to_string(),
                        _ => format!("Failed to load image: {}", error),
                    });
                }
            }
            loading_flag.store(false, Ordering::Release);
        });
    }

    pub fn load_image_from_base64(&mut self, ctx: &egui::Context, base64_string: &str) {
        let texture_handle = self.image_texture.clone();
        let loading_flag = self.is_loading_image.clone();
        let error_flag = self.load_error.clone();
    
        loading_flag.store(true, Ordering::Release);
        *error_flag.lock().expect("load_error mutex poisoned") = None;

        let ctx_clone = ctx.clone();

        match base64::engine::general_purpose::STANDARD.decode(base64_string) {
            Ok(image_data) => {
                match image::load_from_memory(&image_data) {
                    Ok(dynamic_image) => {
                        let rgba_image = dynamic_image.to_rgba8();
                        let texture = create_egui_texture_from_image(&ctx_clone, rgba_image);
                        *texture_handle.lock().expect("image_texture mutex poisoned") = Some(texture);
                    }
                    Err(error) => {
                        warn!("Error processing image: {:?}", error);
                        *error_flag.lock().expect("load_error mutex poisoned") = Some(format!("Failed to process image: {:?}", error));
                    }
                }
            }
            Err(error) => {
                warn!("Error decoding Base64: {:?}", error);
                *error_flag.lock().expect("load_error mutex poisoned") = Some(format!("Failed to decode Base64: {:?}", error));
            }
        }
    
        loading_flag.store(false, Ordering::Release);
    }


}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn new_returns_expected_defaults() {
		let state = AppState::new();
		assert_eq!(state.counter, 1);
		assert_eq!(state.label, "Hello World!");
		assert!((state.value - 2.7).abs() < f32::EPSILON);
		assert!(state.is_dark_mode);
		assert!(state.username.is_empty());
		assert!(state.email.is_empty());
		assert!(state.session_id.is_none());
		assert!(state.avatar_url.is_none());
		assert!(!state.is_image_loaded);
	}

	#[test]
	fn default_differs_from_new() {
		let default_state = AppState::default();
		let new_state = AppState::new();
		// Default counter is 0, new() sets it to 1
		assert_eq!(default_state.counter, 0);
		assert_eq!(new_state.counter, 1);
	}

	#[test]
	fn increment_counter_increases_by_one() {
		let mut state = AppState::new();
		assert_eq!(state.counter, 1);
		state.increment_counter();
		assert_eq!(state.counter, 2);
		state.increment_counter();
		assert_eq!(state.counter, 3);
	}

	#[test]
	fn serde_round_trip_preserves_fields() {
		let mut state = AppState::new();
		state.username = "testuser".to_string();
		state.email = "test@example.com".to_string();
		state.counter = 42;
		state.label = "custom label".to_string();
		state.value = 5.5;
		state.is_dark_mode = false;
		state.session_id = Some("session123".to_string());
		state.avatar_url = Some("https://example.com/avatar.png".to_string());

		let json = serde_json::to_string(&state).unwrap();
		let restored: AppState = serde_json::from_str(&json).unwrap();

		assert_eq!(restored.username, "testuser");
		assert_eq!(restored.email, "test@example.com");
		assert_eq!(restored.counter, 42);
		assert_eq!(restored.label, "custom label");
		assert!((restored.value - 5.5).abs() < f32::EPSILON);
		assert!(!restored.is_dark_mode);
		assert_eq!(restored.session_id, Some("session123".to_string()));
		assert_eq!(restored.avatar_url, Some("https://example.com/avatar.png".to_string()));
	}

	#[test]
	fn serde_skipped_fields_reset_on_deserialize() {
		let mut state = AppState::new();
		state.is_image_loaded = true;

		let json = serde_json::to_string(&state).unwrap();
		let restored: AppState = serde_json::from_str(&json).unwrap();

		// is_image_loaded has #[serde(skip)] so it resets to default
		assert!(!restored.is_image_loaded);
	}

	#[test]
	fn load_with_none_storage_returns_none() {
		assert!(AppState::load(None).is_none());
	}
}
