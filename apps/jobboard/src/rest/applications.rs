//! Membership / vetting.
//!
//! A signed-in user submits a `member_application` requesting capabilities
//! (taker=1, poster=2). Staff review the pending queue and approve/reject. On
//! approval, the granted capabilities are materialized as profile rows
//! (`talent_profiles` / `client_profiles` + their vertical links) — capability
//! *is* profile existence (see `/auth/me`).
//!
//! Authz is enforced here in the handler: the service connects as a
//! BYPASSRLS role, so the FORCE-RLS lockdown on `member_applications` is the
//! deny-by-default for everyone else, and we gate admin actions against
//! `staff.members.permissions`.

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, pg_err};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use std::sync::Arc;
use tokio_postgres::error::SqlState;
use uuid::Uuid;

use crate::proto::jobboard::{
    AdminApplicationView, Capability, DecisionInput, MembershipApplicationView, ProfileDraft,
    SubmitApplicationInput,
};
const CAP_TAKER: i32 = Capability::CapTaker as i32;
const CAP_POSTER: i32 = Capability::CapPoster as i32;
const CAP_MASK: i32 = CAP_TAKER | CAP_POSTER;

const STAFF_ADMIN: i32 = 0x4;
const STAFF_SUPERADMIN: i32 = 0x4000_0000;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/applications", post(submit).get(my_application))
        .route("/admin/applications", get(admin_list))
        .route("/admin/applications/{id}/decision", post(admin_decide))
}

// ─────────────────────────── helpers ───────────────────────────

/// Reject unless the caller is staff with the ADMIN bit (SUPERADMIN overrides).
async fn require_admin(app: &AppState, user: &AuthUser) -> Result<(), ApiError> {
    let conn = app.db.read().await?;
    let perms: i32 = conn
        .query_opt(
            "SELECT permissions FROM staff.members WHERE user_id = $1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?
        .map(|r| r.get::<_, i32>(0))
        .unwrap_or(0);
    if perms & (STAFF_ADMIN | STAFF_SUPERADMIN) != 0 {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "staff admin permission required".into(),
        ))
    }
}

// ─────────────────────────── submit (taker/poster applicant) ───────────────────────────

async fn submit(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Json(body): Json<SubmitApplicationInput>,
) -> ApiResult<serde_json::Value> {
    let caps = body.requested_capabilities;
    if caps == 0 || (caps & !CAP_MASK) != 0 {
        return Err(ApiError::BadRequest(
            "requested_capabilities must be a subset of taker(1)|poster(2)".into(),
        ));
    }
    if body.statement.len() > 5000 {
        return Err(ApiError::BadRequest("statement too long".into()));
    }
    if body.portfolio_links.len() > 20 {
        return Err(ApiError::BadRequest("too many portfolio links".into()));
    }

    let draft_val = match &body.profile_draft {
        Some(draft) => serde_json::to_value(draft)
            .map_err(|e| ApiError::BadRequest(format!("invalid profile_draft: {e}")))?,
        None => serde_json::json!({}),
    };

    let mut conn = app.db.write().await?;
    let tx = conn.transaction().await.map_err(pg_err)?;

    let row = tx
        .query_one(
            "INSERT INTO jobboard.member_applications
                 (user_id, requested_capabilities, statement, portfolio_links, profile_draft)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, status, created_at::text",
            &[
                &user.user_id,
                &caps,
                &body.statement,
                &body.portfolio_links,
                &draft_val,
            ],
        )
        .await
        .map_err(|e| match e.code() {
            Some(c) if c == &SqlState::UNIQUE_VIOLATION => {
                ApiError::Conflict("you already have a pending application".into())
            }
            Some(c) if c == &SqlState::CHECK_VIOLATION => {
                ApiError::BadRequest("profile draft failed validation".into())
            }
            _ => pg_err(e),
        })?;
    let id: Uuid = row.get(0);

    for vid in &body.vertical_ids {
        let vid = *vid as i64;
        tx.execute(
            "INSERT INTO jobboard.member_application_verticals (application_id, vertical_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING",
            &[&id, &vid],
        )
        .await
        .map_err(pg_err)?;
    }

    tx.commit().await.map_err(pg_err)?;

    Ok(Json(serde_json::json!({
        "id": id,
        "status": row.get::<_, i32>(1),
        "created_at": row.get::<_, String>(2),
    })))
}

