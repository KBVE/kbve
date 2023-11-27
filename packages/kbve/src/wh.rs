use axum::{ http::StatusCode, response::Json };
use serde::{ Serialize, Deserialize };
use lazy_static::lazy_static;
use std::collections::HashMap;

#[macro_export]
macro_rules! insert_response {
	($map:expr, $key:expr, $status:expr, $data:expr, $message:expr) => {
        $map.insert(
            $key,
            (
                $status,
                Json(WizardResponse {
                    data: $data.to_string(),
                    message: $message.to_string(),
                }),
            ),
        );
	};
}


#[macro_export]
macro_rules! handle_error {
    ($expr:expr, $error_key:expr) => {
        match $expr {
            Ok(value) => value,
            Err(_) => return error_casting($error_key),
        }
    };
}

lazy_static! {
    pub static ref RESPONSE_MESSAGES: HashMap<&'static str, (StatusCode, Json<WizardResponse>)> = {
        let mut m = HashMap::new();
        insert_response!(m, "invalid_email", StatusCode::BAD_REQUEST, "error", "Email is invalid or not safe!");
        insert_response!(m, "database_error", StatusCode::INTERNAL_SERVER_ERROR, "error", "Database error from the pool within PlayerDB Module!");
        insert_response!(m, "email_already_in_use", StatusCode::INTERNAL_SERVER_ERROR, "error", "Email is already in our database as a member!");
        insert_response!(m, "vaild_guest_email", StatusCode::OK, "ok", "Email is valid but not in the database");
        m
    };
    
}

pub fn error_casting(key: &str) -> (StatusCode, Json<WizardResponse>) {
	RESPONSE_MESSAGES.get(key)
		.cloned()
		.unwrap_or_else(|| {
			(
				StatusCode::INTERNAL_SERVER_ERROR,
				Json(WizardResponse {
					data: "error".to_string(),
					message: "An unexpected error occurred".to_string(),
				}),
			)
		})
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WizardResponse {
	pub data: String,
	pub message: String,
}

#[derive(Serialize)]
pub struct UserResponse {
	pub id: u64,
	pub username: String,
	pub role: i32,
	pub reputation: i32,
	pub exp: i32,
}

#[derive(Serialize)]
pub struct ProfileResponse {
	pub name: String,
	pub bio: String,
	pub unsplash: String,
	pub github: String,
	pub instagram: String,
	pub discord: String,
}
