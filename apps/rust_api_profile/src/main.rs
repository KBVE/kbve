use std::sync::Arc;

use axum::{
	http::StatusCode,
	extract::{ Extension, Path },
	response::Json,
	routing::get,
	Router,
};
use serde::Serialize;
use tokio;

use diesel::prelude::*;

use kbve::db::{ self, Pool };
use kbve::models::{ User, Profile };
use kbve::utils::harden::{sanitize_input};

use kbve::utils::helper::{health_check, speed_test};

use kbve::schema::users::dsl::{ users, username as users_username, id as user_uuid };
use kbve::schema::profile::dsl::{
	profile as profiles,
	uuid as profiles_uuid,
};


#[derive(Serialize)]
struct UserResponse {
	id: u64,
	username: String,
}

impl From<User> for UserResponse {
	fn from(user: User) -> Self {
		UserResponse {
			id: user.id,
			username: user.username,
		}
	}
}

#[derive(Serialize)]
struct ProfileResponse {
	name: String,
	bio: String,
}

impl From<Profile> for ProfileResponse {
	fn from(profile: Profile) -> Self {
		ProfileResponse {
			name: profile.name,
			bio: profile.bio,
		}
	}
}


async fn get_user_by_username(
    Path(mut username): Path<String>,
    Extension(pool): Extension<Arc<Pool>>
) -> Result<Json<(UserResponse, ProfileResponse)>, StatusCode> {

    username = sanitize_input(&username);

    let mut conn = match pool.get() {
        Ok(conn) => conn,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
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


async fn root() -> String {
	"Welcome!".to_string()
}

#[tokio::main]
async fn main() {
	let pool = db::establish_connection_pool();
	let shared_pool = Arc::new(pool);

	let app = Router::new()
		.route("/", get(root))
		.route("/health", get(health_check)) 
		.route("/speed", get(speed_test))
        .route("/profile/:username", get(get_user_by_username))
		.layer(Extension(shared_pool.clone()))
		.with_state(shared_pool);

	axum::Server
		::bind(&"0.0.0.0:3000".parse().unwrap())
		.serve(
			app.into_make_service_with_connect_info::<std::net::SocketAddr>()
		).await
		.unwrap();
}
