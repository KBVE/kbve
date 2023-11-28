use std::sync::Arc;

// Password Helper
use argon2::{
	password_hash::SaltString,
	Argon2,
	PasswordHash,
	PasswordHasher,
	PasswordVerifier,
};
use rand_core::OsRng;

use axum::{
	http::StatusCode,
	extract::{ Extension, Path },
	response::{ IntoResponse },
	Json,
};
use diesel::prelude::*;
use serde_json::Value;

use crate::{ handle_error, kbve_get_conn };
use crate::harden::{ sanitize_email, sanitize_username };
use crate::db::{ Pool };
use crate::models::{ User, Profile };
use crate::wh::{ error_casting, WizardResponse, RegisterUserSchema };
use crate::schema::{ auth, profile, users };

//	Hazardous Functions

pub async fn hazardous_boolean_email_exist(
	clean_email: String,
	pool: Arc<Pool>
) -> Result<bool, &'static str> {

	let mut conn = kbve_get_conn!(pool);

	match
		auth::table
			.filter(auth::email.eq(clean_email))
			.select(auth::uuid)
			.first::<u64>(&mut conn)
	{
		Ok(_) => Ok(true),
		Err(diesel::NotFound) => Ok(false),
		Err(_) => Err("Database error"),
	}
}

// pub async fn hazardous_boolean_username_exist(
// 	clean_username: String,
// 	pool: Arc<Pool>
// ) -> Result<bool, &'static str> {

// 	let mut conn = match pool.get() {
// 		Ok(conn) => conn
// 	}
// }

pub async fn api_get_process_guest_email(
	Path(email): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
	let clean_email = handle_error!(sanitize_email(&email), "invalid_email");
	let mut conn = handle_error!(pool.get(), "database_error");

	let result = hazardous_boolean_email_exist(clean_email, pool).await;

	match result
	{
		Ok(true) => error_casting("email_already_in_use"),
		Ok(false) => error_casting("valid_guest_email"),
		Err(_) => error_casting("database_error"),
	}
}

pub async fn api_get_process_username(
	Path(username): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
	let clean_username = handle_error!(
		sanitize_username(&username),
		"invalid_username"
	);
	let mut conn = handle_error!(pool.get(), "database_error");

	match
		users::table
			.inner_join(profile::table.on(profile::uuid.eq(users::id)))
			.filter(users::username.eq(clean_username))
			.select((users::all_columns, profile::all_columns))
			.first::<(User, Profile)>(&mut conn)
	{
		Ok((user, profile)) => {
			(
				StatusCode::OK,
				Json(WizardResponse {
					data: serde_json::json!({"status": "complete"}),
					message: serde_json::json!({
						"user": user,
						"profile" : profile
				}),
				}),
			)
		}
		Err(diesel::NotFound) => error_casting("username_not_found"),
		Err(_) => error_casting("database_error"),
	}
}

pub async fn api_process_register_user(
	Json(body): Json<RegisterUserSchema>,
	Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
	//	Cleaning Variables

	//	Email Handler
	let clean_email = handle_error!(
		sanitize_email(&body.email),
		"invalid_email"
	);

	match hazardous_boolean_email_exist(clean_email, pool).await
	{
		Ok(true) => return error_casting("email_already_in_use"),
		Ok(false) => {

		},
		Err(_) => return error_casting("database_error"),
		
	}


	let clean_username = handle_error!(
		sanitize_username(&body.username),
		"invalid_username"
	);

	error_casting("wip_route")

}
