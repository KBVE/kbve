use std::sync::Arc;

use axum::{
	http::StatusCode,
	extract::{ Extension, Path },
	response::{ IntoResponse, Json },
};
use diesel::prelude::*;

use crate::{ handle_error };
use crate::harden::{ sanitize_input, sanitize_email, sanitize_username };
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
		Err(diesel::NotFound) => error_casting("vaild_guest_email"),
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
            let json_data = handle_error!(serde_json::to_string(&(user, profile)), "database_error");
			println!("{}", json_data);
            (
                StatusCode::OK,
                Json(WizardResponse {
                    data: "ok".to_string(),
                    message: json_data,
                }),
            )
        },
		Err(diesel::NotFound) => error_casting("vaild_guest_email"),
		Err(_) => error_casting("database_error"),
	}
}

// impl From<User> for UserResponse {
// 	fn from(user: User) -> Self {
// 		UserResponse {
// 			id: user.id,
// 			username: user.username,
// 			role: user.role,
// 			reputation: user.reputation,
// 			exp: user.exp,
// 		}
// 	}
// }

// impl From<Profile> for ProfileResponse {
// 	fn from(profile: Profile) -> Self {
// 		ProfileResponse {
// 			name: profile.name,
// 			bio: profile.bio,
// 			unsplash: profile.unsplash,
// 			github: profile.github,
// 			instagram: profile.instagram,
// 			discord: profile.discord,
// 		}
// 	}
// }

// pub async fn get_user_by_username(
// 	Path(mut username): Path<String>,
// 	Extension(pool): Extension<Arc<Pool>>
// ) -> Result<Json<(UserResponse, ProfileResponse)>, StatusCode> {
// 	username = sanitize_input(&username);

// 	let mut conn = match pool.get() {
// 		Ok(conn) => conn,
// 		Err(_) => {
// 			return Err(StatusCode::INTERNAL_SERVER_ERROR);
// 		}
// 	};

// 	let user_profile_query_result = users
// 		.inner_join(profiles.on(profiles_uuid.eq(user_uuid)))
// 		.filter(users_username.eq(username))
// 		.select((users::all_columns(), profiles::all_columns()))
// 		.first::<(User, Profile)>(&mut conn);

// 	match user_profile_query_result {
// 		Ok((user, profile)) => {
// 			let user_response = UserResponse::from(user);
// 			let profile_response = ProfileResponse::from(profile);
// 			Ok(Json((user_response, profile_response)))
// 		}
// 		Err(diesel::NotFound) => Err(StatusCode::NOT_FOUND),
// 		Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
// 	}
// }
