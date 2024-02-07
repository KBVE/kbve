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
	utility::{ cors_service, fallback, global_map_init, root_endpoint },
	runes::{ GLOBAL },
	entity::{ KbveState },
	session::{ middleware_jwt },
};

use jedi::builder::ValidatorBuilder;

#[tokio::main]
async fn main() {
	println!("◈ [LAUNCH] 🚀");

	let pool = db::establish_connection_pool();
	let shared_pool = Arc::new(pool);
	//let api_session_store = Arc::new(APISessionStore::new());

	let validator_builder = ValidatorBuilder::<String, String>::new();
	let shared_validator_builder = Arc::new(validator_builder);

	// Create KbveState
	let kbve_state = KbveState::new(
		shared_pool.clone(),
		shared_validator_builder
	);

	let application_state = Arc::new(kbve_state);

	match global_map_init(shared_pool.clone()).await {
		Ok(map) => {
			GLOBAL.set(Arc::new(map)).expect("Failed to initialize GLOBAL");
			println!("Global Map -> init.");
		}
		Err(e) => println!("Global Map -> fail -> {}", e),
	}

	let corslight = cors_service();

	let api_routes = Router::new()
		.route("/health", get(kbve::sys::system_health_check))
		.route("/svg", get(kbve::entity::svg_handler))
		.route("/jedi", get(kbve::entity::jedi_controller))
		.route("/sheet", get(kbve::entity::sheet_controller))
		.route("/speed", get(kbve::sys::system_database_speed_test))
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
		//	! Character Creation
		.route(
			"/auth/character-creation",
			post(kbve::entity::character_creation_handler).route_layer(
				middleware::from_fn_with_state(
					shared_pool.clone(),
					middleware_jwt
				)
			)
		)
		.route(
			"/shieldwall/:action",
			get(kbve::authentication::shieldwall_action).route_layer(
				middleware::from_fn(kbve::authentication::shieldwall)
			)
		)

		.route("/auth/logout", get(kbve::authentication::auth_logout))
		.route(
			"/auth/register",
			post(kbve::authentication::auth_player_register)
		)
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
		.layer(Extension(application_state))
		.layer(corslight)
		.fallback(fallback);
		//.with_state(shared_pool);

	axum::Server
		::bind(&"0.0.0.0:3000".parse().unwrap())
		.serve(app.into_make_service()).await
		.unwrap();
}
