use std::sync::Arc;
use std::time::Instant;

use axum::{
    http::StatusCode,
    extract::{Extension, Path},
    response::Json,
    routing::get,
    Router,
};
use serde::Serialize;
use tokio;
use tokio::task;

use diesel::prelude::*;

use rust_db::db::{self, Pool};
use rust_db::models::{User};
//use rust_db::models::{User, Profile};

use rust_db::schema::users::dsl::{users, username as users_username};
//use rust_db::schema::profile::dsl::{profile, uuid as profile_uuid};


#[derive(Serialize)]
struct SpeedTestResponse {
    response_time_ms: u64,
}

#[derive(Serialize)]
struct HealthCheckResponse {
    status: String,
}

#[derive(Serialize)]
struct UserResponse {
    id: u64,
    username: String,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        UserResponse {
            id: user.id,
            username: user.username.unwrap_or_default(),
            // initialize other fields
        }
    }
}


async fn get_user_by_username(
    Path(username): Path<String>,
    Extension(pool): Extension<Arc<Pool>>,
) -> Result<Json<UserResponse>, StatusCode> {
    let mut conn = match pool.get() {
        Ok(conn) => conn,
        Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
    };

    let query_result: QueryResult<Vec<User>> = users
        .filter(users_username.eq(username))
        .load::<User>(&mut conn);

        match query_result {
            Ok(mut found_users) => {
                if let Some(user) = found_users.pop() {
                    Ok(Json(UserResponse::from(user)))
                } else {
                    Err(StatusCode::NOT_FOUND)
                }
            }
            Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
        }
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

async fn speed_test(Extension(pool): Extension<Arc<Pool>>) -> Result<Json<SpeedTestResponse>, StatusCode> {
    let start_time = Instant::now();

    // Use `block_in_place` or `spawn_blocking` for the blocking database operation
    let query_result = task::block_in_place(|| {
        let mut conn = pool.get().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

        // Execute a simple query
        diesel::sql_query("SELECT 1")
            .execute(&mut conn)
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)
    });

    match query_result {
        Ok(_) => {
            let elapsed_time = start_time.elapsed();
            Ok(Json(SpeedTestResponse {
                response_time_ms: elapsed_time.as_millis() as u64, // Response time in milliseconds
            }))
        },
        Err(status) => Err(status),
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
        .route("/speed", get(speed_test))
        .route("/username/:username", get(get_user_by_username))
        .layer(Extension(shared_pool.clone()))
        .with_state(shared_pool);
        

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .await
        .unwrap();
}