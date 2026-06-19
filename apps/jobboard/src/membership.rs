//! Membership / vetting core logic, shared by the REST handlers
//! (`rest/applications.rs`) and the gRPC service (`grpc.rs`).
//!
//! These functions speak the string-id envelope (`SubmitApplicationInput`,
//! `MembershipApplicationView`, …) and domain errors (`ApiError`); each transport
//! adapts them to its own response shape and error type. Authz lives here: the
//! service connects BYPASSRLS, so the FORCE-RLS lockdown is deny-by-default for
//! everyone else and admin actions are gated against `staff.members.permissions`.

use crate::error::{ApiError, pg_err};
use crate::proto::jobboard::{
    AdminApplicationView, MembershipApplicationView, ProfileDraft, SubmitApplicationInput,
};
use crate::state::AppState;
use uuid::Uuid;

pub const CAP_TAKER: i32 = 1;
pub const CAP_POSTER: i32 = 2;
pub const CAP_MASK: i32 = CAP_TAKER | CAP_POSTER;

const STAFF_ADMIN: i32 = 0x4;
const STAFF_SUPERADMIN: i32 = 0x4000_0000;

const TAXONOMY_KIND_DISCIPLINE: i32 = 1;
const AUDIT_KIND_MEMBERSHIP_APPLICATION: i32 = 1;

/// Reject unless the caller is staff with the ADMIN bit (SUPERADMIN overrides).
pub async fn require_admin(app: &AppState, user_id: Uuid) -> Result<(), ApiError> {
    let conn = app.db.read().await?;
    let perms: i32 = conn
        .query_opt(
            "SELECT permissions FROM staff.members WHERE user_id = $1",
            &[&user_id],
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

/// Reject submitted `discipline_ids` that don't resolve to an active discipline
/// (taxonomy kind=1, status>0) inside one of the application's verticals. The
/// approval step INNER JOINs `jobboard.taxonomy`, so unknown/wrong-kind/inactive
/// /cross-vertical ids would otherwise be silently dropped and never land on the
/// public profile. Validating on submit gives the applicant a tight feedback loop.
async fn validate_discipline_ids(
    tx: &tokio_postgres::Transaction<'_>,
    vertical_ids: &[i64],
    discipline_ids: &[i64],
) -> Result<(), ApiError> {
    if discipline_ids.is_empty() {
        return Ok(());
    }
    if vertical_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "discipline_ids require at least one selected vertical".into(),
        ));
    }
    let rows = tx
        .query(
            "SELECT id FROM jobboard.taxonomy
             WHERE id = ANY($1) AND kind = $2 AND status > 0 AND vertical_id = ANY($3)",
            &[&discipline_ids, &TAXONOMY_KIND_DISCIPLINE, &vertical_ids],
        )
        .await
        .map_err(pg_err)?;
    let valid: std::collections::HashSet<i64> = rows.iter().map(|r| r.get::<_, i64>(0)).collect();
    let mut invalid: Vec<i64> = discipline_ids
        .iter()
        .copied()
        .filter(|id| !valid.contains(id))
        .collect();
    invalid.sort_unstable();
    invalid.dedup();
    if !invalid.is_empty() {
        return Err(ApiError::BadRequest(format!(
            "invalid discipline_ids (unknown, inactive, not a discipline, or outside selected verticals): {invalid:?}"
        )));
    }
    Ok(())
}

/// Insert a new pending application for `user_id` and return its view.
pub async fn submit(
    app: &AppState,
    user_id: Uuid,
    body: SubmitApplicationInput,
) -> Result<MembershipApplicationView, ApiError> {
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

    let vertical_ids: Vec<i64> = body.vertical_ids.iter().map(|v| *v as i64).collect();
    let discipline_ids: Vec<i64> = body
        .profile_draft
        .as_ref()
        .map(|d| d.discipline_ids.iter().map(|v| *v as i64).collect())
        .unwrap_or_default();

    let mut conn = app.db.write().await?;
    let tx = conn.transaction().await.map_err(pg_err)?;

    validate_discipline_ids(&tx, &vertical_ids, &discipline_ids).await?;

    let row = tx
        .query_one(
            "INSERT INTO jobboard.member_applications
                 (user_id, requested_capabilities, statement, portfolio_links, profile_draft)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, status, created_at::text",
            &[
                &user_id,
                &caps,
                &body.statement,
                &body.portfolio_links,
                &draft_val,
            ],
        )
        .await
        .map_err(pg_err)?;
    let id: Uuid = row.get(0);
    let status: i32 = row.get(1);
    let created_at: String = row.get(2);

    for vid in &vertical_ids {
        tx.execute(
            "INSERT INTO jobboard.member_application_verticals (application_id, vertical_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING",
            &[&id, vid],
        )
        .await
        .map_err(pg_err)?;
    }

    tx.commit().await.map_err(pg_err)?;

    Ok(MembershipApplicationView {
        id: id.to_string(),
        requested_capabilities: caps,
        statement: body.statement,
        portfolio_links: body.portfolio_links,
        status,
        review_notes: String::new(),
        created_at,
        reviewed_at: None,
        vertical_ids: body.vertical_ids,
        profile_draft: body.profile_draft,
    })
}

