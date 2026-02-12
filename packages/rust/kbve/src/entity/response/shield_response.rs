use crate::entity::response::GenericResponse;
use crate::entity::response::HeaderResponse;

use axum::{
	http::{ HeaderValue, HeaderMap, header::HeaderName },
	response::IntoResponse,
};

// let generic_response = GenericResponse { ... };
// let response = ShieldResponseBuilder::new()
//     .body(generic_response)
//     .shield_value("your shield value".to_string())
//     .add_header(HeaderName::from_static("another-header"), HeaderValue::from_str("header value").unwrap())
//     .build();
//
// match response {
//     Ok(response) => {
//         // Use the response
//     }
//     Err(error) => {
//         // Handle error
//     }
// }

pub struct ShieldResponse {
	header_response: HeaderResponse,
}

impl IntoResponse for ShieldResponse {
	fn into_response(self) -> axum::response::Response {
		self.header_response.into_response()
	}
}

pub struct ShieldResponseBuilder {
	body: Option<GenericResponse>,
	shield_value: Option<String>,
	additional_headers: HeaderMap,
}

impl ShieldResponseBuilder {
	pub fn new() -> Self {
		Self {
			body: None,
			shield_value: None,
			additional_headers: HeaderMap::new(),
		}
	}

	pub fn body(mut self, body: GenericResponse) -> Self {
		self.body = Some(body);
		self
	}

	pub fn shield_value(mut self, value: String) -> Self {
		self.shield_value = Some(value);
		self
	}

	pub fn add_header(mut self, name: HeaderName, value: HeaderValue) -> Self {
		self.additional_headers.insert(name, value);
		self
	}

	pub fn build(self) -> Result<ShieldResponse, &'static str> {
		if let Some(body) = self.body {
			let mut headers = self.additional_headers;

			if let Some(shield_value) = self.shield_value {
				headers.insert(
					HeaderName::from_static("x-kbve-shield"),
					HeaderValue::from_str(&shield_value).expect(
						"Invalid header value"
					)
				);
			}

			Ok(ShieldResponse {
				header_response: HeaderResponse::new(body, headers),
			})
		} else {
			Err("ShieldResponse requires a body to be set")
		}
	}
}
