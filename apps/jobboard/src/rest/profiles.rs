//! Self-service profiles & portfolio (Phase 2).
//!
//! Capability is profile existence: the talent/client rows are materialized at
//! membership approval, so an update against a missing row means the caller
//! lacks that capability (403). Every route is scoped to the signed-in user —
//! there are no admin paths here.

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, pg_err};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/me/profile", get(get_my_profile))
        .route("/me/talent", put(update_talent))
        .route("/me/client", put(update_client))
        .route(
            "/me/portfolio",
            get(list_portfolio).post(create_portfolio_item),
        )
        .route(
            "/me/portfolio/{id}",
            put(update_portfolio_item).delete(delete_portfolio_item),
        )
}

fn default_currency() -> String {
    "USD".to_string()
}

fn links_array(v: serde_json::Value) -> serde_json::Value {
    if v.is_array() {
        v
    } else {
        serde_json::json!([])
    }
}

// ─────────────────────────── read own profile ───────────────────────────

async fn get_my_profile(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
) -> ApiResult<serde_json::Value> {
    let conn = app.db.read().await?;

    let talent = conn
        .query_opt(
            "SELECT headline, bio, years_experience, availability, rate_min, rate_max,
                    currency, location, links, updated_at::text
             FROM jobboard.talent_profiles WHERE user_id = $1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?
        .map(|r| {
            serde_json::json!({
                "headline": r.get::<_, String>(0),
                "bio": r.get::<_, String>(1),
                "years_experience": r.get::<_, i32>(2),
                "availability": r.get::<_, i32>(3),
                "rate_min": r.get::<_, i64>(4),
                "rate_max": r.get::<_, i64>(5),
                "currency": r.get::<_, String>(6),
                "location": r.get::<_, String>(7),
                "links": r.get::<_, serde_json::Value>(8),
                "updated_at": r.get::<_, String>(9),
            })
        });

    let client = conn
        .query_opt(
            "SELECT org_name, company_size, website, about, updated_at::text
             FROM jobboard.client_profiles WHERE user_id = $1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?
        .map(|r| {
            serde_json::json!({
                "org_name": r.get::<_, String>(0),
                "company_size": r.get::<_, i32>(1),
                "website": r.get::<_, String>(2),
                "about": r.get::<_, String>(3),
                "updated_at": r.get::<_, String>(4),
            })
        });

    Ok(Json(
        serde_json::json!({ "talent": talent, "client": client }),
    ))
}

// ─────────────────────────── update talent profile ───────────────────────────

#[derive(Deserialize)]
struct TalentUpdate {
    #[serde(default)]
    headline: String,
    #[serde(default)]
    bio: String,
    #[serde(default)]
    years_experience: i32,
    #[serde(default)]
    availability: i32,
    #[serde(default)]
    rate_min: i64,
    #[serde(default)]
    rate_max: i64,
    #[serde(default = "default_currency")]
    currency: String,
    #[serde(default)]
    location: String,
    #[serde(default)]
    links: serde_json::Value,
}

async fn update_talent(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Json(body): Json<TalentUpdate>,
) -> ApiResult<serde_json::Value> {
    if body.headline.len() > 200 {
        return Err(ApiError::BadRequest("headline too long".into()));
    }
    if body.bio.len() > 5000 {
        return Err(ApiError::BadRequest("bio too long".into()));
    }
    if !(0..=100).contains(&body.years_experience) {
        return Err(ApiError::BadRequest("years_experience out of range".into()));
    }
    if !(0..=2).contains(&body.availability) {
        return Err(ApiError::BadRequest("availability out of range".into()));
    }
    if body.rate_min < 0 || body.rate_max < 0 || body.rate_min > body.rate_max {
        return Err(ApiError::BadRequest("invalid rate range".into()));
    }
    let links = links_array(body.links);

    let conn = app.db.write().await?;
    let n = conn
        .execute(
            "UPDATE jobboard.talent_profiles
             SET headline = $2, bio = $3, years_experience = $4, availability = $5,
                 rate_min = $6, rate_max = $7, currency = $8, location = $9, links = $10
             WHERE user_id = $1",
            &[
                &user.user_id,
                &body.headline,
                &body.bio,
                &body.years_experience,
                &body.availability,
                &body.rate_min,
                &body.rate_max,
                &body.currency,
                &body.location,
                &links,
            ],
        )
        .await
        .map_err(pg_err)?;
    if n == 0 {
        return Err(ApiError::Forbidden(
            "no talent profile — taker capability required".into(),
        ));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

// ─────────────────────────── update client profile ───────────────────────────

#[derive(Deserialize)]
struct ClientUpdate {
    #[serde(default)]
    org_name: String,
    #[serde(default)]
    company_size: i32,
    #[serde(default)]
    website: String,
    #[serde(default)]
    about: String,
}

async fn update_client(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Json(body): Json<ClientUpdate>,
) -> ApiResult<serde_json::Value> {
    if body.org_name.len() > 200 {
        return Err(ApiError::BadRequest("org_name too long".into()));
    }
    if body.company_size < 0 {
        return Err(ApiError::BadRequest("company_size out of range".into()));
    }
    if body.website.len() > 500 {
        return Err(ApiError::BadRequest("website too long".into()));
    }
    if body.about.len() > 2000 {
        return Err(ApiError::BadRequest("about too long".into()));
    }

    let conn = app.db.write().await?;
    let n = conn
        .execute(
            "UPDATE jobboard.client_profiles
             SET org_name = $2, company_size = $3, website = $4, about = $5
             WHERE user_id = $1",
            &[
                &user.user_id,
                &body.org_name,
                &body.company_size,
                &body.website,
                &body.about,
            ],
        )
        .await
        .map_err(pg_err)?;
    if n == 0 {
        return Err(ApiError::Forbidden(
            "no client profile — poster capability required".into(),
        ));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

// ─────────────────────────── portfolio CRUD ───────────────────────────

async fn list_portfolio(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
) -> ApiResult<serde_json::Value> {
    let conn = app.db.read().await?;
    let rows = conn
        .query(
            "SELECT id, vertical_id, title, description, source, media, sort_order, created_at::text
             FROM jobboard.portfolio_items
             WHERE user_id = $1
             ORDER BY sort_order, created_at DESC, id DESC",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?;

    let items: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<_, Uuid>(0).to_string(),
                "vertical_id": r.get::<_, i64>(1),
                "title": r.get::<_, String>(2),
                "description": r.get::<_, String>(3),
                "source": r.get::<_, String>(4),
                "media": r.get::<_, serde_json::Value>(5),
                "sort_order": r.get::<_, i32>(6),
                "created_at": r.get::<_, String>(7),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "portfolio": items })))
}

#[derive(Deserialize)]
struct PortfolioCreate {
    vertical_id: i64,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    source: String,
    #[serde(default)]
    media: serde_json::Value,
    #[serde(default)]
    sort_order: i32,
}

async fn create_portfolio_item(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Json(body): Json<PortfolioCreate>,
) -> ApiResult<serde_json::Value> {
    let title = body.title.trim();
    if title.is_empty() || title.len() > 200 {
        return Err(ApiError::BadRequest("title must be 1..200 chars".into()));
    }
    if body.description.len() > 5000 {
        return Err(ApiError::BadRequest("description too long".into()));
    }
    let media = if body.media.is_array() {
        body.media
    } else {
        serde_json::json!([])
    };

    let conn = app.db.write().await?;
    // Portfolio is a talent capability — the FK is to auth.users, so gate on the
    // talent profile existing rather than letting any signed-in user post.
    let has_talent = conn
        .query_opt(
            "SELECT 1 FROM jobboard.talent_profiles WHERE user_id = $1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?
        .is_some();
    if !has_talent {
        return Err(ApiError::Forbidden(
            "no talent profile — taker capability required".into(),
        ));
    }

    let row = conn
        .query_one(
            "INSERT INTO jobboard.portfolio_items
                 (user_id, vertical_id, title, description, source, media, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, created_at::text",
            &[
                &user.user_id,
                &body.vertical_id,
                &title,
                &body.description,
                &body.source,
                &media,
                &body.sort_order,
            ],
        )
        .await
        .map_err(pg_err)?;

    Ok(Json(serde_json::json!({
        "id": row.get::<_, Uuid>(0).to_string(),
        "created_at": row.get::<_, String>(1),
    })))
}

#[derive(Deserialize)]
struct PortfolioUpdate {
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    source: String,
    #[serde(default)]
    media: serde_json::Value,
    #[serde(default)]
    sort_order: i32,
}

async fn update_portfolio_item(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<PortfolioUpdate>,
) -> ApiResult<serde_json::Value> {
    let title = body.title.trim();
    if title.is_empty() || title.len() > 200 {
        return Err(ApiError::BadRequest("title must be 1..200 chars".into()));
    }
    if body.description.len() > 5000 {
        return Err(ApiError::BadRequest("description too long".into()));
    }
    let media = if body.media.is_array() {
        body.media
    } else {
        serde_json::json!([])
    };

    // vertical_id is intentionally immutable — portfolio_tags composite-FK it,
    // so changing it would orphan the tags.
    let conn = app.db.write().await?;
    let n = conn
        .execute(
            "UPDATE jobboard.portfolio_items
             SET title = $3, description = $4, source = $5, media = $6, sort_order = $7
             WHERE id = $1 AND user_id = $2",
            &[
                &id,
                &user.user_id,
                &title,
                &body.description,
                &body.source,
                &media,
                &body.sort_order,
            ],
        )
        .await
        .map_err(pg_err)?;
    if n == 0 {
        return Err(ApiError::NotFound(format!("portfolio item {id}")));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_portfolio_item(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<serde_json::Value> {
    let conn = app.db.write().await?;
    let n = conn
        .execute(
            "DELETE FROM jobboard.portfolio_items WHERE id = $1 AND user_id = $2",
            &[&id, &user.user_id],
        )
        .await
        .map_err(pg_err)?;
    if n == 0 {
        return Err(ApiError::NotFound(format!("portfolio item {id}")));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}