/// Latest application for `user_id`, or `None` if they've never applied.
pub async fn get_mine(
    app: &AppState,
    user_id: Uuid,
) -> Result<Option<MembershipApplicationView>, ApiError> {
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
            &[&user_id],
        )
        .await
        .map_err(pg_err)?;

    let Some(r) = row else {
        return Ok(None);
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

    Ok(Some(MembershipApplicationView {
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
    }))
}

/// Pending vetting queue (admin-only).
pub async fn admin_list(
    app: &AppState,
    reviewer_id: Uuid,
) -> Result<Vec<AdminApplicationView>, ApiError> {
    require_admin(app, reviewer_id).await?;
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

    Ok(out)
}

/// Approve or reject a pending application (admin-only). On approval the granted
/// capabilities are materialized as profile rows. Returns the new status code.
pub async fn decide(
    app: &AppState,
    reviewer_id: Uuid,
    app_id: Uuid,
    body: crate::proto::jobboard::DecisionInput,
) -> Result<i32, ApiError> {
    require_admin(app, reviewer_id).await?;

    let mut conn = app.db.write().await?;
    let tx = conn.transaction().await.map_err(pg_err)?;

    let approw = tx
        .query_opt(
            "SELECT user_id, requested_capabilities
             FROM jobboard.member_applications
             WHERE id = $1 AND status = 0
             FOR UPDATE",
            &[&app_id],
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

    let granted: i32 = if body.approve {
        body.grant_capabilities & requested
    } else {
        0
    };
    let new_status: i32 = if body.approve {
        if granted == 0 {
            return Err(ApiError::BadRequest(
                "grant_capabilities must overlap the requested capabilities".into(),
            ));
        }

        let verticals: Vec<i64> = tx
            .query(
                "SELECT vertical_id FROM jobboard.member_application_verticals WHERE application_id = $1",
                &[&app_id],
            )
            .await
            .map_err(pg_err)?
            .iter()
            .map(|r| r.get::<_, i64>(0))
            .collect();

        if granted & CAP_TAKER != 0 {
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
                &[&applicant, &app_id],
            )
            .await
            .map_err(pg_err)?;

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
                &[&applicant, &app_id],
            )
            .await
            .map_err(pg_err)?;

            tx.execute(
                "INSERT INTO jobboard.talent_taxonomy (user_id, vertical_id, taxonomy_id)
                 SELECT DISTINCT $1, t.vertical_id, t.id
                 FROM jobboard.member_applications a
                 CROSS JOIN LATERAL jsonb_array_elements_text(
                     coalesce(a.profile_draft->'discipline_ids', '[]'::jsonb)) did
                 JOIN jobboard.taxonomy t ON t.id = did::bigint
                 WHERE a.id = $2
                 ON CONFLICT DO NOTHING",
                &[&applicant, &app_id],
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
        1
    } else {
        2
    };

    tx.execute(
        "UPDATE jobboard.member_applications
         SET status = $2, reviewed_by = $3, reviewed_at = now(), review_notes = $4
         WHERE id = $1",
        &[&app_id, &new_status, &reviewer_id, &body.notes],
    )
    .await
    .map_err(pg_err)?;

    // Durable trail of who decided which application and which caps were granted.
    // Same tx as the decision so the audit row and the status flip commit atomically.
    let action = if body.approve {
        "membership.approve"
    } else {
        "membership.reject"
    };
    let detail = serde_json::json!({
        "approve": body.approve,
        "requested_capabilities": requested,
        "granted_capabilities": granted,
    });
    tx.execute(
        "INSERT INTO jobboard.audit_log (actor_id, action, target_kind, target_id, detail)
         VALUES ($1, $2, $3, $4, $5)",
        &[
            &reviewer_id,
            &action,
            &AUDIT_KIND_MEMBERSHIP_APPLICATION,
            &app_id.to_string(),
            &detail,
        ],
    )
    .await
    .map_err(pg_err)?;

    tx.commit().await.map_err(pg_err)?;

    Ok(new_status)
}
