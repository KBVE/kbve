use std::sync::Arc;

use axum::{ extract::{ Extension }, routing::{get, post}, Router };

use tokio;

use kbve::{
	db::{ self },
	harden::{ cors_service, fallback },
	helper::{ health_check, speed_test, root_endpoint },
	wh:: { APISessionStore },
	playerdb::{ api_get_process_guest_email, api_get_process_username, api_post_process_register_user_handler, throwaway_api_get_process_discord_uuid, throwaway_api_get_process_github_uuid },
};

#[tokio::main]
async fn main() {
	let pool = db::establish_connection_pool();
	let shared_pool = Arc::new(pool);
	let api_session_store = Arc::new(APISessionStore::new());

	let corslight = cors_service();

	let api_routes = Router::new()
		.route("/health", get(health_check))
		.route("/speed", get(speed_test))
		.route("/profile/:username", get(api_get_process_username))
		.route("/email/:email", get(api_get_process_guest_email))
		.route("/auth/register", post(api_post_process_register_user_handler))
		.route("/discord/:uuid", get(throwaway_api_get_process_discord_uuid))
		.route("/github/:github", get(throwaway_api_get_process_github_uuid))
		.layer(Extension(shared_pool.clone()))
		.layer(Extension(api_session_store));

	// ?	Future v2 -> Panda

	let apipanda_routes = Router::new()
		.route("/panda", get(root_endpoint));

	let app = Router::new()
		.nest("/api/v1", api_routes)
		.nest("/api/v2", apipanda_routes)
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
