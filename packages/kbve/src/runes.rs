use serde::{ Serialize, Deserialize };

//?         [RUNES]
//?         Schemas with additional functions.

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
