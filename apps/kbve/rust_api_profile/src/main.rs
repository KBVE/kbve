use std::sync::Arc;

use axum::{ extract::{ Extension }, routing::{ get, post }, Router, middleware };

use tokio;

use kbve::{
  db::{ self },
  authentication::{ graceful },
  utility::{ cors_service, fallback, global_map_init, root_endpoint },
  runes::{ GLOBAL },
  entity::{ KbveState, setup_groqclient, groq_handler },
  session::{ middleware_jwt },
};

use jedi::builder::ValidatorBuilder;

#[cfg(feature = "jemalloc")]
mod allocator {
  #[cfg(not(target_env = "msvc"))]
  use tikv_jemallocator::Jemalloc;
  #[cfg(not(target_env = "msvc"))]
  #[global_allocator]
  static GLOBAL: Jemalloc = Jemalloc;
}

#[tokio::main]
async fn main() {
  println!("◈ [LAUNCH] 🚀🚀 v0.1.1.08-09-2024");

  let shared_pool = Arc::new(db::establish_connection_pool());
  let shared_validator_builder = Arc::new(ValidatorBuilder::<String, String>::new());

  let application_state = Arc::new(KbveState::new(shared_pool.clone(), shared_validator_builder));

  match global_map_init(shared_pool.clone()).await {
    Ok(map) => {
      GLOBAL.set(Arc::new(map)).expect("Failed to initialize GLOBAL");
      println!("Global Map -> init.");
    }
    Err(e) => println!("Global Map -> fail -> {}", e),
  }

  let global = GLOBAL.get().expect("GLOBAL not initialized");
  let api_key = global.get("groq").expect("API key not found in GLOBAL").clone();

  let groq_client = setup_groqclient(api_key).await;

  let corslight = cors_service();

  let api_routes = Router::new()
    .route("/ai/groq", post(groq_handler))
    .route("/call_groq", post(groq_handler))
    .route("/health", get(kbve::sys::system_health_check))
    .route("/svg", get(kbve::entity::svg_handler))
    .route("/jedi", get(kbve::entity::jedi_controller))
    .route("/sheet/:character", get(kbve::entity::sheet_controller))
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
    .route(
      "/auth/character-creation",
      post(kbve::entity::character_creation_handler).route_layer(
        middleware::from_fn_with_state(shared_pool.clone(), middleware_jwt)
      )
    )
    .route(
      "/auth/characters",
      get(kbve::entity::authorized_character_data_to_json).route_layer(
        middleware::from_fn_with_state(shared_pool.clone(), middleware_jwt)
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

  let app = Router::new()
    .nest("/api/v1", api_routes)
    .route("/", get(root_endpoint))
    .layer(Extension(shared_pool.clone()))
    .layer(Extension(groq_client))
    .layer(Extension(application_state))
    .layer(corslight)
    .fallback(fallback);

  axum::Server
    ::bind(&"0.0.0.0:3000".parse().unwrap())
    .serve(app.into_make_service()).await
    .unwrap();
}
