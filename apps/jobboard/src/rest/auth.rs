use crate::auth::{AuthUser, SESSION_USER_KEY, hash_password, verify_password};
use crate::error::{ApiError, ApiResult, pg_err};
use crate::state::AppState;
use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::sync::Arc;
use tokio_postgres::error::SqlState;
use tower_sessions::Session;
use uuid::Uuid;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
}

#[derive(Deserialize)]
struct RegisterBody {
    email: String,
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

async fn register(
    State(app): State<Arc<AppState>>,
    session: Session,
    Json(body): Json<RegisterBody>,
) -> ApiResult<serde_json::Value> {
    let email = body.email.trim().to_ascii_lowercase();
    let username = body.username.trim().to_string();
    if email.is_empty() || username.is_empty() {
        return Err(ApiError::BadRequest("email and username required".into()));
    }
    if body.password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let password_hash =
        hash_password(&body.password).map_err(|e| ApiError::Internal(e.to_string()))?;

    let conn = app.db.write().await?;
    let row = conn
        .query_one(
            "INSERT INTO jobboard.users (email, username, password_hash)
             VALUES ($1, $2, $3) RETURNING id",
            &[&email, &username, &password_hash],
        )
        .await
        .map_err(|e| {
            if e.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                ApiError::Conflict("email or username already taken".into())
            } else {
                pg_err(e)
            }
        })?;

    let user_id: Uuid = row.get(0);
    session
        .insert(SESSION_USER_KEY, user_id.to_string())
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "user": { "id": user_id, "email": email, "username": username },
    })))
}

async fn login(
    State(app): State<Arc<AppState>>,
    session: Session,
    Json(body): Json<LoginBody>,
) -> ApiResult<serde_json::Value> {
    let email = body.email.trim().to_ascii_lowercase();
    let conn = app.db.write().await?;
    let row = conn
        .query_opt(
            "SELECT id, username, password_hash FROM jobboard.users WHERE email = $1",
            &[&email],
        )
        .await
        .map_err(pg_err)?;

    let row = row.ok_or_else(|| ApiError::Unauthorized("invalid credentials".into()))?;
    let user_id: Uuid = row.get(0);
    let username: String = row.get(1);
    let stored: String = row.get(2);

    if !verify_password(&body.password, &stored) {
        return Err(ApiError::Unauthorized("invalid credentials".into()));
    }

    conn.execute(
        "UPDATE jobboard.users SET last_login = now() WHERE id = $1",
        &[&user_id],
    )
    .await
    .map_err(pg_err)?;

    session
        .insert(SESSION_USER_KEY, user_id.to_string())
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "user": { "id": user_id, "email": email, "username": username },
    })))
}

async fn logout(session: Session) -> ApiResult<serde_json::Value> {
    session
        .flush()
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn me(State(app): State<Arc<AppState>>, user: AuthUser) -> ApiResult<serde_json::Value> {
    let conn = app.db.read().await?;
    let row = conn
        .query_opt(
            "SELECT id, email, username, role, reputation, status
             FROM jobboard.users WHERE id = $1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?;

    let row = row.ok_or_else(|| ApiError::NotFound("user".into()))?;
    Ok(Json(serde_json::json!({
        "id": row.get::<_, Uuid>(0),
        "email": row.get::<_, String>(1),
        "username": row.get::<_, String>(2),
        "role": row.get::<_, i32>(3),
        "reputation": row.get::<_, i32>(4),
        "status": row.get::<_, i32>(5),
    })))
}
