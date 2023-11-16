use std::sync::Arc;
use axum::{
    http::StatusCode,
    extract::Extension,
    response::Json,
    routing::get,
    Router,
};
use serde::Serialize;
use tokio;
use tokio::task;
use rust_db::db::{self, Pool};

#[derive(Serialize)]
struct HealthCheckResponse {
    status: String,
}

async fn health_check(Extension(pool): Extension<Arc<Pool>>) -> Result<Json<HealthCheckResponse>, StatusCode> {
    let connection_result = task::spawn_blocking(move || {
        pool.get()
    }).await;

    match connection_result {
        Ok(Ok(_conn)) => {
            Ok(Json(HealthCheckResponse {
                status: "OK".to_string(),
            }))
        },
        _ => {
            Err(StatusCode::SERVICE_UNAVAILABLE)
        }
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
        .route("/health", get(health_check)) // Add the health check route
        .layer(Extension(shared_pool.clone()))
        .with_state(shared_pool);
        

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .await
        .unwrap();
}