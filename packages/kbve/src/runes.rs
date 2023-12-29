use diesel::prelude::*;

use axum::{
	http::{ StatusCode, HeaderMap },
	response::{ Json, IntoResponse, Response },
};

use serde::{ Serialize, Deserialize };

use dashmap::DashMap;

use once_cell::sync::Lazy;

use std::sync::{ Arc, OnceLock };

use crate::{ spellbook_sanitize_fields };

//?         [GLOBALS]
pub type GlobalStore = DashMap<String, String>;
pub static GLOBAL: OnceLock<Arc<GlobalStore>> = OnceLock::new();

//?         [RUNES]

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenRune {
	pub ulid: String,
	pub email: String,
	pub username: String,
	pub iat: usize,
	pub exp: usize,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct APIRune {
	pub sub: String,
	pub iat: usize,
	pub exp: usize,
	pub key: String,
	pub uid: String,
	pub kbve: String,
}

//?         [Schema]

#[derive(Debug, Deserialize)]
pub struct LoginUserSchema {
	pub email: String,
	pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterUserSchema {
	pub username: String,
	pub email: String,
	pub password: String,
	pub captcha: String,
}

/**
	- UpdateProfileSchema is a struct used to represent the data for updating a user profile. 
	Each field is optional, allowing partial updates.
	- It implements AsChangeset and Queryable from Diesel to facilitate database operations, 
	and Serialize and Deserialize from Serde for JSON (de)serialization.
	- The sanitize method is responsible for cleaning and validating the fields. 
	It likely performs operations like trimming, escaping, or validating the format.
	- extract_usernames method further processes specific fields (like github, instagram, and unsplash) to extract meaningful information, such as usernames or IDs. 
	If the extraction process fails (e.g., if the input is invalid), the corresponding field is reset to an empty string to avoid storing invalid data.
	**/

// Derive macros to add functionality to the UpdateProfileSchema struct.
#[derive(AsChangeset, Queryable, Serialize, Deserialize, Clone)]
// Specifies the corresponding table name in the database for the Diesel ORM.
#[diesel(table_name = profile)]
pub struct UpdateProfileSchema {
	// Define optional fields for the user profile.
	// Option is used to represent that each field might or might not be present.
	pub name: Option<String>,
	pub bio: Option<String>,
	pub unsplash: Option<String>,
	pub github: Option<String>,
	pub instagram: Option<String>,
	pub discord: Option<String>,
}

// Implement methods for the UpdateProfileSchema struct.
impl UpdateProfileSchema {
	// Define a method named `sanitize` to clean and validate the fields.
	pub fn sanitize(&mut self) {
		// Sanitize the fields using a custom macro or function.
		// This likely includes trimming whitespace, escaping special characters, etc.
		spellbook_sanitize_fields!(
			self,
			bio,
			name,
			unsplash,
			github,
			instagram,
			discord
		);
		// Further process specific fields to extract usernames or IDs.
		self.extract_usernames();
	}

	// Define a method to extract and validate usernames or IDs from certain fields.
	fn extract_usernames(&mut self) {
		// For the GitHub field, extract the username and validate it.
		if let Some(ref mut github) = self.github {
			if
				let Some(username) =
					crate::utility::extract_github_username(github)
			{
				*github = username;
			} else {
				// If the input is invalid, reset the field to an empty string.
				*github = String::new();
			}
		}
		// Similar logic for Instagram.
		if let Some(ref mut instagram) = self.instagram {
			if
				let Some(username) =
					crate::utility::extract_instagram_username(instagram)
			{
				*instagram = username;
			} else {
				*instagram = String::new();
			}
		}

		// Similar logic for Unsplash.
		if let Some(ref mut unsplash) = self.unsplash {
			if
				let Some(url) =
					crate::utility::extract_unsplash_photo_id(unsplash)
			{
				*unsplash = url;
			} else {
				*unsplash = String::new();
			}
		}
	}
}


// Define a struct called `ShieldWallSchema` with Serde's derive macros for serialization and deserialization.
// This will allow instances of ShieldWallSchema to be easily converted to/from JSON (or other formats).
#[derive(Serialize, Deserialize, Clone)]
pub struct ShieldWallSchema {
	// Define a field `action` which is an Option type that can hold a String.
	// Option is used here to represent that the action might or might not be present.
	pub action: Option<String>,
}

impl ShieldWallSchema {
	pub async fn execute(&self) -> impl IntoResponse {
		match &self.action {
			Some(action) =>
				match action.as_str() {
					"deploy" => {
						// Call the function and await its response
						let response: axum::response::Response = shieldwall_action_portainer_stack_deploy().await.into_response();
						response
					}
					_ =>
						(
							StatusCode::BAD_REQUEST,
							Json(
								serde_json::json!({"error": "Unknown action"})
							),
						).into_response(),
				}
			None =>
				(
					StatusCode::BAD_REQUEST,
					Json(serde_json::json!({"error": "No action provided"})),
				).into_response(),
		}
	}
}



//?         [Response]

#[derive(Serialize, Deserialize, Clone)]
pub struct WizardResponse {
	pub data: serde_json::Value,
	pub message: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct CaptchaResponse {
	success: bool,
}

impl IntoResponse for WizardResponse {
	fn into_response(self) -> Response {
		// You can customize the status code and response format as needed
		let status_code = StatusCode::OK; // Example status code
		let json_body = Json(self); // Convert the struct into a JSON body

		(status_code, json_body).into_response()
	}
}
