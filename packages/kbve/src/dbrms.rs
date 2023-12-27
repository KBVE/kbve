//  *   Database Rustik Management System

use std::collections::HashMap;
use std::sync::{ Arc, OnceLock };
use std::str::FromStr;

use dashmap::DashMap;

use serde::{ Serialize, Deserialize };

use axum::{
	http::{ StatusCode },
	response::{ IntoResponse },
	extract::Path,
	Extension,
	Json,
};

use argon2::{
	password_hash::SaltString,
	Argon2,
	PasswordHash,
	PasswordHasher,
	PasswordVerifier,
};

use diesel::prelude::*;
use crate::schema::{ auth, profile, users, apikey, n8n, appwrite, globals };
use crate::wh::{ TokenSchema };
use crate::db::{ Pool };
use crate::wh::GLOBAL;
use crate::models::{ User, Profile };


//  ?   Macros

use crate::{ spellbook_pool };


#[macro_export]
macro_rules! create_jwt {
	($uuid:expr, $email:expr, $username:expr, $secret:expr, $hours:expr) => {
		{

		use jsonwebtoken::{encode, EncodingKey, Header};

        let now = chrono::Utc::now();
        let exp = now + chrono::Duration::minutes($hours * 60);

        let jwt_token = encode(
            &Header::default(),
            &TokenSchema {
                uuid: $uuid.to_string(),
                email: $email.to_string(),
                username: $username.to_string(),
                iat: now.timestamp() as usize,
                exp: exp.timestamp() as usize,
            },
            &EncodingKey::from_secret($secret.as_bytes()),
        ).unwrap(); 

		jwt_token
		}
	};
}

#[macro_export]
macro_rules! build_cookie {
	($name:expr, $token:expr, $duration:expr) => {
		axum_extra::extract::cookie::Cookie::build($name, $token)
			.path("/")
			.max_age(time::Duration::hours($duration))
			.same_site(axum_extra::extract::cookie::SameSite::Lax)
			.http_only(true)
			.finish()
	};
}



/** 
	This macro is a utility for working with database connection pools.
	It tries to retrieve a connection from the provided pool.
	If successful, the connection is returned for further use.
	If there's an error in obtaining a connection, it handles the error by immediately returning an HTTP response with an appropriate error message and status code. This macro ensures a uniform way of handling database pool errors across different parts of an Axum application.
**/

// The `spellbook_pool` macro is defined using Rust's macro_rules! system.
// This macro is designed to simplify the process of obtaining a database connection from a connection pool.
#[macro_export]
macro_rules! spellbook_pool {
	// The macro takes a single argument, `$pool`, which represents the connection pool.
	($pool:expr) => {
        // Attempt to get a database connection from the pool.
        match $pool.get() {
            // If successful, the obtained connection (`conn`) is returned for use.
            Ok(conn) => conn,

            // If there's an error (e.g., the pool is exhausted or connection failed),
            // the macro returns an HTTP response indicating an internal server error.
            // This return statement is designed to exit from the calling function.
            Err(_) => return (
                // Sets the HTTP status code to UNAUTHORIZED (401).
                // Although the error is from the database, the response indicates a more general server error.
                axum::http::StatusCode::UNAUTHORIZED,

                // The body of the response is a JSON object with an error message.
                axum::Json(serde_json::json!({"error": "db_error"})),

                // Converts the tuple into an Axum response type.
            ).into_response(),
        }
	};
}

//	!	REMOVE
// The `spellbook_error` macro is designed for use in Axum-based web applications.
// It simplifies the creation of HTTP error responses. When invoked, it creates
// an Axum response with a specified HTTP status code and a JSON body containing 
// an error message. Additionally, it sets a custom header "x-kbve-shield" with 
// the error message as its value. This macro is useful for consistently handling 
// error responses throughout your web application.

#[macro_export]
 macro_rules! spellbook_error {
     // The macro takes two parameters: `$status` for the HTTP status code, and `$error` for the error message.
     ($status:expr, $error:expr) => {{
         // Creates a JSON body with the provided error message.
         let response_body = axum::Json(serde_json::json!({ "error": $error }));

         // Constructs an Axum response using the specified status code and the JSON body.
         let mut response: axum::response::Response = ($status, response_body).into_response();

         // Inserts a custom header "x-kbve-shield" into the response. The value of this header is the error message.
         // `expect` is used here to handle any potential error while converting the error message into a header value.
         response.headers_mut().insert(
             axum::http::header::HeaderName::from_static("x-kbve-shield"),
             axum::http::HeaderValue::from_str($error).expect("Invalid header value"),
         );

         // Returns the modified response.
         response
     }};
}

