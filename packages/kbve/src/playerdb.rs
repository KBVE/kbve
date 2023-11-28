use std::sync::Arc;

use axum::{
	http::StatusCode,
	extract::{ Extension, Path },
	response::{ IntoResponse },
	Json,
};
use diesel::prelude::*;
use serde_json::Value;

use crate::{ handle_error };
use crate::harden::{ sanitize_email, sanitize_username };
use crate::db::{ Pool };
use crate::models::{ User, Profile };
use crate::wh::{ error_casting, WizardResponse };
use crate::schema::{ auth, profile, users };

pub async fn api_get_process_guest_email(
	Path(email): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
	let clean_email = handle_error!(sanitize_email(&email), "invalid_email");
	let mut conn = handle_error!(pool.get(), "database_error");

	match
		auth::table
			.filter(auth::email.eq(clean_email))
			.select(auth::uuid)
			.first::<u64>(&mut conn)
	{
		Ok(_) => error_casting("email_already_in_use"),
		Err(diesel::NotFound) => error_casting("valid_guest_email"),
		Err(_) => error_casting("database_error"),
	}
}

pub async fn api_get_process_username(
	Path(username): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> impl IntoResponse {
	let clean_username = handle_error!(
		sanitize_username(&username),
		"invalid_email"
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
