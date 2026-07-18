use crate::s3backup::client::{list_all, list_page, make_client, S3Config};
use crate::s3backup::summary::summarize;
use axum::{extract::Query, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use serde::Deserialize;
use serde_json::json;

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

async fn summary_handler() -> impl IntoResponse {
    let cfg = S3Config::from_env();
    let client = make_client(&cfg).await;
    match list_all(&client, &cfg.bucket, &cfg.prefix).await {
        Ok(objs) => {
            let s = summarize(&objs, &cfg.prefix, now_secs(), 7);
            Json(json!(s)).into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": "s3_list_failed", "detail": e})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct ObjectsQuery {
    prefix: Option<String>,
    token: Option<String>,
    limit: Option<i32>,
}

async fn objects_handler(Query(q): Query<ObjectsQuery>) -> impl IntoResponse {
    let cfg = S3Config::from_env();
    let client = make_client(&cfg).await;
    let prefix = q.prefix.unwrap_or_default();
    let limit = q.limit.unwrap_or(1000).clamp(1, 1000);
    match list_page(&client, &cfg.bucket, &prefix, q.token, limit).await {
        Ok((objs, next)) => {
            let items: Vec<_> = objs
                .into_iter()
                .map(|o| json!({"key": o.key, "size": o.size, "last_modified": o.last_modified}))
                .collect();
            Json(json!({"objects": items, "next_token": next})).into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": "s3_list_failed", "detail": e})),
        )
            .into_response(),
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/dashboard/kilobase/s3/summary", get(summary_handler))
        .route("/dashboard/kilobase/s3/objects", get(objects_handler))
}
