use tower_http::cors::CorsLayer;
use axum::{
	response::{ IntoResponse },
	http::{
		header::{ ACCEPT, AUTHORIZATION, CONTENT_TYPE },
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
use num_bigint::{BigUint};
use std::str::FromStr;

use crate::wh::{ WizardResponse };

lazy_static! {
    pub static ref EMAIL_REGEX: Regex = Regex::new(
        r"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"
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
        return Err("Password must include uppercase, lowercase, digits, and special characters");
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
		.allow_headers([AUTHORIZATION, ACCEPT, CONTENT_TYPE])
}
