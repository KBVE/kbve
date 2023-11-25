use serde::Serialize;


#[derive(Serialize)]
pub struct FallbackResponse {
    pub message: String,
    pub path: String,
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