// ─────────────────────────── my application (status) ───────────────────────────

async fn my_application(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
) -> ApiResult<serde_json::Value> {
    let conn = app.db.read().await?;
    let row = conn
        .query_opt(
            "SELECT id, requested_capabilities, statement, portfolio_links,
                    status, review_notes, created_at::text, reviewed_at::text,
                    profile_draft::text
             FROM jobboard.member_applications
             WHERE user_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT 1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?;

    let Some(r) = row else {
        return Ok(Json(serde_json::json!({ "application": null })));
    };
    let id: Uuid = r.get(0);
    let vert = conn
        .query(
            "SELECT vertical_id FROM jobboard.member_application_verticals WHERE application_id = $1",
            &[&id],
        )
        .await
        .map_err(pg_err)?;
    let vertical_ids: Vec<u64> = vert.iter().map(|v| v.get::<_, i64>(0) as u64).collect();

    let view = MembershipApplicationView {
        id: id.to_string(),
        requested_capabilities: r.get(1),
        statement: r.get(2),
        portfolio_links: r.get(3),
        status: r.get(4),
        review_notes: r.get(5),
        created_at: r.get(6),
        reviewed_at: r.get(7),
        vertical_ids,
        profile_draft: serde_json::from_str::<ProfileDraft>(&r.get::<_, String>(8)).ok(),
    };

    Ok(Json(serde_json::json!({ "application": view })))
}

// ─────────────────────────── admin: pending queue ───────────────────────────

async fn admin_list(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
) -> ApiResult<serde_json::Value> {
    require_admin(&app, &user).await?;
    let conn = app.db.read().await?;

    let rows = conn
        .query(
            "SELECT a.id, a.user_id, u.email, a.requested_capabilities,
                    a.statement, a.portfolio_links, a.created_at::text,
                    a.profile_draft::text, a.status
             FROM jobboard.member_applications a
             LEFT JOIN auth.users u ON u.id = a.user_id
             WHERE a.status = 0
             ORDER BY a.created_at ASC, a.id ASC",
            &[],
        )
        .await
        .map_err(pg_err)?;

    let mut out = Vec::with_capacity(rows.len());
    for r in &rows {
        let id: Uuid = r.get(0);
        let vert = conn
            .query(
                "SELECT vertical_id FROM jobboard.member_application_verticals WHERE application_id = $1",
                &[&id],
            )
            .await
            .map_err(pg_err)?;
        let vertical_ids: Vec<u64> = vert.iter().map(|v| v.get::<_, i64>(0) as u64).collect();
        out.push(AdminApplicationView {
            id: id.to_string(),
            user_id: r.get::<_, Uuid>(1).to_string(),
            email: r.get(2),
            requested_capabilities: r.get(3),
            statement: r.get(4),
            portfolio_links: r.get(5),
            status: r.get(8),
            created_at: r.get(6),
            vertical_ids,
            profile_draft: serde_json::from_str::<ProfileDraft>(&r.get::<_, String>(7)).ok(),
        });
    }

    Ok(Json(serde_json::json!({ "applications": out })))
}

// ─────────────────────────── admin: decision (approve/reject) ───────────────────────────

async fn admin_decide(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<DecisionInput>,
) -> ApiResult<serde_json::Value> {
    require_admin(&app, &user).await?;

    let mut conn = app.db.write().await?;
    let tx = conn.transaction().await.map_err(pg_err)?;

    // Lock the application; must still be pending.
    let approw = tx
        .query_opt(
            "SELECT user_id, requested_capabilities
             FROM jobboard.member_applications
             WHERE id = $1 AND status = 0
             FOR UPDATE",
            &[&id],
        )
        .await
        .map_err(pg_err)?;
    let Some(approw) = approw else {
        return Err(ApiError::Conflict(
            "application not found or already decided".into(),
        ));
    };
    let applicant: Uuid = approw.get(0);
    let requested: i32 = approw.get(1);

    let new_status: i32 = if body.approve {
        let granted = body.grant_capabilities & requested;
        if granted == 0 {
            return Err(ApiError::BadRequest(
                "grant_capabilities must overlap the requested capabilities".into(),
            ));
        }

        let verticals: Vec<i64> = tx
            .query(
                "SELECT vertical_id FROM jobboard.member_application_verticals WHERE application_id = $1",
                &[&id],
            )
            .await
            .map_err(pg_err)?
            .iter()
            .map(|r| r.get::<_, i64>(0))
            .collect();

        if granted & CAP_TAKER != 0 {
            // Materialize the public talent profile from the submitted draft.
            tx.execute(
                "INSERT INTO jobboard.talent_profiles
                     (user_id, headline, bio, years_experience, location, links)
                 SELECT $1,
                        coalesce(d->>'headline', ''),
                        coalesce(d->>'bio', ''),
                        coalesce(nullif(d->>'years_experience', '')::int, 0),
                        coalesce(d->>'location', ''),
                        coalesce(d->'links', '[]'::jsonb)
                 FROM (SELECT profile_draft AS d FROM jobboard.member_applications WHERE id = $2) s
                 ON CONFLICT (user_id) DO UPDATE SET
                     headline = excluded.headline,
                     bio = excluded.bio,
                     years_experience = excluded.years_experience,
                     location = excluded.location,
                     links = excluded.links,
                     updated_at = now()",
                &[&applicant, &id],
            )
            .await
            .map_err(pg_err)?;

            // Verticals: the ones requested on the application, plus any implied
            // by the chosen disciplines.
            for vid in &verticals {
                tx.execute(
                    "INSERT INTO jobboard.talent_verticals (user_id, vertical_id)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    &[&applicant, vid],
                )
                .await
                .map_err(pg_err)?;
            }
            tx.execute(
                "INSERT INTO jobboard.talent_verticals (user_id, vertical_id)
                 SELECT DISTINCT $1, t.vertical_id
                 FROM jobboard.member_applications a
                 CROSS JOIN LATERAL jsonb_array_elements_text(
                     coalesce(a.profile_draft->'discipline_ids', '[]'::jsonb)) did
                 JOIN jobboard.taxonomy t ON t.id = did::bigint
                 WHERE a.id = $2
                 ON CONFLICT DO NOTHING",
                &[&applicant, &id],
            )
            .await
            .map_err(pg_err)?;

            // Link the chosen disciplines / skills to the profile.
            tx.execute(
                "INSERT INTO jobboard.talent_taxonomy (user_id, vertical_id, taxonomy_id)
                 SELECT DISTINCT $1, t.vertical_id, t.id
                 FROM jobboard.member_applications a
                 CROSS JOIN LATERAL jsonb_array_elements_text(
                     coalesce(a.profile_draft->'discipline_ids', '[]'::jsonb)) did
                 JOIN jobboard.taxonomy t ON t.id = did::bigint
                 WHERE a.id = $2
                 ON CONFLICT DO NOTHING",
                &[&applicant, &id],
            )
            .await
            .map_err(pg_err)?;
        }
        if granted & CAP_POSTER != 0 {
            tx.execute(
                "INSERT INTO jobboard.client_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
                &[&applicant],
            )
            .await
            .map_err(pg_err)?;
            for vid in &verticals {
                tx.execute(
                    "INSERT INTO jobboard.client_verticals (user_id, vertical_id)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    &[&applicant, vid],
                )
                .await
                .map_err(pg_err)?;
            }
        }
        1 // approved
    } else {
        2 // rejected
    };

    tx.execute(
        "UPDATE jobboard.member_applications
         SET status = $2, reviewed_by = $3, reviewed_at = now(), review_notes = $4
         WHERE id = $1",
        &[&id, &new_status, &user.user_id, &body.notes],
    )
    .await
    .map_err(pg_err)?;

    tx.commit().await.map_err(pg_err)?;

    Ok(Json(serde_json::json!({
        "success": true,
        "id": id,
        "status": new_status,
    })))
}
