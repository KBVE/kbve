use tower_http::cors::CorsLayer;
use axum::{
	response::{ IntoResponse },
	http::{
		header::{ ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderName },
		HeaderValue,
		StatusCode,
		Method,
		Uri,
	},
	Json,
};

use regex::Regex;
use lazy_static::lazy_static;

use uuid::Uuid;
use num_bigint::{ BigUint };

use reqwest::Client;
use serde::{ Deserialize, Serialize };

use std::collections::HashMap;
use std::str::FromStr;

use crate::wh::{ WizardResponse };

lazy_static! {
	pub static ref EMAIL_REGEX: Regex = Regex::new(
		r"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"
	).unwrap();

	pub static ref GITHUB_USERNAME_REGEX: Regex = Regex::new(
		r"github\.com/([a-zA-Z0-9_-]+)"
	).unwrap();

	pub static ref INSTAGRAM_USERNAME_REGEX: Regex = Regex::new(
		r"(?:@|(?:www\.)?instagram\.com/)?(?:@)?([a-zA-Z0-9_](?:[a-zA-Z0-9_.]*[a-zA-Z0-9_])?)"
	).unwrap();

	pub static ref UNSPLASH_PHOTO_ID_REGEX: Regex = Regex::new(
		r"photo-([a-zA-Z0-9]+-[a-zA-Z0-9]+)"
	).unwrap();
}

pub fn validate_password(password: &str) -> Result<(), &str> {
	// Check if the password is long enough (e.g., at least 8 characters)
	if password.len() < 8 {
		return Err("Password is too short");
	}

	// Check if the password is not too long (e.g., no more than 255 characters)
	if password.len() > 255 {
		return Err("Password is too long");
	}

	// Check for a mix of uppercase and lowercase characters, numbers, and special characters
	let has_uppercase = password.chars().any(|c| c.is_uppercase());
	let has_lowercase = password.chars().any(|c| c.is_lowercase());
	let has_digit = password.chars().any(|c| c.is_digit(10));
	let has_special = password.chars().any(|c| !c.is_alphanumeric());

	if !has_uppercase || !has_lowercase || !has_digit || !has_special {
		return Err(
			"Password must include uppercase, lowercase, digits, and special characters"
		);
	}

	Ok(())
}

pub fn sanitize_email(email: &str) -> Result<String, &str> {
	let email = email.trim().to_lowercase();

	if email.len() > 254 {
		return Err("Email is more than 254 characters");
	}

	if EMAIL_REGEX.is_match(&email) {
		Ok(email)
	} else {
		Err("Invalid email format")
	}
}

pub fn sanitize_username(username: &str) -> Result<String, &str> {
	let sanitized: String = username
		.chars()
		.filter(|c| c.is_alphanumeric() && c.is_ascii())
		.collect();

	if sanitized.len() < 6 {
		return Err("Username is too short");
	}

	if sanitized.len() > 255 {
		return Err("Username is too long");
	}

	if sanitized != username {
		return Err("Username contains invalid characters");
	}

	if sanitized.is_empty() {
		return Err("Username cannot be empty");
	}

	Ok(sanitized)
}

pub fn sanitize_uuid(uuid_str: &str) -> Result<u64, &'static str> {
	match uuid_str.parse::<u64>() {
		Ok(uuid) => {
			// You can add additional checks here if needed
			Ok(uuid)
		}
		Err(_) => Err("Invalid UUID format"),
	}
}

pub fn sanitize_input(input: &str) -> String {
	let mut sanitized: String = input
		.chars()
		.filter(|c| c.is_alphanumeric() && c.is_ascii())
		.collect();

	if sanitized.len() > 255 {
		sanitized.truncate(255);
	}

	sanitized
}

pub fn sanitize_string_limit(input: &str) -> String {
	let mut sanitized: String = ammonia::clean(input);

	if sanitized.len() > 255 {
		if let Some((idx, _)) = sanitized.char_indices().nth(255) {
			sanitized.truncate(idx);
		}
	}

	sanitized
}

