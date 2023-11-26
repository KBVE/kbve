use std::sync::Arc;

use axum::{ extract::{ Extension }, routing::get, Router };

use tokio;

use kbve::{
	db::{ self },
	harden::{ cors_service, fallback },
	helper::{ health_check, speed_test, root_endpoint },
	playerdb::{ get_user_by_username, api_get_process_guest_email },
};

#[tokio::main]
async fn main() {
	let pool = db::establish_connection_pool();
	let shared_pool = Arc::new(pool);

	let corslight = cors_service();

	let api_routes = Router::new()
		.route("/health", get(health_check))
		.route("/speed", get(speed_test))
		.route("/profile/:username", get(get_user_by_username))
		.route("/email/:email", get(api_get_process_guest_email))
		.layer(Extension(shared_pool.clone()));

	let app = Router::new()
		.nest("/api/v1", api_routes)
		.route("/", get(root_endpoint))
		.layer(Extension(shared_pool.clone()))
		.layer(corslight)
		.fallback(fallback)
		.with_state(shared_pool);

	axum::Server
		::bind(&"0.0.0.0:3000".parse().unwrap())
		.serve(app.into_make_service()).await
		.unwrap();
}
