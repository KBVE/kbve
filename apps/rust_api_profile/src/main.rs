use std::sync::Arc;

use axum::{
	extract::{ Extension },
	routing::{ get, post },
	Router,
	middleware,
};

use tokio;

use kbve::{
	db::{ self },
	authentication::{ graceful },
	utility::{ cors_service, fallback, global_map_init, health_check, speed_test, root_endpoint },
	runes::{  GLOBAL, }
};

#[tokio::main]
async fn main() {
	println!("◈ [LAUNCH] 🚀");

	let pool = db::establish_connection_pool();
	let shared_pool = Arc::new(pool);
	//let api_session_store = Arc::new(APISessionStore::new());

	match global_map_init(shared_pool.clone()).await {
		Ok(map) => {
			GLOBAL.set(Arc::new(map)).expect("Failed to initialize GLOBAL");
			println!("Global Map -> init.");
		}
		Err(e) => println!("Global Map -> fail -> {}", e),
	}

	let corslight = cors_service();

	let api_routes = Router::new()
		.route("/health", get(health_check))
		.route("/speed", get(speed_test))
		.route(
			"/graceful/profile",
			get(kbve::authentication::graceful_jwt_profile).route_layer(
				middleware::from_fn_with_state(shared_pool.clone(), graceful)
			)
		)
		.route(
			"/auth/profile",
			get(kbve::authentication::auth_jwt_profile).route_layer(
				middleware::from_fn_with_state(shared_pool.clone(), graceful)
			)
		)
		.route(
			"/auth/profile/update",
			post(kbve::authentication::auth_jwt_update_profile).route_layer(
				middleware::from_fn_with_state(shared_pool.clone(), graceful)
			)
		)
		.route(
			"/shieldwall/:action",
			get(kbve::authentication::shieldwall_action).route_layer(
				middleware::from_fn(kbve::authentication::shieldwall)
			)
		)

		.route("/auth/logout", get(kbve::authentication::auth_logout))
		.route("/auth/register", post(kbve::authentication::auth_player_register))
		.route("/auth/login", post(kbve::authentication::auth_player_login))

		.layer(Extension(shared_pool.clone()));
		//.layer(Extension(api_session_store));

	// ?	Future v2 -> Panda

	let apipanda_routes = Router::new().route("/panda", get(root_endpoint));

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
