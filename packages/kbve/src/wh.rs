
use axum::{ http::StatusCode, response::Json };
use serde::{ Serialize, Deserialize };
use serde_json::Value;
use lazy_static::lazy_static;
use std::collections::HashMap;
use dashmap::DashMap;


use crate::models::{ User, Profile };

//  Macros

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
macro_rules! simple_error {
	($expr:expr, $error_key:expr) => {
        match $expr {
            Ok(value) => value,
            Err(_) => return Err(error_simple($error_key)),
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

//  Maps

lazy_static! {
    pub static ref RESPONSE_MESSAGES: HashMap<&'static str, (StatusCode, &'static str)> = {
        let mut m = HashMap::new();
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
}

//  Two different tokens , one that will be the user session, which will be stateless and api sessions would be in a dashmap.

pub type APISessionStore = DashMap<String, ApiSessionSchema>;

//  Error Functions

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

//  Structs

//  Responses

#[derive(Serialize, Deserialize, Clone)]
pub struct WizardResponse {
	pub data: serde_json::Value,
	pub message: serde_json::Value,
}

//  Abstract Schemas

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


// https://github.com/KBVE/kbve/issues/212#issuecomment-1830583562
#[derive(Debug, Serialize, Deserialize)]
pub struct TokenClaims {
    pub sub: String,
    pub iat: usize,
    pub exp: usize,
    pub aud: Option<String>, 
    pub iss: Option<String>, 
    pub jti: Option<String>,
    pub nbf: Option<usize>, 
    pub scope: Option<String>, 
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