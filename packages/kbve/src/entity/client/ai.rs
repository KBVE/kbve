use std::sync::Arc;
use tokio::task;
use tokio::time::Duration;
use tracing::{info, warn, error};
use jedi::groq::{GroqClient, GroqRequestBody, GroqMessage, GroqResponse};
use axum::{Json, extract::Extension, response::IntoResponse};
use serde_json::Value;
use serde::{Deserialize, Serialize};


#[derive(Deserialize)]
pub struct AiGroqRequest {
    message: String,
    model: String,
    system: Option<String>,
    response_format: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct GithubGroqRequest {
    message: String,
    model: Option<String>,
    system: Option<String>,
    response_format: Option<serde_json::Value>,
    api_key: Option<String>,
}


pub async fn groq_handler(
    Extension(client): Extension<Arc<GroqClient>>,
    Json(payload): Json<AiGroqRequest>,
) -> impl IntoResponse {

    let mut messages = vec![];

    if let Some(system_message) = payload.system {
        messages.push(GroqMessage {
            role: "system".to_string(),
            content: system_message
        });
    }

    messages.push(GroqMessage {
        role: "user".to_string(),
        content: payload.message,
    });

    let body = GroqRequestBody {
        messages,
        model: payload.model,
        response_format: payload.response_format,
    };

    let client_clone = Arc::clone(&client); 

    let task1 = task::spawn(async move {
        match client_clone.test_request(&body).await {
            Ok(response) => Ok(response),
            Err(e) => {
                error!("Error: {:?}", e);
                Err("Error occurred".to_string())
            },
        }
    });

    match task1.await {
        Ok(Ok(response)) => Json(response).into_response(),
        Ok(Err(e)) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        Err(e) => {
            error!("Task error: {:?}", e);
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Task error occurred".to_string()).into_response()
        },
    }

} 


pub async fn setup_groqclient(api_key: String) -> Arc<GroqClient> {
    let rate_limit_delay = Duration::from_secs(1);
    let max_retries = 3;
    let client_pool = 5;
    Arc::new(GroqClient::new(api_key, client_pool, rate_limit_delay, max_retries))
    
}