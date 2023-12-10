//  *   [MiddleMan]
//  TODO:   Panda Update Migration
//  ?   [Axum][Middleware]
use axum::{
	http::{StatusCode,Request, header},
	extract::{ Extension, Path, State },
	response::{ IntoResponse, Response },
	Json,
};
//  ?   [std]
use std::sync::{ Arc };
use std::str::FromStr;
//  ?   [crate]
use crate::db::Pool;
use crate::wh::{TokenSchema};
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