//!         [AUTH]
//?         Migration of all Auth related functions.


//  ?   [crate]

use crate::models::{ User, Profile };
use crate::db::Pool;
use crate::runes::{ TokenRune, GLOBAL, WizardResponse, AuthPlayerRegisterSchema};

use crate::{
	spellbook_create_cookie,
	spellbook_pool,
	spellbook_username,
	spellbook_ulid,
	spellbook_email,
	spellbook_error,
	spellbook_complete,
	spellbook_get_global,
};

//	?	[Diesel]
use diesel::prelude::*;
use crate::schema::{ auth, profile, users, apikey, n8n, appwrite, globals };


//	?	[Axum]

use axum::{
	async_trait,
	http::{ StatusCode, Request, header },
	extract::{ Extension, Path, State, FromRequest },
	response::{ IntoResponse, Response },
	middleware::{ self, Next },
	Json,
	BoxError,
};

//	?	[Argon2]

use argon2::{
	password_hash::SaltString,
	Argon2,
	PasswordHash,
	PasswordHasher,
	PasswordVerifier,
};

use rand_core::OsRng;


//  ?   [serde]
use serde_json::{ json };

//  ?   [std]
use std::sync::{ Arc };
use std::str::FromStr;



pub async fn auth_logout() -> impl IntoResponse {
	let cookie = spellbook_create_cookie!("token", "", -1);

	let mut headers = axum::http::HeaderMap::new();

	headers.insert(
		axum::http::header::SET_COOKIE,
		cookie.to_string().parse().unwrap()
	);

	(
		StatusCode::OK,
		headers,
		Json(WizardResponse {
			data: serde_json::json!({"status": "complete"}),
			message: serde_json::json!({
	 			"token" : "logout" 
		}),
		}),
	)
}

pub async fn auth_player_register(
	Extension(pool): Extension<Arc<Pool>>,
	Json(mut body): Json<AuthPlayerRegisterSchema>
) -> impl IntoResponse {
	// Captcha
	match crate::utility::verify_captcha(&body.token).await {
		Ok(success) => {
			if !success {
				return (
					StatusCode::UNPROCESSABLE_ENTITY,
					"Invalid captcha",
				).into_response();
			}
		}
		Err(_) => {
			return (
				StatusCode::INTERNAL_SERVER_ERROR,
				"Captcha verification failed",
			).into_response();
		}
	}

	if let Err(e) = body.sanitize() {
		return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
	}

	// Get a mutable connection from the pool and pass it along to verify.
	let mut conn = spellbook_pool!(pool);

	//	[!] Check Email - Check if the player email address exists within the database.
	match
		crate::guild::hazardous_boolean_email_exist(
			body.email.clone(),
			pool.clone()
		).await
	{
		Ok(false) => {}
		Ok(true) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"email-exists"
			);
		}
		Err(e) => {
			return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
		}
	}

	//	[!] Check Player - Check if the player username exists within the database.
	match
		crate::guild::hazardous_boolean_username_exist(
			body.username.clone(),
			pool.clone()
		).await
	{
		Ok(false) => {}
		Ok(true) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"username-exists"
			);
		}
		Err(e) => {
			return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
		}
	}

	//	[START] => Password generation!
	let salt = SaltString::generate(&mut rand_core::OsRng);

	let hash = match
		Argon2::default().hash_password(body.password.as_bytes(), &salt)
	{
		Ok(value) => value,
		Err(_) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"invaild_hash"
			);
		}
	};

	//	[&] Create User
	match
		crate::guild::hazardous_create_user(
			body.username.clone(),
			pool.clone()
		).await
	{
		Ok(true) => {}
		Ok(false) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"process-user-failed"
			);
		}
		Err(e) => {
			return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
		}
	}

	//	[#]	Obtain UUID
	let uuid = match
		crate::guild::task_fetch_userid_by_username(
			body.username.clone(),
			pool.clone()
		).await
	{
		Ok(value) => value,
		Err(_) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"process-uuid-failed"
			);
		}
	};

	//	[&] Create Auth
	match
		crate::guild::hazardous_create_auth_from_ulid(
			hash.clone().to_string(),
			body.email.clone(),
			uuid.clone(),
			pool.clone()
		).await
	{
		Ok(true) => {}
		Ok(false) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"process-auth-failed"
			);
		}
		Err(e) => {
			return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
		}
	}

	//	[&]	Create Profile
	match
		crate::guild::hazardous_create_profile_from_ulid(
			body.username.clone(),
			uuid.clone(),
			pool.clone()
		).await
	{
		Ok(true) => {}
		Ok(false) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"process-profile-failed"
			);
		}
		Err(e) => {
			return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
		}
	}

	//	[#] Check Email - This time we want it to return true because the user should be registered.
	match
		crate::guild::hazardous_boolean_email_exist(
			body.email.clone(),
			pool.clone()
		).await
	{
		Ok(true) => {}
		Ok(false) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"auth-register-fail"
			);
		}
		Err(e) => {
			return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
		}
	}

	spellbook_complete!("register-complete")
}

