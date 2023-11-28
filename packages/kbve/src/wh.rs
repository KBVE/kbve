use axum::response::Json;
use serde::{Serialize, Deserialize};
use lazy_static::lazy_static;
use std::collections::HashMap;

lazy_static! {
    pub static ref ERR_MSG: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        m.insert("invalid_email", "Email is invalid or not safe!");
        m.insert("database_error", "Database error from the pool within PlayerDB Module!");
        m.insert("email_already_in_use", "Email is already in our database as a member!");
		m
	};
	

    pub static ref OK_MSG: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        m.insert("vaild_guest_email", "Email is valid but not in");
		m
	};

    
    pub static ref STATIC_RESPONSES: HashMap<&'static str, Json<WizardResponse>> = {
        let mut m = HashMap::new();
        for (key, &message) in ERR_MSG.iter() {
            m.insert(*key, Json(WizardResponse {
                data: "error".to_string(), 
                message: message.to_string(),
            }));
        }
        for (key, &message) in OK_MSG.iter() {
            m.insert(*key, Json(WizardResponse {
                data: "ok".to_string(), 
                message: message.to_string(),
            }));
        }
        m
    };
    
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

