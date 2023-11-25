use tower_http::cors::CorsLayer;
use axum::{
	response::{  IntoResponse },
	http::{
		header::{ ACCEPT, AUTHORIZATION, CONTENT_TYPE},
        HeaderValue,
		StatusCode,
		Method,
        Uri
	},
    Json
};


use crate::dbms::wh::{ WizardResponse };


pub fn sanitize_input(input: &str) -> String {
	let mut sanitized: String = input
		.chars()
		.filter(|c| c.is_alphanumeric() && c.is_ascii())
		.collect();

	if sanitized.len() > 255 {
		sanitized.truncate(255);
	}

	sanitized
}

pub fn sanitize_path(input: &str) -> String {
    let mut sanitized: String = input
        .chars()
        .filter(|c| c.is_alphanumeric() || "/?@%$#".contains(*c))
        .collect();

    if sanitized.len() > 255 {
        sanitized.truncate(255);
    }

    sanitized
}

pub async fn fallback(uri: Uri) -> impl IntoResponse {

    let final_path = sanitize_path(&uri.to_string());


    let response = WizardResponse {
        data: "error".to_string(),
        message: format!("404 - Not Found, path: {}", final_path),
    };

    (StatusCode::NOT_FOUND, Json(response))
}

// pub async fn safety_middleware<B>(req: Request<B>, next: Next<B>) -> Result<Response, Infallible> {
//     // Your safety logic goes here

//     Ok(next.run(req).await)
// }

pub fn cors_service() -> CorsLayer {
	let orgins = [
		"https://kbve.com".parse::<HeaderValue>().unwrap(),
		"https://discord.sh".parse::<HeaderValue>().unwrap(),
        "https://hoppscotch.io".parse::<HeaderValue>().unwrap(),
        "http://localhost:3000".parse::<HeaderValue>().unwrap(),
        "https://kbve.itch.io".parse::<HeaderValue>().unwrap(),
	];

	CorsLayer::new()
        .allow_origin(orgins)
        .allow_methods([Method::PUT, Method::GET, Method::DELETE])
        .allow_credentials(true)
        .allow_headers([AUTHORIZATION, ACCEPT, CONTENT_TYPE])
}