pub fn sanitize_path(input: &str) -> String {
	let mut sanitized: String = input
		.chars()
		.filter(|c| (c.is_alphanumeric() || "/?@%$#".contains(*c)))
		.collect();

	if sanitized.len() > 255 {
		sanitized.truncate(255);
	}

	sanitized
}

//  ?   [Regex] Extractions

pub fn extract_instagram_username(url: &str) -> Option<String> {
	INSTAGRAM_USERNAME_REGEX.captures(url)
		.and_then(|cap| {
			cap.get(1).map(|username| {
				let username = username.as_str();
				if
					username.contains("__") ||
					username.contains("._") ||
					username.contains("_.")
				{
					None
				} else {
					Some(username.to_string())
				}
			})
		})
		.flatten()
}

pub fn extract_github_username(url: &str) -> Option<String> {
	GITHUB_USERNAME_REGEX.captures(url).and_then(|cap| {
		cap.get(1).map(|username| username.as_str().to_string())
	})
}

pub fn extract_unsplash_photo_id(url: &str) -> Option<String> {
	UNSPLASH_PHOTO_ID_REGEX.captures(url).and_then(|cap| {
		cap.get(1).map(|match_| match_.as_str().to_string())
	})
}

//	? - Convert

pub fn uuid_to_biguint(uuid_str: &str) -> Result<BigUint, &'static str> {
	let uuid = Uuid::from_str(uuid_str).map_err(|_| "Invalid UUID format")?;
	let bytes = uuid.as_bytes();
	Ok(BigUint::from_bytes_be(bytes))
}

pub async fn fallback(uri: Uri) -> impl IntoResponse {
	let final_path = sanitize_path(&uri.to_string());

	let response = WizardResponse {
		data: serde_json::json!({"status": "error"}),
		message: serde_json::json!({"path": final_path.to_string()}),
	};

	(StatusCode::NOT_FOUND, Json(response))
}

pub fn cors_service() -> CorsLayer {
	let orgins = [
		"https://herbmail.com".parse::<HeaderValue>().unwrap(),
		"https://kbve.com".parse::<HeaderValue>().unwrap(),
		"https://discord.sh".parse::<HeaderValue>().unwrap(),
		"https://hoppscotch.io".parse::<HeaderValue>().unwrap(),
		"http://localhost:3000".parse::<HeaderValue>().unwrap(),
		"https://kbve.itch.io".parse::<HeaderValue>().unwrap(),
	];

	CorsLayer::new()
		.allow_origin(orgins)
		.allow_methods([Method::PUT, Method::GET, Method::DELETE, Method::POST])
		.allow_credentials(true)
		.allow_headers([
			AUTHORIZATION,
			ACCEPT,
			CONTENT_TYPE,
			HeaderName::from_static("x-kbve-shieldwall"),
			HeaderName::from_static("x-kbve-api"),
		])
}

#[derive(Serialize, Deserialize)]
struct CaptchaResponse {
	success: bool,
}

pub async fn verify_captcha(
	captcha_token: &str
) -> Result<bool, Box<dyn std::error::Error>> {
	let secret = match crate::wh::GLOBAL.get() {
		Some(global_map) =>
			match global_map.get("hcaptcha") {
				Some(value) => value.value().clone(),
				None => {
					return Err("missing_captcha".into());
				}
			}
		None => {
			return Err("invalid_global_map".into());
		}
	};

	let client = Client::new();
	let mut params = HashMap::new();
	params.insert("response", captcha_token);
	params.insert("secret", secret.as_str());

	let res = client
		.post("https://api.hcaptcha.com/siteverify")
		.form(&params)
		.send().await?;

	let captcha_response: CaptchaResponse = res.json().await?;
	Ok(captcha_response.success)
}
