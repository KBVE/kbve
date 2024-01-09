// Define a struct that encapsulates all the state of your application
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
}

impl AppState {
	pub fn new() -> Self {
		Self {
			counter: 0,
			// Initialize other state variables
            username: String::new(),
            email: String::new(),
            session_id: None,
            bio: String::new(),
            avatar_url: None,
		}
	}

	pub fn increment_counter(&mut self) {
		self.counter += 1;
	}
}
