use std::sync::Arc;

use axum::{ http::StatusCode, extract::{ Extension, Path }, response::Json };
use diesel::prelude::*;

use crate::utils::harden::{ sanitize_input };
use crate::db::{ Pool };
use crate::models::{ User, Profile };
use crate::dbms::wh::{ UserResponse, ProfileResponse };

use crate::schema::users::dsl::{
	users,
	username as users_username,
	id as user_uuid,
};
use crate::schema::profile::dsl::{ profile as profiles, uuid as profiles_uuid };

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
