//  *   [MiddleMan]
//  TODO:   Panda Update Migration
//  ?   [Axum][Middleware]
use axum::{
	async_trait,
	http::{StatusCode,Request, header},
	extract::{ Extension, Path, State, FromRequest},
	response::{ IntoResponse, Response },
	middleware::{self, Next},
	Json,
	BoxError
};
//  ?   [std]
use std::sync::{ Arc };
use std::str::FromStr;
//  ?   [crate]
use crate::db::Pool;
use crate::wh::{TokenSchema};
use crate::wh::GLOBAL;

//  ?   [serde]
use serde_json::{ json };

//  !   [macros]
use crate::{
    get_global_value
};

pub async fn graceful<B>(
    cookie_jar: axum_extra::extract::cookie::CookieJar,
    State(data): State<Arc<Pool>>,
    mut req: Request<B>,
    next: axum::middleware::Next<B>,
    
) -> impl IntoResponse {
    
    let token_result: Result<String, ()> = cookie_jar
        .get("token")
        .map(|cookie| cookie.value().to_string())
        .or_else(|| {
            req.headers()
                .get(header::AUTHORIZATION)
                .and_then(|auth_header| auth_header.to_str().ok())
                .and_then(|auth_value| auth_value.strip_prefix("Bearer ").map(String::from))
        })
		.ok_or_else(|| ());

	let jwt_secret = match get_global_value!("jwt_secret", "invalid_jwt")
		{
			Ok(secret) => secret,
			Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid_jwt"}))).into_response()
		};

	let token: &str = match token_result {
		Ok(ref token_str) => token_str.as_str(),
		Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid_jwt"}))).into_response()
	};

	let privatedata = match jsonwebtoken::decode::<TokenSchema>(
		&token,
		&jsonwebtoken::DecodingKey::from_secret(jwt_secret.as_bytes()),
		&jsonwebtoken::Validation::default(),
	)
	{
		Ok(privatedata) => {privatedata},
		Err(_) => return (StatusCode::UNAUTHORIZED, Json(json!({"error": "invalid_jwt"}))).into_response()
	};

	req.extensions_mut().insert(privatedata);
	next.run(req).await.into_response()
}

//	!	[Shield]

async fn shieldwall<B>(
    mut req: Request<B>,
    next: axum::middleware::Next<B>,
) -> impl IntoResponse
where
    B: Send, // required by `axum::middleware::Next`
{
    // Extract the "kbve-shieldwall" header
    let shieldwall_header_value = req.headers()
        .get("kbve-shieldwall")
        .and_then(|value| value.to_str().ok())
        .map(String::from);

    match shieldwall_header_value {
        Some(value) => {
            // Access the GLOBAL store and compare the value
            let is_valid = if let Some(global_store) = GLOBAL.get() {
                global_store
                    .get("shieldwall")
                    .map(|expected_value| expected_value.value() == &value)
                    .unwrap_or(false)
            } else {
                false // GLOBAL store not initialized
            };

            if is_valid {
                // If the header value is valid, proceed with the next middleware or handler
                next.run(req).await.into_response()
            } else {
                // Invalid header value
                (StatusCode::UNAUTHORIZED, Json(json!({"error": "Invalid shieldwall header value"}))).into_response()
            }
        }
        None => {
            // Header not found
            (StatusCode::UNAUTHORIZED, Json(json!({"error": "Shieldwall header missing"}))).into_response()
        }
    }
}
