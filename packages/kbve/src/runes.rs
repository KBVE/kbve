use diesel::prelude::*;

use axum::{
	http::{ StatusCode, HeaderMap },
	response::{ Json, IntoResponse, Response },
};

use serde::{ Serialize, Deserialize };

use dashmap::DashMap;

use once_cell::sync::Lazy;

use std::sync::{ Arc, OnceLock };


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
