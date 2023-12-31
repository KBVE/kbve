//!         [UTILITY]
//?         Migration of harden, helper

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
	extract::Extension,
	Json,
};

use regex::Regex;
use once_cell::sync::Lazy;

use dashmap::DashMap;


use reqwest::Client;
//	use serde::{ Deserialize, Serialize };

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

use diesel::prelude::*;

use tokio::time::Instant;
use tokio::task;

use ulid::Ulid;

use crate::runes::{ WizardResponse };
use crate::db::Pool;

use crate::{ spellbook_pool_conn}; 

use crate::schema::{ globals };


//*         [REGEX]

pub static EMAIL_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$").unwrap()
);

pub static GITHUB_USERNAME_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"github\.com/([a-zA-Z0-9_-]+)").unwrap()
);

pub static INSTAGRAM_USERNAME_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(
		r"(?:@|(?:www\.)?instagram\.com/)?(?:@)?([a-zA-Z0-9_](?:[a-zA-Z0-9_.]*[a-zA-Z0-9_])?)"
	).unwrap()
);

pub static UNSPLASH_PHOTO_ID_REGEX: Lazy<Regex> = Lazy::new(||
	Regex::new(r"photo-([a-zA-Z0-9]+-[a-zA-Z0-9]+)").unwrap()
);

//*         [VALIDATION]

pub fn validate_password(password: &str) -> Result<(), &str> {
	// Check if the password is long enough (e.g., at least 8 characters)
	if password.chars().count() < 8 {
		return Err("Password is too short");
	}

	// Check if the password is not too long (e.g., no more than 255 characters)
	if password.chars().count() > 255 {
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

//*         [SANITIZATION]

pub fn sanitize_email(email: &str) -> Result<String, &str> {
	let email = email.trim().to_lowercase();

	if email.chars().count() > 254 {
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

	if sanitized.chars().count() < 6 {
		return Err("Username is too short");
	}

	if sanitized.chars().count() > 255 {
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

pub fn sanitizie_ulid(ulid_str: &str) -> Result<&str, &'static str> {
	// ULID is usually 26 chars.
	if ulid_str.len() != 26 {
		return Err("ulid_invalid");
	}

	// Crockford's base32 set
	let base32_chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

	// Validate each character
	for c in ulid_str.chars() {
		if !base32_chars.contains(c) {
			return Err("Invalid character in ULID");
		}
	}

	// ULID is valid
	Ok(ulid_str)
}

pub fn sanitize_input(input: &str) -> String {
	let mut sanitized: String = input
		.chars()
		.filter(|c| c.is_alphanumeric() && c.is_ascii())
		.collect();

	if sanitized.chars().count() > 255 {
		sanitized.truncate(255);
	}

	sanitized
}

pub fn sanitize_string_limit(input: &str) -> String {
	let mut sanitized: String = ammonia::clean(input);

	if sanitized.chars().count() > 255 {
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

	if sanitized.chars().count() > 255 {
		sanitized.truncate(255);
	}

	sanitized
}

//*         [REGEX] -> [EXTRACTIONS]

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

//*         [UTILS]


//?			[GLOBAL]

pub async fn global_map_init(
	pool: Arc<Pool>
) -> Result<DashMap<String, String>, &'static str> {
	let mut conn = spellbook_pool_conn!(pool);

	let map = DashMap::new();

	match
		globals::table
			.select((globals::key, globals::value))
			.load::<(String, String)>(&mut conn)
	{
		Ok(results) => {
			if results.is_empty() {
				Err("empty_case")
			} else {
				for (key, value) in results {
					println!("key {} inserted", key.to_string());
					map.insert(key, value);
				}
				Ok(map)
			}
		}
		Err(diesel::NotFound) => Err("not_found_error"),
		Err(_) => { Err("database_error") }
	}
}

//			?[ULIDS]

pub fn generate_ulid_as_bytes() -> Vec<u8> {
	let ulid = Ulid::new();
	ulid.to_bytes().to_vec()
}

pub fn generate_ulid_as_string() -> String {
	let ulid = Ulid::new();
	ulid.to_string()
}

pub fn convert_ulid_string_to_bytes(ulid_str: &str) -> Result<Vec<u8>, String> {
    match Ulid::from_str(ulid_str) {
        Ok(ulid) => Ok(ulid.to_bytes().to_vec()),
        Err(_) => Err("Invalid ULID string".to_string()),
    }
}

pub fn convert_ulid_bytes_to_string(ulid_bytes: &[u8]) -> Result<String, String> {
    if ulid_bytes.len() != 16 {
        return Err("Invalid ULID bytes length".to_string());
    }

    // Convert the slice to an array
    let ulid_array_ref: [u8; 16] = match ulid_bytes.try_into() {
        Ok(arr) => arr,
        Err(_) => return Err("Failed to convert slice to array".to_string()),
    };

    // Directly create a Ulid instance from the byte array
    let ulid = Ulid::from_bytes(ulid_array_ref);

    // Convert the Ulid to a string
    Ok(ulid.to_string())
}

//?         [FALLBACK]
pub async fn fallback(uri: Uri) -> impl IntoResponse {
	let final_path = sanitize_path(&uri.to_string());

	let response = WizardResponse {
		data: serde_json::json!({"status": "error"}),
		message: serde_json::json!({"path": final_path.to_string()}),
	};

	(StatusCode::NOT_FOUND, Json(response))
}

//?         [CORS]
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

//?         [CAPTCHA]
pub async fn verify_captcha(
	captcha_token: &str
) -> Result<bool, Box<dyn std::error::Error>> {
	let secret = match crate::runes::GLOBAL.get() {
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

	let captcha_response: crate::runes::CaptchaResponse = res.json().await?;
	Ok(captcha_response.success)
}

//*         [GENERIC]

//?         [ENDPOINT]

pub async fn root_endpoint() -> Result<Json<WizardResponse>, StatusCode> {
	Ok(
		Json(WizardResponse {
			data: serde_json::json!({"status": "online"}),
			message: serde_json::json!({"root": "endpoints_das_mai"}),
		})
	)
}

//?         [HEALTHCHECK]

pub async fn health_check(Extension(pool): Extension<Arc<Pool>>) -> Result<
	Json<WizardResponse>,
	StatusCode
> {
	let connection_result = task::spawn_blocking(move || { pool.get() }).await;

	match connection_result {
		Ok(Ok(_conn)) => {
			Ok(
				Json(WizardResponse {
					data: serde_json::json!({"status": "online"}),
					message: serde_json::json!({"health": "ok"}),
				})
			)
		}
		_ => { Err(StatusCode::SERVICE_UNAVAILABLE) }
	}
}

//?         [SPEED]

pub async fn speed_test(Extension(pool): Extension<Arc<Pool>>) -> Result<
	Json<WizardResponse>,
	StatusCode
> {
	let start_time = Instant::now();

	// Use `block_in_place` or `spawn_blocking` for the blocking database operation
	let query_result = task::block_in_place(|| {
		let mut conn = pool.get().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

		// Execute a simple query
		diesel
			::sql_query("SELECT 1")
			.execute(&mut conn)
			.map_err(|_| StatusCode::SERVICE_UNAVAILABLE)
	});

	match query_result {
		Ok(_) => {
			let elapsed_time = start_time.elapsed().as_millis() as u64;
			Ok(
				Json(WizardResponse {
					data: serde_json::json!({"status": "time"}),
					message: serde_json::json!({"time": elapsed_time.to_string()}),
				})
			)
		}
		Err(status) => Err(status),
	}
}
