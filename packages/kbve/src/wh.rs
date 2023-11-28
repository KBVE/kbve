use axum::{ http::StatusCode, response::Json };
use serde::{ Serialize, Deserialize };
use serde_json::Value;
use lazy_static::lazy_static;
use std::collections::HashMap;

use crate::models::{ User, Profile };

#[macro_export]
macro_rules! insert_response {
	($map:expr, $key:expr, $status:expr, $data:expr, $message:expr) => {
        $map.insert(
            $key,
            (
                $status,
                Json(WizardResponse {
                    data: $data.to_string(),
                    message: serde_json::json!($message),
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
    pub static ref RESPONSE_MESSAGES: HashMap<&'static str, (StatusCode, &'static str)> = {
        let mut m = HashMap::new();
        m.insert("invalid_email", (StatusCode::BAD_REQUEST, "Email is invalid or not safe!"));
		m.insert("username_not_found", (StatusCode::BAD_REQUEST, "Username was not found!"));
        m.insert("database_error", (StatusCode::INTERNAL_SERVER_ERROR, "Database error from the pool within PlayerDB Module!"));
        m.insert("email_already_in_use", (StatusCode::INTERNAL_SERVER_ERROR, "Email is already in our database as a member!"));
        m.insert("valid_guest_email", (StatusCode::OK, "Email is valid but not in the database"));
        m.insert("json_failure", (StatusCode::INTERNAL_SERVER_ERROR, "Json Failure! :C"));
        m
    };
}

pub fn error_casting(key: &str) -> (StatusCode, Json<WizardResponse>) {
	if let Some(&(status, message)) = RESPONSE_MESSAGES.get(key) {
		(
			status,
			Json(WizardResponse {
				data: serde_json::json!({"status": "error" , "http": status.to_string()}),
				message: serde_json::json!({ "error": message }),
			}),
		)
	} else {
		(
			StatusCode::INTERNAL_SERVER_ERROR,
			Json(WizardResponse {
				data: serde_json::json!({"status": "error"}),
				message: serde_json::json!({"error": "Unknown Error"}),
			}),
		)
	}
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WizardResponse {
	pub data: serde_json::Value,
	pub message: serde_json::Value,
}
