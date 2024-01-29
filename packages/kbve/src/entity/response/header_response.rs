use crate::entity::response::GenericResponse;

use axum::{
    http::{HeaderMap, header::{HeaderName, HeaderValue, SET_COOKIE}},
    response::{IntoResponse, Response, Json},
};

use serde::{ Serialize, Deserialize };

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
