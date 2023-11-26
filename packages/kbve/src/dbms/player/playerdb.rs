use std::sync::Arc;

use axum::{ http::StatusCode, extract::{ Extension, Path }, response::Json };
use diesel::prelude::*;

use crate::utils::harden::{ sanitize_input, sanitize_email };
use crate::db::{ Pool };
use crate::models::{ User, Profile, Auth };
use crate::dbms::wh::{ UserResponse, ProfileResponse, WizardResponse };

use crate::schema::users::dsl::{
	users,
	username as users_username,
	id as user_uuid,
};
use crate::schema::profile::dsl::{ profile as profiles, uuid as profiles_uuid };
use crate::schema::auth::dsl::{
	auth as auths,
	uuid as auths_uuid,
	email as auths_email,
};

impl From<User> for UserResponse {
	fn from(user: User) -> Self {
		UserResponse {
			id: user.id,
			username: user.username,
			role: user.role,
			reputation: user.reputation,
			exp: user.exp,
		}
	}
}

impl From<Profile> for ProfileResponse {
	fn from(profile: Profile) -> Self {
		ProfileResponse {
			name: profile.name,
			bio: profile.bio,
			unsplash: profile.unsplash,
			github: profile.github,
			instagram: profile.instagram,
			discord: profile.discord,
		}
	}
}

pub async fn get_user_by_username(
	Path(mut username): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> Result<Json<(UserResponse, ProfileResponse)>, StatusCode> {
	username = sanitize_input(&username);

	let mut conn = match pool.get() {
		Ok(conn) => conn,
		Err(_) => {
			return Err(StatusCode::INTERNAL_SERVER_ERROR);
		}
	};

	let user_profile_query_result = users
		.inner_join(profiles.on(profiles_uuid.eq(user_uuid)))
		.filter(users_username.eq(username))
		.select((users::all_columns(), profiles::all_columns()))
		.first::<(User, Profile)>(&mut conn);

	match user_profile_query_result {
		Ok((user, profile)) => {
			let user_response = UserResponse::from(user);
			let profile_response = ProfileResponse::from(profile);
			Ok(Json((user_response, profile_response)))
		}
		Err(diesel::NotFound) => Err(StatusCode::NOT_FOUND),
		Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
	}
}

pub async fn process_unsafe_internal_guest_email(
	email: &str,
	Extension(pool): Extension<Arc<Pool>>
) -> (bool, String) {
	let clean_email_result = sanitize_email(email);

	let clean_email = match clean_email_result {
		Ok(valid_email) => valid_email.to_string(),
		Err(_) => {
			return (false, "Guest email is invalid or not safe!".to_string());
		}
	};

	let mut conn = match pool.get() {
		Ok(conn) => conn,
		Err(_) => {
			return (
				false,
				"Database error from the pool within PlayerDB Module!".to_string(),
			);
		}
	};

	let query_does_email_exist = auths
		.filter(auths_email.eq(clean_email))
		.select(auths_uuid)
		.first::<u64>(&mut conn);

	match query_does_email_exist {
		Ok(_) => {
			return (
				false,
				"Guest email is already in our database!".to_string(),
			);
		}
		Err(diesel::NotFound) => {
			return (
				true,
				"Guest email is not in our database but is safe!".to_string(),
			);
		}
		Err(e) => {
			return (
				false,
				format!("Database error from the query_does_email_exist {}", e),
			);
		}
	}
}

pub async fn api_get_process_guest_email(
	Path(email): Path<String>,
	Extension(pool): Extension<Arc<Pool>>
) -> Result<Json<WizardResponse>, StatusCode> {
	let (boolean_process_email, message) = process_unsafe_internal_guest_email(
		&email,
		Extension(pool)
	).await;

	match boolean_process_email {
		true => {
			let response = WizardResponse {
				data: "true".to_string(),
				message: message,
			};
			Ok(Json(response))
		}
		false => {
			let response = WizardResponse {
				data: "false".to_string(),
				message: message,
			};
			Ok(Json(response))
		}
	}
}
