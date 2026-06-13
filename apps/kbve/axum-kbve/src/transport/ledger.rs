//! Wallet ledger read surface.
//!
//! Caller-scoped paged read over `wallet.ledger` for the JWT subject.
//! Issues raw SQL via `jedi::PgCluster::with_caller_read`, which opens
//! a transaction on the read pool and sets `request.jwt.claims` so
//! `auth.uid()` inside the query resolves to the caller. The row-scope
//! invariant (every returned row belongs to the caller) lives in the
//! `WHERE account_id = (SELECT … WHERE user_id = auth.uid() AND
//! kind='user')` clause — server cannot impersonate another user via
//! a query-string trick.

use std::sync::Arc;

use axum::{
    Json,
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use jedi::entity::error::JediError;
use jedi::state::pg::{PgCallerReadFut, PgCluster};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;
use uuid::Uuid;

use super::wallet::resolve_user;
use crate::db::get_pg_cluster;

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;
const DEFAULT_MARKET_KINDS: &[&str] = &["market_buy", "market_sell", "market_fee"];

#[derive(Deserialize, Debug)]
pub(crate) struct LedgerQuery {
    /// Page size, clamped to `[1, 100]`. Defaults to 50.
    pub limit: Option<i64>,
    /// Cursor: timestamp of the last row of the previous page. Required
    /// together with `before_id`.
    pub before_created_at: Option<DateTime<Utc>>,
    /// Cursor: id of the last row of the previous page. Required
    /// together with `before_created_at`.
    pub before_id: Option<i64>,
    /// Comma-separated source kinds. Defaults to the marketplace trio
    /// (`market_buy,market_sell,market_fee`). Pass `all` (case-insensitive)
    /// to widen to the caller's full ledger. Empty string is rejected.
    pub source_kinds: Option<String>,
    /// Currency filter. `credits` or `khash`. Omit for both.
    pub currency: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct LedgerRowDto {
    pub ledger_id: i64,
    pub currency: String,
    pub delta: i64,
    pub balance_after: i64,
    pub source_kind: String,
    pub reason: Option<String>,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
    pub created_at: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct LedgerPageDto {
    pub rows: Vec<LedgerRowDto>,
    pub next_cursor: Option<NextCursorDto>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct NextCursorDto {
    pub before_created_at: String,
    pub before_id: i64,
}

/// `GET /api/v1/wallet/me/ledger` — caller-scoped `wallet.ledger` page.
#[utoipa::path(
    get,
    path = "/api/v1/wallet/me/ledger",
    tag = "wallet",
    params(
        ("limit"             = Option<i64>,     Query, description = "Page size; clamped to [1, 100]; default 50"),
        ("before_created_at" = Option<String>,  Query, description = "Cursor timestamp (paired with before_id)"),
        ("before_id"         = Option<i64>,     Query, description = "Cursor id (paired with before_created_at; must be positive)"),
        ("source_kinds"      = Option<String>,  Query, description = "CSV of wallet.source_kind values; defaults to market_buy,market_sell,market_fee; pass `all` to widen to full ledger"),
        ("currency"          = Option<String>,  Query, description = "credits | khash; omit for both"),
    ),
    responses(
        (status = 200, description = "Caller-scoped ledger page",   body = LedgerPageDto),
        (status = 400, description = "Invalid argument / cursor"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "PgCluster unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_ledger(headers: HeaderMap, Query(q): Query<LedgerQuery>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };

    let cluster = match get_pg_cluster() {
        Some(c) => Arc::clone(c),
        None => return service_unavailable(),
    };

    let params = match LedgerParams::from_query(q) {
        Ok(p) => p,
        Err(resp) => return resp,
    };

    match fetch_ledger(cluster, user_id, params).await {
        Ok(page) => Json(page).into_response(),
        Err(e) => ledger_error_response(e),
    }
}

struct LedgerParams {
    limit: i64,
    before_created_at: Option<DateTime<Utc>>,
    before_id: Option<i64>,
    source_kinds: Option<Vec<String>>,
    currency: Option<String>,
}

impl LedgerParams {
    fn from_query(q: LedgerQuery) -> Result<Self, Response> {
        let limit = q
            .limit
            .map(|v| v.clamp(1, MAX_LIMIT))
            .unwrap_or(DEFAULT_LIMIT);

        match (q.before_created_at, q.before_id) {
            (Some(_), None) | (None, Some(_)) => {
                return Err(bad_request(
                    "invalid_cursor",
                    "before_created_at and before_id must be supplied together",
                ));
            }
            _ => {}
        }
        if let Some(id) = q.before_id {
            if id <= 0 {
                return Err(bad_request("invalid_cursor", "before_id must be positive"));
            }
        }

        let source_kinds = match q.source_kinds.as_deref().map(|s| s.trim()) {
            Some("") => {
                return Err(bad_request(
                    "invalid_source_kinds",
                    "source_kinds cannot be empty; omit the parameter to use defaults or pass `all` to widen to the full ledger",
                ));
            }
            Some(s) if s.eq_ignore_ascii_case("all") => None,
            Some(s) => Some(split_csv(s)),
            None => Some(
                DEFAULT_MARKET_KINDS
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            ),
        };

        let currency = match q.currency.as_deref().map(|s| s.trim()) {
            Some("") | None => None,
            Some(c) => {
                let lower = c.to_ascii_lowercase();
                if lower != "credits" && lower != "khash" {
                    return Err(bad_request(
                        "invalid_currency",
                        "currency must be `credits` or `khash`",
                    ));
                }
                Some(lower)
            }
        };

        Ok(Self {
            limit,
            before_created_at: q.before_created_at,
            before_id: q.before_id,
            source_kinds,
            currency,
        })
    }
}

fn split_csv(s: &str) -> Vec<String> {
    s.split(',')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

async fn fetch_ledger(
    cluster: Arc<PgCluster>,
    user_id: Uuid,
    params: LedgerParams,
) -> Result<LedgerPageDto, JediError> {
    cluster
        .with_caller_read(user_id, None, move |tx| -> PgCallerReadFut<'_, LedgerPageDto> {
            Box::pin(async move {
                let sql = "
                    SELECT
                        id,
                        currency::text,
                        delta,
                        balance_after,
                        source_kind::text,
                        reason,
                        ref_type,
                        ref_id,
                        created_at
                      FROM wallet.ledger
                     WHERE account_id = (
                               SELECT id FROM wallet.account
                                WHERE user_id = auth.uid()
                                  AND kind = 'user'
                           )
                       AND ($1::text[] IS NULL OR source_kind::text = ANY ($1::text[]))
                       AND ($2::text IS NULL OR currency::text = $2::text)
                       AND (
                            $3::timestamptz IS NULL
                            OR created_at < $3::timestamptz
                            OR (created_at = $3::timestamptz AND id < $4::bigint)
                           )
                     ORDER BY created_at DESC, id DESC
                     LIMIT $5::bigint
                ";
                let rows = tx
                    .query(
                        sql,
                        &[
                            &params.source_kinds,
                            &params.currency,
                            &params.before_created_at,
                            &params.before_id,
                            &params.limit,
                        ],
                    )
                    .await
                    .map_err(JediError::from)?;

                let rows: Vec<LedgerRowDto> = rows
                    .iter()
                    .map(|r| {
                        let created_at: DateTime<Utc> = r.get(8);
                        LedgerRowDto {
                            ledger_id: r.get(0),
                            currency: r.get(1),
                            delta: r.get(2),
                            balance_after: r.get(3),
                            source_kind: r.get(4),
                            reason: r.get(5),
                            ref_type: r.get(6),
                            ref_id: r.get(7),
                            created_at: created_at.to_rfc3339(),
                        }
                    })
                    .collect();

                let next_cursor = if rows.len() as i64 == params.limit {
                    rows.last().map(|last| NextCursorDto {
                        before_created_at: last.created_at.clone(),
                        before_id: last.ledger_id,
                    })
                } else {
                    None
                };

                Ok(LedgerPageDto { rows, next_cursor })
            })
        })
        .await
}

fn service_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({"error": "PgCluster unavailable"})),
    )
        .into_response()
}

fn bad_request(code: &str, message: &str) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": code, "message": message })),
    )
        .into_response()
}

fn ledger_error_response(err: JediError) -> Response {
    let body_message = err.to_string();
    let (status, code) = match &err {
        JediError::Timeout => (StatusCode::REQUEST_TIMEOUT, "timeout"),
        JediError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
        JediError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
        JediError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
        JediError::BadRequest(_) => (StatusCode::BAD_REQUEST, "invalid_argument"),
        JediError::Database(_) => {
            // wallet_account_missing (WLT01) surfaces through Database
            // when the auth.uid() subquery returns 0 rows we just yield
            // an empty page; only true db / pool errors land here.
            tracing::error!(error = %err, "ledger query failed");
            (StatusCode::INTERNAL_SERVER_ERROR, "internal")
        }
        _ => {
            tracing::error!(error = %err, "ledger query failed");
            (StatusCode::INTERNAL_SERVER_ERROR, "internal")
        }
    };
    (
        status,
        Json(json!({ "error": code, "message": body_message })),
    )
        .into_response()
}