#[macro_export]
macro_rules! spellbook_complete {
	($spell:expr) => {
        return (axum::http::StatusCode::OK, axum::Json(serde_json::json!({"data": $spell}))).into_response()
	};
}

#[macro_export]
macro_rules! spellbook_username {
	($username:expr) => {
        match crate::harden::sanitize_username($username) {
            Ok(username) => username,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_uuid {
	($uuid:expr) => {
        match crate::harden::sanitize_uuid($uuid) {
            Ok(uuid) => uuid,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_email {
	($email:expr) => {
        match crate::harden::sanitize_email($email) {
            Ok(email) => email,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

/**

In the spellbook_sanitize_fields macro:
	- It takes any struct ($struct) and a list of fields within that struct.
	- For each field, if it is an Option<String> and currently has a value (Some), that value is sanitized using the crate::harden::sanitize_string_limit function.
	- The macro is designed to be reusable for any struct with fields that need sanitizing and can handle multiple fields at once.
	- This macro simplifies the process of sanitizing multiple fields in a struct, ensuring that each specified field is sanitized if it contains a value. 
	It reduces code repetition and improves readability by abstracting the common pattern of sanitizing multiple optional fields.
**/

// This is a macro definition using Rust's macro_rules! system.
// It is designed to generalize the process of sanitizing fields in a struct.
#[macro_export]
macro_rules! spellbook_sanitize_fields {
	// The macro takes two types of input:
	// 1. $struct:expr, which represents the struct instance whose fields need sanitizing.
	// 2. $($field:ident),+, which is a variadic list of field identifiers that need to be sanitized.
	($struct:expr, $($field:ident),+) => {
        $(
            // This loop iterates over each field specified in the macro invocation.
            if let Some(ref mut value) = $struct.$field {
                // If the field ($field) is Some (i.e., it's not None), then the field's value is sanitized.
                // `*value` dereferences the Option to get a mutable reference to the contained String.
                // `crate::harden::sanitize_string_limit` is called to sanitize the value.
                // This could include operations like trimming, removing special characters, etc.
                *value = crate::harden::sanitize_string_limit(value);
            }
        )+
	};
}

//  ?   [Routes] -> JWTs

// Define an asynchronous function named `graceful_jwt_profile`
// This function is designed to handle requests that require JWT authentication
pub async fn graceful_jwt_profile(
	// Extract JWT token data from the request's extensions
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenSchema>>
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
pub async fn auth_jwt_profile(
	// Extract a shared connection pool (wrapped in Arc for thread safety)
	Extension(pool): Extension<Arc<Pool>>,
	// Extract JWT token data (assuming `jsonwebtoken::TokenData<TokenSchema>` is a valid type)
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenSchema>>
) -> impl IntoResponse {
	// Get a mutable connection from the pool
	let mut conn = spellbook_pool!(pool);
	// Sanitize and validate the username, UUID, and email from the JWT token data
	let clean_username = spellbook_username!(&privatedata.claims.username);
	let clean_uuid = spellbook_uuid!(&privatedata.claims.uuid);
	let clean_email = spellbook_email!(&privatedata.claims.email);

	// Attempt to retrieve the user and their profile from the database
	match
		users::table
			.inner_join(profile::table.on(profile::uuid.eq(users::id)))
			.filter(users::id.eq(clean_uuid))
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
                    "uuid": clean_uuid,
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

/**
	In auth_jwt_profile, the function retrieves a user's profile from the database using sanitized data from the JWT token.
	It joins user and profile tables, filters by UUID, and selects relevant columns.
	The function handles different outcomes: if successful, it returns user and profile data; if the user is not found, it returns a "username not found" error; for other errors, it returns a "database error" message.
**/

//	?	[Routes] -> Profile
/**
	- UpdateProfileSchema is a struct used to represent the data for updating a user profile. 
	Each field is optional, allowing partial updates.
	- It implements AsChangeset and Queryable from Diesel to facilitate database operations, 
	and Serialize and Deserialize from Serde for JSON (de)serialization.
	- The sanitize method is responsible for cleaning and validating the fields. 
	It likely performs operations like trimming, escaping, or validating the format.
	- extract_usernames method further processes specific fields (like github, instagram, and unsplash) to extract meaningful information, such as usernames or IDs. 
	If the extraction process fails (e.g., if the input is invalid), the corresponding field is reset to an empty string to avoid storing invalid data.
	**/

// Derive macros to add functionality to the UpdateProfileSchema struct.
#[derive(AsChangeset, Queryable, Serialize, Deserialize, Clone)]
// Specifies the corresponding table name in the database for the Diesel ORM.
#[diesel(table_name = profile)]
pub struct UpdateProfileSchema {
	// Define optional fields for the user profile.
	// Option is used to represent that each field might or might not be present.
	pub name: Option<String>,
	pub bio: Option<String>,
	pub unsplash: Option<String>,
	pub github: Option<String>,
	pub instagram: Option<String>,
	pub discord: Option<String>,
}

// Implement methods for the UpdateProfileSchema struct.
impl UpdateProfileSchema {
	// Define a method named `sanitize` to clean and validate the fields.
	pub fn sanitize(&mut self) {
		// Sanitize the fields using a custom macro or function.
		// This likely includes trimming whitespace, escaping special characters, etc.
		spellbook_sanitize_fields!(
			self,
			bio,
			name,
			unsplash,
			github,
			instagram,
			discord
		);
		// Further process specific fields to extract usernames or IDs.
		self.extract_usernames();
	}

	// Define a method to extract and validate usernames or IDs from certain fields.
	fn extract_usernames(&mut self) {
		// For the GitHub field, extract the username and validate it.
		if let Some(ref mut github) = self.github {
			if
				let Some(username) =
					crate::harden::extract_github_username(github)
			{
				*github = username;
			} else {
				// If the input is invalid, reset the field to an empty string.
				*github = String::new();
			}
		}
		// Similar logic for Instagram.
		if let Some(ref mut instagram) = self.instagram {
			if
				let Some(username) =
					crate::harden::extract_instagram_username(instagram)
			{
				*instagram = username;
			} else {
				*instagram = String::new();
			}
		}

		// Similar logic for Unsplash.
		if let Some(ref mut unsplash) = self.unsplash {
			if
				let Some(url) =
					crate::harden::extract_unsplash_photo_id(unsplash)
			{
				*unsplash = url;
			} else {
				*unsplash = String::new();
			}
		}
	}
}

// Define an asynchronous function named `auth_jwt_update_profile`
// This function is designed to handle a request to update a user profile
pub async fn auth_jwt_update_profile(
	// Extract a shared connection pool (wrapped in an Arc for thread safety)
	Extension(pool): Extension<Arc<Pool>>,
	// Extract JWT token data (assuming `jsonwebtoken::TokenData<TokenSchema>` is a valid type)
	Extension(privatedata): Extension<jsonwebtoken::TokenData<TokenSchema>>,
	// Extract JSON payload into `UpdateProfileSchema` struct
	Json(mut body): Json<UpdateProfileSchema>
) -> impl IntoResponse {
	// Get a mutable connection from the pool
	let mut conn = spellbook_pool!(pool);
	// Sanitize and validate the UUID from the JWT token data
	let clean_uuid = spellbook_uuid!(&privatedata.claims.uuid);

	// Sanitize the body data (presumably to prevent injection attacks and validate input)
	body.sanitize();

	// Attempt to update the profile in the database
	match
		diesel
			::update(profile::table) // Specify the table to update
			.filter(profile::uuid.eq(clean_uuid)) // Filter to the specific user's UUID
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

//	!	[Shield]

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
	let clean_action = crate::harden::sanitize_string_limit(&action);

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
				return axum::response::Response::builder()
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
		return axum::response::Response::builder()
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
				Json(serde_json::json!({ "error": "POST request failed", "message": e.to_string() })),
			).into_response(),

	}
}


//	?	[Player] -> Register -> with Captcha

#[derive(Debug, Deserialize, Serialize)]
pub struct AuthPlayerRegisterSchema {
	pub username: String,
	pub email: String,
	pub password: String,
	pub token: String,
	pub invite: Option<String>,
}

impl AuthPlayerRegisterSchema {

	pub fn sanitize(&mut self) -> Result<(), String> {

		//	Sanitize the Username - Part 1 - Cleaning the string / turncating using Ammonia crate.
		let limited_username = crate::harden::sanitize_string_limit(&self.username);

		//	Sanitize the Username - Part 2 - Additional safety checks.
		match crate::harden::sanitize_username(&limited_username) {
            Ok(clean_username) => {
                self.username = clean_username;
            },
            Err(e) => {
                return Err(e.to_string())
            },
		}

		//	Sanitize the Email - Part 1 - Cleaning the string and limiting it using Ammonia Crate.
		let limited_email = crate::harden::sanitize_string_limit(&self.email);
		
		//	Sanitize the Email - Part 2 - Regex and additional checks in place from the harden crate.
		match crate::harden::sanitize_email(&limited_email) {
			Ok(clean_email) => {
				self.email = clean_email;
			},
			Err(e) => {
				return Err(e.to_string())
			}
		}

		//	Validation of the Password
		match crate::harden::validate_password(&self.password) {
			Ok(_) => {
			},
			Err(e) => {
				return Err(e.to_string())
			}
		}

		//	Apply sanitization to the invite if it is in Schema.
		if let Some(invite) = &self.invite {
				// Perform necessary sanitization on the invite
				let sanitized_invite = crate::harden::sanitize_string_limit(invite);
			
				// TODO: Additional validation logic for invite can go here, if needed

				// Update the invite field with the sanitized value
				self.invite = Some(sanitized_invite);
		}

	
		//	Sanitization is complete.
		Ok(())

	}


}

pub async fn auth_player_register(
	Extension(pool): Extension<Arc<Pool>>,
	Json(mut body): Json<AuthPlayerRegisterSchema>
) -> impl IntoResponse {

		// Captcha
		match crate::harden::verify_captcha(&body.token).await {
			Ok(success) => {
				if !success {
					return (StatusCode::UNPROCESSABLE_ENTITY, "Invalid captcha").into_response();
				}
			},
			Err(_) => {
				return (StatusCode::INTERNAL_SERVER_ERROR, "Captcha verification failed").into_response();
			},
		}

		if let Err(e) = body.sanitize() {
			return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e);
		}
		
		// Get a mutable connection from the pool and pass it along to verify.
		let mut conn = spellbook_pool!(pool);
		
		//	[!] Check Email - Check if the player email address exists within the database.
		match crate::playerdb::hazardous_boolean_email_exist(body.email.clone(), pool.clone()).await {
			Ok(false) => {},
			Ok(true) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "email-exists")},
			Err(e) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e)}
		}

		//	[!] Check Player - Check if the player username exists within the database.
		match crate::playerdb::hazardous_boolean_username_exist(body.username.clone(), pool.clone()).await {
			Ok(false) => {},
			Ok(true) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "username-exists")},
			Err(e) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e)}
		}

		//	[START] => Password generation!
		let salt = SaltString::generate(&mut rand_core::OsRng);

		let hash = match Argon2::default().hash_password(body.password.as_bytes(), &salt) {
			Ok(value) => value,
			Err(_) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "invaild_hash")}
		};

		//	[&] Create User
		match crate::playerdb::hazardous_create_user(body.username.clone(), pool.clone()).await {
			Ok(true) => {},
			Ok(false) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "process-user-failed")},
			Err(e) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e)}
		}

		//	[#]	Obtain UUID
		let uuid = match crate::playerdb::task_fetch_userid_by_username(body.username.clone(), pool.clone()).await {
			Ok(value) => value,
			Err(_) =>  { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "process-uuid-failed")}
		};

		//	[&] Create Auth
		match crate::playerdb::hazardous_create_auth_from_uuid(hash.clone().to_string(), body.email.clone(), uuid.clone(), pool.clone()).await {
			Ok(true) => {},
			Ok(false) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "process-auth-failed")},
			Err(e) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e)}
		}

		//	[&]	Create Profile
		match crate::playerdb::hazardous_create_profile_from_uuid(body.username.clone(), uuid.clone(), pool.clone()).await {
			Ok(true) => {},
			Ok(false) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "process-profile-failed")},
			Err(e) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e)}
		}

		//	[#] Check Email - This time we want it to return true because the user should be registered.
		match crate::playerdb::hazardous_boolean_email_exist(body.email.clone(), pool.clone()).await {
			Ok(true) => {},
			Ok(false) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, "auth-register-fail")},
			Err(e) => { return spellbook_error!(axum::http::StatusCode::BAD_REQUEST, &e)}
		}

		spellbook_complete!("register-complete")
	
}

//	?	N8N
