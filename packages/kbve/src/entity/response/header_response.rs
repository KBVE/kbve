use crate::entity::response::GenericResponse;

use std::str::FromStr;

use axum::{
    http::{StatusCode, HeaderMap, header::{HeaderName, HeaderValue, SET_COOKIE}},
    response::{IntoResponse, Response, Json},
};

use serde_json::{json, Value as JsonValue};


use axum_extra::extract::cookie::{Cookie, SameSite};
use time::Duration;

pub struct HeaderResponse {
	pub body: GenericResponse,
	pub headers: HeaderMap,
}

impl HeaderResponse {
	pub fn new(body: GenericResponse, headers: HeaderMap) -> Self {
		Self { body, headers }
	}
	pub fn add_header(mut self, name: HeaderName, value: HeaderValue) -> Self {
		self.headers.insert(name, value);
		self
	}

    pub fn with_cookie(
        mut self, 
        name: &str, 
        value: &str, 
        duration: Duration, 
        path: &str, 
        http_only: bool,
        same_site: SameSite
    ) -> Self {
        let cookie = Cookie::build(name, value)
            .path(path)
            .max_age(duration)
            .same_site(same_site)
            .http_only(http_only)
            .finish();

        let cookie_value = cookie.to_string();
        self.headers.insert(SET_COOKIE, cookie_value.parse().unwrap());
        self
    }
}

impl IntoResponse for HeaderResponse {
	fn into_response(self) -> Response {
		let mut response = Json(self.body).into_response();
		*response.headers_mut() = self.headers;
		response
	}
}


pub fn create_error_response(header_key: &str, header_value_suffix: &str, error_message: &str) -> Response {
    let mut headers = HeaderMap::new();
    let header_name = HeaderName::from_str(header_key).unwrap();
    let header_value = HeaderValue::from_str(&format!("shield_{}", header_value_suffix)).unwrap();
    headers.insert(header_name, header_value);

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        headers,
        Json(json!({
            "data": {"status": "error"},
            "message": {"error": error_message}
        }))
    ).into_response()
}

pub fn create_custom_response(status: StatusCode, header_key: &str, header_value_suffix: &str, error_message: &str) -> Response {
    let mut headers = HeaderMap::new();
    let header_name = HeaderName::from_str(header_key).unwrap();
    let header_value = HeaderValue::from_str(&format!("shield_{}", header_value_suffix)).unwrap();
    headers.insert(header_name, header_value);

    (
        status,
        headers,
        Json(json!({
            "data": {"status": "error"},
            "message": {"error": error_message}
        }))
    ).into_response()
}