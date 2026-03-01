use crate::db::Pool;
use crate::runes::WizardResponse;

use std::sync::Arc;

use axum::{Json, extract::Extension, http::StatusCode, response::IntoResponse};

use serde_json::{Value, json};

use diesel::prelude::*;

use anyhow::Error;

use tokio::task;
use tokio::time::Instant;

pub async fn system_health_check(Extension(pool): Extension<Arc<Pool>>) -> impl IntoResponse {
    let connection_result = task::spawn_blocking(move || pool.get()).await;

    match connection_result {
        Ok(Ok(_conn)) => (WizardResponse {
            data: json!({"status": "online"}),
            message: json!({"health": "ok"}),
        })
        .into_response(),
        Ok(Err(e)) => {
            let error_message = format!("Database connection error: {}", e);
            let error_response = WizardResponse {
                data: json!({"status": "error"}),
                message: json!({ "error": error_message }),
            };
            (StatusCode::SERVICE_UNAVAILABLE, Json(error_response)).into_response()
        }
        Err(e) => {
            let error_message = format!("Internal server error: {}", e);
            let error_response = WizardResponse {
                data: json!({"status": "error"}),
                message: json!({ "error": error_message }),
            };
            (StatusCode::INTERNAL_SERVER_ERROR, Json(error_response)).into_response()
        }
    }
}

pub async fn system_database_speed_test(
    Extension(pool): Extension<Arc<Pool>>,
) -> impl IntoResponse {
    let start_time = Instant::now();

    let query_result = task::spawn_blocking(move || -> Result<(), Error> {
        let mut conn = pool
            .get()
            .map_err(|e| anyhow::Error::msg(format!("Failed to get database connection: {}", e)))?;

        diesel::sql_query("SELECT 1")
            .execute(&mut conn)
            .map_err(|e| anyhow::Error::msg(format!("Database query failed: {}", e)))?;

        Ok(())
    })
    .await;

    match query_result {
        Ok(Ok(_)) => {
            let elapsed_time = start_time.elapsed().as_millis() as u64;
            (WizardResponse {
                data: json!({"status": "success"}),
                message: json!({"time_ms": elapsed_time}),
            })
            .into_response()
        }
        Ok(Err(e)) => {
            let error_message = format!("Error: {}", e);
            let error_response = WizardResponse {
                data: json!({"status": "error"}),
                message: json!({ "error": error_message }),
            };
            (StatusCode::INTERNAL_SERVER_ERROR, Json(error_response)).into_response()
        }
        Err(_) => {
            let error_message = "Internal server error: Task failed to execute";
            let error_response = WizardResponse {
                data: json!({"status": "error"}),
                message: json!({ "error": error_message }),
            };
            (StatusCode::INTERNAL_SERVER_ERROR, Json(error_response)).into_response()
        }
    }
}

// In this call_n8n example, we will include a fallback for the sake of the dev cycle.

pub async fn call_n8n_service() -> impl IntoResponse {
    let client = reqwest::Client::new();

    // Attempt to call the first service
    if let Ok(resp) = client.get("http://n8n:5678/workflows").send().await {
        if let Ok(json) = resp.json::<Value>().await {
            return (StatusCode::OK, Json(json));
        }
    }

    match client
        .get("https://automation.kbve.com/workflows")
        .send()
        .await
    {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(json) => (StatusCode::OK, Json(json)),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({"error": format!("Failed to parse response from automation.kbve.com: {}", e)}),
                ),
            ),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(
                json!({"error": format!("Failed to call both n8n and automation.kbve.com services: {}", e)}),
            ),
        ),
    }
}
