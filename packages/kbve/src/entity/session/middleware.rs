use std::sync::Arc;

use axum_extra::extract::cookie::CookieJar;

use crate::db::{ Pool };

use crate::session::TokenJWT;

use axum::{
	http::{ StatusCode, Request, header },
	extract::{ Extension, Json, State },
	response::IntoResponse,
    middleware::Next,
};

use serde_json::json;
use jsonwebtoken::{decode, DecodingKey, Validation};

//  Macro Migration of SpellBook -> Global - Deadlock Warning
use crate::spellbook_get_global;

//  Graceful Replacement -> Middleware JWT


pub async fn middleware_jwt<B>(
	cookie_jar: CookieJar,
	State(_data): State<Arc<Pool>>,
	mut req: Request<B>,
	next: Next<B>
) -> impl IntoResponse {
	let token_result: Result<String, ()> = cookie_jar
		.get("token")
		.map(|cookie| cookie.value().to_string())
		.or_else(|| {
			req.headers()
				.get(header::AUTHORIZATION)
				.and_then(|auth_header| auth_header.to_str().ok())
				.and_then(|auth_value|
					auth_value.strip_prefix("Bearer ").map(String::from)
				)
		})
		.ok_or_else(|| ());

	let jwt_secret = match spellbook_get_global!("jwt_secret", "invalid_jwt") {
		Ok(secret) => secret,
		Err(_) => {
			return (
				StatusCode::UNAUTHORIZED,
				Json(json!({"error": "invalid_jwt"})),
			).into_response();
		}
	};

	let token: &str = match token_result {
		Ok(ref token_str) => token_str.as_str(),
		Err(_) => {
			return (
				StatusCode::UNAUTHORIZED,
				Json(json!({"error": "invalid_jwt"})),
			).into_response();
		}
	};

	let privatedata = match
		jsonwebtoken::decode::<TokenJWT>(
			&token,
			&jsonwebtoken::DecodingKey::from_secret(jwt_secret.as_bytes()),
			&jsonwebtoken::Validation::default()
		)
	{
		Ok(privatedata) => { privatedata }
		Err(_) => {
			return (
				StatusCode::UNAUTHORIZED,
				Json(json!({"error": "invalid_jwt"})),
			).into_response();
		}
	};

	req.extensions_mut().insert(privatedata);
	next.run(req).await.into_response()
}