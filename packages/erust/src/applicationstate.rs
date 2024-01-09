// Define a struct that encapsulates all the state of your application

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
}
