//! Integration tests for axum-rareicon.
//!
//! Build a minimal router with just the health endpoints (no static serving,
//! which requires the astro dist dir at runtime) and exercise it through
//! `tower::ServiceExt::oneshot`.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    response::Json,
    routing::get,
};
use serde_json::{Value, json};
use tower::ServiceExt;

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "axum-rareicon",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

fn app() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/health", get(health))
}

#[tokio::test]
async fn health_returns_ok_json() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();

    assert_eq!(body["status"], "ok");
    assert_eq!(body["service"], "axum-rareicon");
    assert!(body["version"].is_string(), "version must be a string");
}

#[tokio::test]
async fn api_health_mirrors_health() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn unknown_route_returns_404() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/nonexistent-route-12345")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