//  ?   [Routes] -> JWTs
//	!	[START] -> JWTS

//	TODO:	ULID Migration - 12/28/2023
// Define an asynchronous function named `graceful_jwt_profile`
// This function is designed to handle requests that require JWT authentication
pub async fn graceful_jwt_profile(
	// Extract JWT token data from the request's extensions
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenRune>>
) -> impl IntoResponse {
	// Return a successful HTTP response with the claims contained in the JWT token
	// The claims are serialized into JSON format
	(
		axum::http::StatusCode::OK,
		axum::Json(serde_json::to_value(privatedata.claims).unwrap()),
	)
}

// Define an asynchronous function named `auth_jwt_profile`
// This function handles authenticated requests to retrieve a user's profile

/**
	In auth_jwt_profile, the function retrieves a user's profile from the database using sanitized data from the JWT token.
	It joins user and profile tables, filters by UUID, and selects relevant columns.
	The function handles different outcomes: if successful, it returns user and profile data; if the user is not found, it returns a "username not found" error; for other errors, it returns a "database error" message.
**/

pub async fn auth_jwt_profile(
	// Extract a shared connection pool (wrapped in Arc for thread safety)
	Extension(pool): Extension<Arc<Pool>>,
	// Extract JWT token data (assuming `jsonwebtoken::TokenData<TokenRune>` is a valid type)
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenRune>>
) -> impl IntoResponse {
	// Get a mutable connection from the pool
	let mut conn = spellbook_pool!(pool);
	// Sanitize and validate the username, UUID, and email from the JWT token data
	let clean_username = spellbook_username!(&privatedata.claims.username);
	let clean_ulid = spellbook_ulid!(&privatedata.claims.ulid);
	let clean_email = spellbook_email!(&privatedata.claims.email);

	// Attempt to retrieve the user and their profile from the database
	match
		users::table
			.inner_join(profile::table.on(profile::ulid.eq(users::ulid)))
			.filter(users::ulid.eq(clean_ulid))
			.select((users::all_columns, profile::all_columns))
			.first::<(User, Profile)>(&mut conn)
	{
		Ok((user, profile)) => {
			// If successful, return a JSON response with user and profile data
			(
				StatusCode::OK,
				Json(
					serde_json::json!({"status": "complete",
                    "user": user,
                    "profile": profile,
                    "email": clean_email,
                    "ulid": clean_ulid,
                    "username": clean_username,
                })
				),
			).into_response()
		}
		Err(diesel::NotFound) => {
			// If the user is not found, return an Unauthorized response with an error message
			return (
				axum::http::StatusCode::UNAUTHORIZED,
				axum::Json(serde_json::json!({"error": "username_not_found"})),
			).into_response();
		}
		Err(_) => {
			// For any other database error, return an Unauthorized response with a generic error message
			return (
				axum::http::StatusCode::UNAUTHORIZED,
				axum::Json(serde_json::json!({"error": "database_error"})),
			).into_response();
		}
	}
}

//	!	[END] -> @JWTs

pub async fn graceful<B>(
	cookie_jar: axum_extra::extract::cookie::CookieJar,
	State(data): State<Arc<Pool>>,
	mut req: Request<B>,
	next: axum::middleware::Next<B>
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
		jsonwebtoken::decode::<TokenRune>(
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

//	!	[Shield]

pub async fn shieldwall<B>(
	mut req: Request<B>,
	next: axum::middleware::Next<B>
) -> impl IntoResponse
	where
		B: Send // required by `axum::middleware::Next`
{
	// Extract the "kbve-shieldwall" header
	let shieldwall_header_value = req
		.headers()
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
				(
					StatusCode::UNAUTHORIZED,
					Json(json!({"error": "Invalid shieldwall header value"})),
				).into_response()
			}
		}
		None => {
			// Header not found
			(
				StatusCode::UNAUTHORIZED,
				Json(json!({"error": "Shieldwall header missing"})),
			).into_response()
		}
	}
}
