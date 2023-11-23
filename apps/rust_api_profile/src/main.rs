use std::sync::Arc;

/// * [Removed] -> <Path> from extract
use axum::{
	http::StatusCode,
	extract::{ Extension },
	response::Json,
	routing::get,
	Router,
};

/// * [Removed] -> use serde::Serialize;
use tokio;

use diesel::prelude::*;

/// * [Removed] -> <Pool> from db
use kbve::db::{ self };

/// * [Removed] -> use kbve::models::{ User, Profile };
/// * [Removed] -> use kbve::utils::harden::{sanitize_input};

use kbve::utils::helper::{health_check, speed_test};

/// * [Removed Schemas]
// use kbve::schema::users::dsl::{ users, username as users_username, id as user_uuid };
// use kbve::schema::profile::dsl::{
// 	profile as profiles,
// 	uuid as profiles_uuid,
// };

use kbve::dbms::player::playerdb::{get_user_by_username};



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
