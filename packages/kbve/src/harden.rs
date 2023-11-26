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

use crate::wh::{ WizardResponse };

lazy_static! {
    pub static ref EMAIL_REGEX: Regex = Regex::new(
        r"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"
    ).unwrap();
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

pub async fn fallback(uri: Uri) -> impl IntoResponse {
	let final_path = sanitize_path(&uri.to_string());

	let response = WizardResponse {
		data: "error".to_string(),
		message: format!("404 - Not Found, path: {}", final_path),
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
		.allow_methods([Method::PUT, Method::GET, Method::DELETE])
		.allow_credentials(true)
		.allow_headers([AUTHORIZATION, ACCEPT, CONTENT_TYPE])
}
