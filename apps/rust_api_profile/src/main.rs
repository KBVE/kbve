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
	mm::{ graceful },
	harden::{ cors_service, fallback },
	helper::{ health_check, speed_test, root_endpoint },
	wh::{ APISessionStore, GLOBAL, TokenSchema },
	playerdb::{
		hazardous_global_init,
		task_logout_user,
		api_post_process_login_user_handler,
	},
};

#[tokio::main]
async fn main() {
	println!("◈ [LAUNCH] 🚀");

	let pool = db::establish_connection_pool();
	let shared_pool = Arc::new(pool);
	let api_session_store = Arc::new(APISessionStore::new());

	match hazardous_global_init(shared_pool.clone()).await {
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
			get(kbve::dbrms::graceful_jwt_profile).route_layer(
				middleware::from_fn_with_state(shared_pool.clone(), graceful)
			)
		)
		.route(
			"/auth/profile",
			get(kbve::dbrms::auth_jwt_profile).route_layer(
				middleware::from_fn_with_state(shared_pool.clone(), graceful)
			)
		)
		.route(
			"/auth/profile/update",
			post(kbve::dbrms::auth_jwt_update_profile).route_layer(
				middleware::from_fn_with_state(shared_pool.clone(), graceful)
			)
		)
		.route(
			"/shieldwall/:action",
			get(kbve::dbrms::shieldwall_action).route_layer(
				middleware::from_fn(kbve::mm::shieldwall)
			)
		)

		.route("/auth/logout", get(task_logout_user))
		.route("/auth/register", post(kbve::dbrms::auth_player_register))
		.route("/auth/login", post(api_post_process_login_user_handler))

		.layer(Extension(shared_pool.clone()))
		.layer(Extension(api_session_store));

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
