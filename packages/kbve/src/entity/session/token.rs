use serde::{ Serialize, Deserialize };

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenJWT {
	pub userid: String,
	pub email: String,
	pub username: String,
	pub iat: usize,
	pub exp: usize,
}