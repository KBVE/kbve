use serde::{ Serialize, Deserialize };

use axum::{ http::{ StatusCode }, response::{ Json, IntoResponse, Response } };

mod status_code_serde {
	use super::StatusCode;
	use serde::{ self, Deserialize, Serializer, Deserializer };

	pub fn serialize<S>(
		status_code: &StatusCode,
		serializer: S
	) -> Result<S::Ok, S::Error>
		where S: Serializer
	{
		serializer.serialize_u16(status_code.as_u16())
	}

	pub fn deserialize<'de, D>(deserializer: D) -> Result<StatusCode, D::Error>
		where D: Deserializer<'de>
	{
		let code = u16::deserialize(deserializer)?;
		StatusCode::from_u16(code).map_err(serde::de::Error::custom)
	}
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GenericResponse {
	pub data: serde_json::Value,
	pub message: serde_json::Value,
	pub status: String,
	pub error: Option<String>,
	#[serde(with = "status_code_serde")]
	pub status_code: StatusCode,
}

impl GenericResponse {
	pub fn new(
		data: serde_json::Value,
		message: serde_json::Value,
		status_code: StatusCode
	) -> Self {
		Self {
			data,
			message,
			status: "successful".to_string(),
			error: None,
			status_code,
		}
	}

	pub fn default(
		data: serde_json::Value,
		message: serde_json::Value
	) -> Self {
		Self::new(data, message, StatusCode::OK)
	}

	pub fn error(
		data: serde_json::Value,
		message: serde_json::Value,
		error: String,
		status_code: StatusCode
	) -> Self {
		Self {
			data,
			message,
			status: "error".to_string(),
			error: Some(error),
			status_code,
		}
	}
}

impl IntoResponse for GenericResponse {
    fn into_response(self) -> Response {
        let status_code = self.status_code;
        let json_body = Json(self);
        //    let json_body = Json(self.clone()); - Shifting the clone out to be efficient
        (status_code, json_body).into_response()
    }
}
