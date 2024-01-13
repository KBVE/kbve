// Define a struct that encapsulates all the state of your application

//  This applicationstate will be migrated to the state library.
//  Making a minor change here to proc another release of `erust` for 0.1.3.
//  Triggering another pipeline test case for the permissions.

use std::sync::{Arc, Mutex};
use crate::img::{load_image_from_url, darken_image, create_egui_texture_from_image, ImageError};
use egui::{Context as EguiContext, TextureHandle};

use log::{info, warn};



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
        match base64::decode(base64_string) {
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
    


	// pub fn start_image_loading(&mut self, ctx: &EguiContext, url: String) {
    //     if !self.is_image_loaded {
    //         let ctx_clone = ctx.clone();

    //         // Spawn an asynchronous task to load and process the image
    //         spawn_task(async move {
    //             match load_image_from_url(&url).await {
    //                 Ok(image) => {
    //                     let dark_image = darken_image(&image, 0.5); // Optionally darken the image
    //                     let texture = create_egui_texture_from_image(&ctx_clone, dark_image);
	// 					eprintln!("Got the image!");
    //                     // Here you need a way to update the original state with the new texture
    //                 },
    //                 Err(e) => {
    //                     eprintln!("Failed to load image: {:?}", e);
    //                 }
    //             }
    //         });

    //         self.is_image_loaded = true; // Prevent re-loading
    //     }
    // }
}
