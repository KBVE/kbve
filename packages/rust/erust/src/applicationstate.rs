// Define a struct that encapsulates all the state of your application

//  This applicationstate will be migrated to the state library.
//  Making a minor change here to proc another release of `erust` for 0.1.3.
//  Triggering another pipeline test case for the permissions.
//  Preparing to remove this file.

use std::sync::{Arc, Mutex};
use crate::img::{load_image_from_url, create_egui_texture_from_image, ImageError};
use base64::Engine;

use log::warn;



#[derive(serde::Deserialize, serde::Serialize, Default)]
pub struct AppState {
	// Add fields for each piece of state your app needs
	// For example:
	pub counter: i32,
	// User-related fields
	pub username: String,
	pub email: String,
	pub session_id: Option<String>, // Can be None if not logged in
	pub bio: String,
	pub avatar_url: Option<String>, // URL to the user's avatar image

	// Default Templates
	pub label: String,
	pub value: f32,

	// Dark/Light Mode
	pub is_dark_mode: bool,

	// WASM Background Image
    #[serde(skip)]
    pub is_image_loaded: bool,

	// Image Loading Action Boolean
	pub is_loading_image: Arc<Mutex<bool>>,

    #[serde(skip)]
	// Load Error
	pub load_error:  Arc<Mutex<Option<String>>>,
 

	#[serde(skip)]
	pub image_texture: Arc<Mutex<Option<egui::TextureHandle>>>,


}

impl AppState {
	pub fn new() -> Self {
		Self {
			counter: 1,
			// Initialize other state variables
            username: String::new(),
            email: String::new(),
            session_id: None,
            bio: String::new(),
            avatar_url: None,
			label: "Hello World!".to_owned(),
            value: 2.7,
			is_dark_mode: true, // default value, set to false if you want light mode by default
			is_image_loaded: false,
			is_loading_image: Arc::new(Mutex::new(false)),
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
        // Handle error or log in case of serialization failure
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
    
        // Set loading flag
        *loading_flag.lock().unwrap() = true;
        *error_flag.lock().unwrap() = None;
    
        let ctx_clone = ctx.clone();
        load_image_from_url(url, move |result| {
            match result {
                Ok(dynamic_image) => {
                    let rgba_image = dynamic_image.to_rgba8();
                    let texture = create_egui_texture_from_image(&ctx_clone, rgba_image);
                    *texture_handle.lock().unwrap() = Some(texture);
                }
                Err(error) => {
                    // Log and update error state
                    warn!("Error loading image: {:?}", error);  // Use Debug formatting
                    *error_flag.lock().unwrap() = Some(match error {
                        ImageError::NetworkError(msg) if msg == "Empty response" => 
                            "Image not found or empty response".to_string(),
                        _ => format!("Failed to load image: {:?}", error),
                    });
            
                }
            }
            *loading_flag.lock().unwrap() = false;
        });
    }

    pub fn load_image_from_base64(&mut self, ctx: &egui::Context, base64_string: &str) {
        let texture_handle = self.image_texture.clone();
        let loading_flag = self.is_loading_image.clone();
        let error_flag = self.load_error.clone();
    
        // Set loading flag
        *loading_flag.lock().unwrap() = true;
        *error_flag.lock().unwrap() = None;
    
        let ctx_clone = ctx.clone();
    
        // Decode the Base64 string to bytes
        match base64::engine::general_purpose::STANDARD.decode(base64_string) {
            Ok(image_data) => {
                match image::load_from_memory(&image_data) {
                    Ok(dynamic_image) => {
                        let rgba_image = dynamic_image.to_rgba8();
                        let texture = create_egui_texture_from_image(&ctx_clone, rgba_image);
                        *texture_handle.lock().unwrap() = Some(texture);
                    }
                    Err(error) => {
                        // Log and update error state
                        warn!("Error processing image: {:?}", error);
                        *error_flag.lock().unwrap() = Some(format!("Failed to process image: {:?}", error));
                    }
                }
            }
            Err(error) => {
                // Log and update error state
                warn!("Error decoding Base64: {:?}", error);
                *error_flag.lock().unwrap() = Some(format!("Failed to decode Base64: {:?}", error));
            }
        }
    
        *loading_flag.lock().unwrap() = false;
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
