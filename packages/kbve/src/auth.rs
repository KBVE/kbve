//!         [AUTH]
//?         Migration of all Auth related functions.

use crate::{ spellbook_create_cookie };

use crate::runes::{ TokenRune };

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
