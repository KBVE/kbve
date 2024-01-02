//!         [AUTH]
//?         Migration of all Auth related functions.

//  ?   [crate]

use crate::models::{ User, Profile };
use crate::db::Pool;
use crate::runes::{
	TokenRune,
	GLOBAL,
	WizardResponse,
	AuthPlayerRegisterSchema,
	AuthVerificationSchema,
	UpdateProfileSchema,
	LoginUserSchema,
};

use crate::{
	spellbook_create_cookie,
	spellbook_pool,
	spellbook_username,
	spellbook_ulid,
	spellbook_email,
	spellbook_error,
	spellbook_complete,
	spellbook_get_global,
	spellbook_create_jwt,
};

//	?	[Diesel]
use diesel::prelude::*;
//	use crate::schema::{ auth, profile, users, apikey, n8n, appwrite, globals };
use crate::schema::{ auth, profile, users };

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
use serde::{ Serialize, Deserialize };

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
	//	!	Migration to ULID
	let ulid = match
		crate::guild::task_fetch_userid_by_username(
			body.username.clone(),
			pool.clone()
		).await
	{
		Ok(value) => value,
		Err(_) => {
			return spellbook_error!(
				axum::http::StatusCode::BAD_REQUEST,
				"process-ulid-failed"
			);
		}
	};

	//	[&] Create Auth
	match
		crate::guild::hazardous_create_auth_from_ulid(
			hash.clone().to_string(),
			body.email.clone(),
			ulid.clone(),
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
			ulid.clone(),
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

//	?	[Login]

pub async fn auth_player_login(
	Extension(pool): Extension<Arc<Pool>>,
	Json(body): Json<LoginUserSchema>
) -> impl IntoResponse {
	let clean_email = match crate::utility::sanitize_email(&body.email) {
		Ok(email) => email,
		Err(error_message) => {
			let mut headers = axum::http::HeaderMap::new();

			let header_name = axum::http::header::HeaderName
				::from_str("x-kbve")
				.unwrap();
			let header_value = axum::http::HeaderValue
				::from_str(&format!("shield_{}", error_message))
				.unwrap();

			headers.insert(header_name, header_value);

			return (
				StatusCode::INTERNAL_SERVER_ERROR,
				headers,
				Json(WizardResponse {
					data: serde_json::json!({"status": "error"}),
					message: serde_json::json!({"error": error_message.to_string()}),
				}),
			).into_response();
		}
	};

	match crate::utility::validate_password(&body.password) {
		Ok(()) => {}
		Err(_) => {
			let mut headers = axum::http::HeaderMap::new();

			let header_name = axum::http::header::HeaderName
				::from_str("x-kbve")
				.unwrap();
			let header_value = axum::http::HeaderValue
				::from_str(&format!("shield_{}", "invalid_password"))
				.unwrap();

			headers.insert(header_name, header_value);

			return (
				StatusCode::INTERNAL_SERVER_ERROR,
				headers,
				Json(WizardResponse {
					data: serde_json::json!({"status": "error"}),
					message: serde_json::json!({"error": "invalid_password"}),
				}),
			).into_response();
		}
	}

	let mut conn = match pool.get() {
		Ok(conn) => conn,
		Err(_) => {
			let mut headers = axum::http::HeaderMap::new();

			let header_name = axum::http::header::HeaderName
				::from_str("x-kbve")
				.unwrap();
			let header_value = axum::http::HeaderValue
				::from_str(&format!("shield_{}", "invalid_password"))
				.unwrap();

			headers.insert(header_name, header_value);

			return (
				StatusCode::INTERNAL_SERVER_ERROR,
				headers,
				Json(WizardResponse {
					data: serde_json::json!({"status": "error"}),
					message: serde_json::json!({"error": "invalid_password"}),
				}),
			).into_response();
		}
	};

	let auth_verification_data = match
		auth::table
			.inner_join(users::table.on(users::ulid.eq(auth::userid)))
			.filter(auth::email.eq(clean_email))
			.select((users::username, auth::email, users::ulid, auth::hash))
			.first::<AuthVerificationSchema>(&mut conn)
	{
		Ok(data) => data,
		Err(_) => {
			let mut headers = axum::http::HeaderMap::new();

			let header_name = axum::http::header::HeaderName
				::from_str("x-kbve")
				.unwrap();
			let header_value = axum::http::HeaderValue
				::from_str(&format!("shield_{}", "auth_error"))
				.unwrap();

			headers.insert(header_name, header_value);

			return (
				StatusCode::INTERNAL_SERVER_ERROR,
				headers,
				Json(WizardResponse {
					data: serde_json::json!({"status": "error"}),
					message: serde_json::json!({"error": "auth_error"}),
				}),
			).into_response();
		}
	};

	let db_user_hash_password = auth_verification_data.hash;


	let userid_ulid_string = match crate::utility::convert_ulid_bytes_to_string(&auth_verification_data.userid) {
		Ok(ulid_str) => ulid_str,
		Err(e) => {
			// Handle the error, e.g., log it or return an error response
			let mut headers = axum::http::HeaderMap::new();

			let header_name = axum::http::header::HeaderName
				::from_str("x-kbve")
				.unwrap();
			let header_value = axum::http::HeaderValue
				::from_str(&format!("shield_{}", "invalid_ulid"))
				.unwrap();

			headers.insert(header_name, header_value);

			return (
				StatusCode::INTERNAL_SERVER_ERROR,
				headers,
				Json(WizardResponse {
					data: serde_json::json!({"status": "error"}),
					message: serde_json::json!({"error": "invalid_ulid"}),
				}),
			).into_response();
		}
	};
	


	let operational_vaild_password = match
		PasswordHash::new(&db_user_hash_password)
	{
		Ok(process_hash) =>
			Argon2::default()
				.verify_password(&body.password.as_bytes(), &process_hash)
				.map_or(false, |_| true),
		Err(_) => false,
	};

	if !operational_vaild_password {
		let mut headers = axum::http::HeaderMap::new();

		let header_name = axum::http::header::HeaderName
			::from_str("x-kbve")
			.unwrap();
		let header_value = axum::http::HeaderValue
			::from_str(&format!("shield_{}", "invalid_password"))
			.unwrap();

		headers.insert(header_name, header_value);

		return (
			StatusCode::INTERNAL_SERVER_ERROR,
			headers,
			Json(WizardResponse {
				data: serde_json::json!({"status": "error"}),
				message: serde_json::json!({"error": "invalid_password"}),
			}),
		).into_response();
	}

	let jwt_secret = match spellbook_get_global!("jwt_secret", "invalid_jwt") {
		Ok(secret) => secret,
		Err(_) => {
			let mut headers = axum::http::HeaderMap::new();

			let header_name = axum::http::header::HeaderName
				::from_str("x-kbve")
				.unwrap();
			let header_value = axum::http::HeaderValue
				::from_str(&format!("shield_{}", "invalid_jwt"))
				.unwrap();

			headers.insert(header_name, header_value);

			return (
				StatusCode::UNAUTHORIZED,
				headers,
				Json(WizardResponse {
					data: serde_json::json!({"status": "error"}),
					message: serde_json::json!({"error": "invalid_jwt"}),
				}),
			).into_response();
		}
	};

	let jwt_token = spellbook_create_jwt!(
		userid_ulid_string,
		auth_verification_data.email,
		auth_verification_data.username,
		jwt_secret,
		2
	);

	let cookie = spellbook_create_cookie!("token", jwt_token.to_owned(), 2);

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
	 			"token": jwt_token.to_string()
		}),
		}),
	).into_response()

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
	// Sanitize and validate the username, ULID, and email from the JWT token data
	let clean_username = spellbook_username!(&privatedata.claims.username);
	let clean_ulid_string = spellbook_ulid!(&privatedata.claims.ulid);
	let clean_email = spellbook_email!(&privatedata.claims.email);

	let clean_ulid_bytes = match
		crate::utility::convert_ulid_string_to_bytes(&clean_ulid_string)
	{
		Ok(bytes) => bytes,
		Err(error_message) => {
			// Handle the error, e.g., return an appropriate response
			return (
				StatusCode::BAD_REQUEST,
				Json(serde_json::json!({ "error": error_message })),
			).into_response();
		}
	};

	// Attempt to retrieve the user and their profile from the database
	match
		users::table
			.inner_join(profile::table.on(profile::userid.eq(users::ulid)))
			.filter(users::ulid.eq(clean_ulid_bytes))
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
                    "ulid": clean_ulid_string,
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

