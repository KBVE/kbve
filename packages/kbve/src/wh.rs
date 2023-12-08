use std::collections::HashMap;
use std::sync::{ Arc, OnceLock };
use std::str::FromStr;

use axum::{ http::{StatusCode, HeaderMap}, response::{Json, IntoResponse} };
use serde::{ Serialize, Deserialize };
use serde_json::Value;
use lazy_static::lazy_static;

use dashmap::DashMap;

use crate::models::{ User, Profile };

//  ?   [MACROS]

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
macro_rules! handle_boolean_operation_truth {
	($operation:expr, $success:expr, $error:expr) => {
        match $operation.await {
            Ok(true) => $success,
            Ok(false) | Err(_) => return error_casting($error),
        }
	};
}

#[macro_export]
macro_rules! handle_boolean_operation_fake {
	($operation:expr, $success:expr, $error:expr) => {
        match $operation.await {
            Ok(false) => $success,
            Ok(true) | Err(_) => return error_casting($error),
        }
	};
}


#[macro_export]
macro_rules! shield_sanitization {
	($shield:expr, $operation:expr, $error_key:expr)
	=> {
        match $operation {
            Ok(value) => value,
            Err(_) => return error_shield_casting($error_key),
        }
	};
}

#[macro_export]
macro_rules! simple_error {
	($expr:expr, $error_key:expr) => {
        match $expr {
            Ok(value) => value,
            Err(_) => return Err(error_simple($error_key)),
        }
	};
}

#[macro_export]
macro_rules! handle_shield_error {
    ($expr:expr, $error_key:expr) => {
        match $expr {
            Ok(value) => value,
            Err(_) => return error_shield_casting($error_key),
        }
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

#[macro_export]
macro_rules! handle_post_error {
	($expr:expr, $error_key:expr) => {
        match $expr {
            Ok(value) => value,
            Err(_) => return Ok(error_casting($error_key)),
        }
	};
}

#[macro_export]
macro_rules! kbve_get_conn {
	($pool:expr) => {
        match $pool.get() {
            Ok(conn) => conn,
            Err(_) => return Err("Failed to get a connection from the pool!"),
        }
	};
}

#[macro_export]
macro_rules! get_global_value {
	($key:expr, $err:expr) => {
        match crate::wh::GLOBAL.get() {
            Some(global_map) => match global_map.get($key) {
                Some(value) => Ok(value.value().clone()), // Assuming you want to clone the value
                None => Err($err),
            },
            None => Err("invalid_global_map"),
        }
	};
}

//  ?   [MAPS]

//  !   Remove lazy_static! and migrate into a OnceLock/OnceCell.

lazy_static! {
    pub static ref RESPONSE_MESSAGES: HashMap<&'static str, (StatusCode, &'static str)> = {
        let mut m = HashMap::new();
        m.insert("invalid_global_map", (StatusCode::INTERNAL_SERVER_ERROR, "Global Map was not set!"));
        m.insert("invalid_jwt", (StatusCode::INTERNAL_SERVER_ERROR, "JWT Secret was not set!"));
        m.insert("debug_login_works", (StatusCode::OK, "Login was successful!"));
        m.insert("fetch_route_fail", (StatusCode::BAD_REQUEST, "There was an error fetching the data!"));
        m.insert("success_account_created", (StatusCode::OK, "Account has been created!"));
        m.insert("uuid_convert_failed",  (StatusCode::BAD_REQUEST, "There was an error converting the UUID!"));
        m.insert("task_account_init_fail",  (StatusCode::BAD_REQUEST, "There was an error creating the account"));
        m.insert("wip_route", (StatusCode::BAD_REQUEST, "Work in progress route"));
        m.insert("username_taken", (StatusCode::BAD_REQUEST, "Username was taken!"));
        m.insert("user_register_fail",(StatusCode::BAD_REQUEST, "During the user creation, there was a failure!"));
        m.insert("auth_insert_fail", (StatusCode::BAD_REQUEST, "During the auth creation, there was a failure!"));
        m.insert("profile_insert_fail", (StatusCode::BAD_REQUEST, "During the profile creation, there was a failure!"));
        m.insert("invalid_password",(StatusCode::BAD_REQUEST, "Password was too short or must include  uppercase, lowercase, digits, and special characters"));
        m.insert("invalid_email", (StatusCode::BAD_REQUEST, "Email is invalid or not safe!"));
        m.insert("invalid_username", (StatusCode::BAD_REQUEST, "Username is invalid or not safe!"));
		m.insert("username_not_found", (StatusCode::BAD_REQUEST, "Username was not found!"));
        m.insert("database_error", (StatusCode::INTERNAL_SERVER_ERROR, "Database error from the pool within PlayerDB Module!"));
        m.insert("email_already_in_use", (StatusCode::INTERNAL_SERVER_ERROR, "Email is already in our database as a member!"));
        m.insert("valid_guest_email", (StatusCode::OK, "Email is valid but not in the database"));
        m.insert("json_failure", (StatusCode::INTERNAL_SERVER_ERROR, "Json Failure! :C"));
        m
    };

    // pub static ref GLOBAL: DashMap<String, String> = DashMap::new();
}


pub type GlobalStore = DashMap<String, String>;
pub static GLOBAL: OnceLock<Arc<GlobalStore>> = OnceLock::new();
pub type APISessionStore = DashMap<String, ApiSessionSchema>;

//  !  Error Functions

pub fn error_shield_casting(key: &str) -> (StatusCode, HeaderMap, Json<WizardResponse>) {
    
    let mut headers = axum::http::HeaderMap::new();
    
    let header_name = axum::http::header::HeaderName::from_str("x-kbve").unwrap();
    let header_value = axum::http::HeaderValue::from_str(&format!("shield_{}", &key)).unwrap();    
   

    if let Some(&(status, message)) = RESPONSE_MESSAGES.get(&key) {   
        headers.insert(header_name, header_value);
        (
            status,
            headers,
			Json(WizardResponse {
				data: serde_json::json!({"status": "error" , "http": status.to_string()}),
				message: serde_json::json!({ "error": message }),
			}),
        )
    } else {
       headers.insert(header_name, header_value);
       (
			StatusCode::INTERNAL_SERVER_ERROR,
            headers,
			Json(WizardResponse {
				data: serde_json::json!({"status": "error"}),
				message: serde_json::json!({"error": "Unknown Error"}),
			}),
		)
    }
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

pub fn error_simple(key: &str) -> &'static str {
	if let Some(&(_, message)) = RESPONSE_MESSAGES.get(key) {
		message
	} else {
		"Unknown Error"
	}
}

//  ?   [STRUCTS]

#[derive(Serialize, Deserialize, Clone)]
pub struct WizardResponse {
	pub data: serde_json::Value,
	pub message: serde_json::Value,
}

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

//  TODO: TokenSchema and ApiSchema - https://github.com/KBVE/kbve/issues/212#issuecomment-1830583562

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenSchema {
	pub uuid: String,
	pub email: String,
	pub username: String,
	pub iat: usize,
	pub exp: usize
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ApiSessionSchema {
	pub sub: String,
	pub iat: usize,
	pub exp: usize,
	pub key: String,
	pub uid: String,
	pub kbve: String,
}