// Define an asynchronous function named `auth_jwt_update_profile`
// This function is designed to handle a request to update a user profile
pub async fn auth_jwt_update_profile(
	// Extract a shared connection pool (wrapped in an Arc for thread safety)
	Extension(pool): Extension<Arc<Pool>>,
	// Extract JWT token data (assuming `jsonwebtoken::TokenData<TokenRune>` is a valid type)
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenRune>>,
	// Extract JSON payload into `UpdateProfileSchema` struct
	Json(mut body): Json<UpdateProfileSchema>
) -> impl IntoResponse {
	// Get a mutable connection from the pool
	let mut conn = spellbook_pool!(pool);
	// Sanitize and validate the ULID from the JWT token data
	let clean_user_ulid_string = spellbook_ulid!(&privatedata.claims.ulid);

	// Sanitize the body data (presumably to prevent injection attacks and validate input)
	body.sanitize();

	let clean_ulid_bytes = match
		crate::utility::convert_ulid_string_to_bytes(&clean_user_ulid_string)
	{
		Ok(bytes) => bytes,
		Err(error_message) => {
			// Handle the error, e.g., return an appropriate response
			return (
				StatusCode::BAD_REQUEST,
				Json(serde_json::json!({ "error": error_message })),
			).into_response();
		}
	};

	// Attempt to update the profile in the database
	match
		diesel
			::update(profile::table) // Specify the table to update
			.filter(profile::userid.eq(clean_ulid_bytes)) // Filter to the specific user's UUID
			.set(body) // Set the new profile data
			.execute(&mut conn) // Execute the update query
	{
		Ok(_) => {
			// If the update is successful, return an OK status with a success message
			(
				StatusCode::OK,
				Json(serde_json::json!({"status": "complete"})),
			).into_response()
		}
		Err(diesel::NotFound) => {
			// If the record to update is not found, return an Unauthorized status
			// This could mean the UUID doesn't match any user
			return (
				axum::http::StatusCode::UNAUTHORIZED,
				axum::Json(serde_json::json!({"error": "profile_not_found"})),
			).into_response();
		}
		Err(_) => {
			// For any other database error, return an Unauthorized status with a generic error message
			// This branch catches all other kinds of errors that might occur during the update process
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
	State(_data): State<Arc<Pool>>,
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
	req: Request<B>,
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

// Define a struct called `ShieldWallSchema` with Serde's derive macros for serialization and deserialization.
// This will allow instances of ShieldWallSchema to be easily converted to/from JSON (or other formats).
#[derive(Serialize, Deserialize, Clone)]
pub struct ShieldWallSchema {
	// Define a field `action` which is an Option type that can hold a String.
	// Option is used here to represent that the action might or might not be present.
	pub action: Option<String>,
}

impl ShieldWallSchema {
	pub async fn execute(&self) -> impl IntoResponse {
		match &self.action {
			Some(action) =>
				match action.as_str() {
					"deploy" => {
						// Call the function and await its response
						let response: axum::response::Response = shieldwall_action_portainer_stack_deploy().await.into_response();
						response
					}
					_ =>
						(
							StatusCode::BAD_REQUEST,
							Json(
								serde_json::json!({"error": "Unknown action"})
							),
						).into_response(),
				}
			None =>
				(
					StatusCode::BAD_REQUEST,
					Json(serde_json::json!({"error": "No action provided"})),
				).into_response(),
		}
	}
}

/**
	
	This function processes an action parameter from the URL path, sanitizes it, and attempts to execute an action based on that parameter. 
	The response depends on whether the execution is successful or results in an error. 
	If successful, it returns the result in a JSON format with a 200 OK status. 
	If an error occurs (such as if the action is not recognized), it returns an error message in a JSON format with a 404 Not Found status.

	**/

pub async fn shieldwall_action(
	Path(action): Path<String> // Extracts the 'action' parameter from the URL path
) -> impl IntoResponse {
	// Sanitize the extracted action string to prevent injection attacks and limit its length
	let clean_action = crate::utility::sanitize_string_limit(&action);

	// Create an instance of ShieldWallSchema with the sanitized action
	let shieldwall_schema = ShieldWallSchema {
		action: Some(clean_action),
	};

	// Execute the action using the ShieldWallSchema's execute method
	// Since execute now returns an impl IntoResponse, we can directly await it
	shieldwall_schema.execute().await
}

/**

	It retrieves the URL from the GLOBAL map using a predefined key.
	If the URL is found, it sends a POST request to that URL using reqwest::Client.
	The response from the server is then read as a text (assuming it's JSON or a string).
	If successful, the response text is returned. If there are any errors (like the URL not found in the map, the global map not initialized, failed to make the request, or failed to read the response), appropriate error messages are returned.
	This function should be run within the context of a Tokio runtime since it is an async function and uses await. Make sure that the GLOBAL map is properly initialized and contains the expected URL before calling this function.

	**/

// The `shieldwall_action_portainer_stack_deploy` function is an asynchronous function designed to
// interact with a Portainer Stack using a URL retrieved from a global map. It sends a POST request
// to the Portainer Stack URL and returns the server's response. Error handling is integrated to
// manage cases where the URL is not found in the global map, the global map is not initialized,
// or there are issues with the HTTP request or response processing. This function requires a Tokio
// runtime context as it relies on asynchronous operations.

pub async fn shieldwall_action_portainer_stack_deploy() -> impl IntoResponse {
	// Define the key for the Portainer Stack URL in the GLOBAL map
	let portainer_stack_url_from_map = "portainer_stack";

	// Retrieve the URL from the GLOBAL map
	let url = if let Some(global_map) = GLOBAL.get() {
		match global_map.get(portainer_stack_url_from_map) {
			Some(url) => url.value().clone(),
			None => {
				return axum::response::Response
					::builder()
					.status(StatusCode::INTERNAL_SERVER_ERROR)
					.body(
						Json(
							serde_json::json!({"error": "URL not found in global map"})
						)
							.into_response()
							.into_body()
					)
					.unwrap();
			}
		}
	} else {
		return axum::response::Response
			::builder()
			.status(StatusCode::INTERNAL_SERVER_ERROR)
			.body(
				Json(serde_json::json!({"error": "GLOBAL map not initialized"}))
					.into_response()
					.into_body()
			)
			.unwrap();
	};

	// Make the POST request to the URL
	match reqwest::Client::new().post(&url).send().await {
		Ok(response) => {
			match response.text().await {
				Ok(text) =>
					(
						StatusCode::OK,
						Json(serde_json::json!({ "response": text })),
					).into_response(),
				Err(e) =>
					(
						StatusCode::INTERNAL_SERVER_ERROR,
						Json(
							serde_json::json!({ "error": "Failed to read response", "message": e.to_string() })
						),
					).into_response(),
			}
		}
		Err(e) =>
			(
				StatusCode::INTERNAL_SERVER_ERROR,
				Json(
					serde_json::json!({ "error": "POST request failed", "message": e.to_string() })
				),
			).into_response(),
	}
}
