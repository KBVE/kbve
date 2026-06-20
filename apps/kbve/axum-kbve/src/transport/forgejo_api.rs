//! Typed Forgejo routes backed by the jedi `forgejo` client.
//!
//! Reads are DASHBOARD_VIEW-gated; mutations are DASHBOARD_MANAGE-gated. All
//! responses are typed JSON or normalised `JediError`. Includes a server-side
//! `/stats` aggregate (true storage/counts across every repo, not just the
//! loaded page) and Actions runner registration endpoints.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::{
    Json, Router,
    extract::{Path, Query},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};

use jedi::entity::error::JediError;
use jedi::entity::forgejo::{
    ForgejoClient, ForgejoPolicy, ForgejoRepo, ForgejoStats, ForgejoStorage, ForgejoStorageError,
    repo_storage, verify_schema,
};

use super::proxy::{require_dashboard_manage_with_query, require_dashboard_view};
use crate::db::get_pg_cluster;

/// Aggregates (`/stats`, `/storage`) page through every repo / owner upstream,
/// so they are cached server-side: the 30s dashboard refresh re-hits Forgejo at
/// most once per TTL instead of re-aggregating on every request.
const AGG_TTL: Duration = Duration::from_secs(300);

static STATS_CACHE: OnceLock<Mutex<Option<(Instant, ForgejoStats)>>> = OnceLock::new();
static STORAGE_CACHE: OnceLock<Mutex<Option<(Instant, ForgejoStorage)>>> = OnceLock::new();

/// Last observed health of the Forgejo-DB storage enrichment. The dashboard's
/// per-repo git/LFS split is read from Forgejo's internal schema (the REST API
/// only exposes the combined `size`); this records whether that read is healthy
/// so a Forgejo upgrade that renames a column surfaces loud instead of silently
/// degrading the numbers back to git-only.
static STORAGE_DB_HEALTH: Mutex<(StorageHealth, Option<String>)> =
    Mutex::new((StorageHealth::Unknown, None));

#[derive(Clone, Copy, PartialEq, Eq)]
enum StorageHealth {
    Unknown,
    Ok,
    SchemaDrift,
    AccessDenied,
    Db,
    Unconfigured,
}

impl StorageHealth {
    fn as_str(self) -> &'static str {
        match self {
            StorageHealth::Unknown => "unknown",
            StorageHealth::Ok => "ok",
            StorageHealth::SchemaDrift => "schema_drift",
            StorageHealth::AccessDenied => "access_denied",
            StorageHealth::Db => "db_error",
            StorageHealth::Unconfigured => "unconfigured",
        }
    }
}

fn record_storage_health(status: StorageHealth, detail: Option<String>) {
    if let Ok(mut g) = STORAGE_DB_HEALTH.lock() {
        *g = (status, detail);
    }
}

/// Fills each repo's `git_size`/`lfs_size` from Forgejo's DB. Degrades to the
/// REST-only `size` on any failure and records why, never failing the request.
async fn enrich_repo_storage(repos: &mut [ForgejoRepo]) {
    if repos.is_empty() {
        return;
    }
    let Some(cluster) = get_pg_cluster() else {
        record_storage_health(
            StorageHealth::Unconfigured,
            Some("PgCluster unavailable".into()),
        );
        return;
    };
    let ids: Vec<i64> = repos.iter().map(|r| r.id as i64).collect();
    match repo_storage(&cluster, &ids).await {
        Ok(map) => {
            for r in repos.iter_mut() {
                if let Some((git, lfs)) = map.get(&(r.id as i64)) {
                    r.git_size = *git;
                    r.lfs_size = *lfs;
                }
            }
            record_storage_health(StorageHealth::Ok, None);
        }
        Err(e) => {
            let status = match e {
                ForgejoStorageError::SchemaDrift { .. } => StorageHealth::SchemaDrift,
                ForgejoStorageError::AccessDenied => StorageHealth::AccessDenied,
                ForgejoStorageError::Db(_) => StorageHealth::Db,
            };
            tracing::warn!("Forgejo-API per-repo storage enrichment degraded: {e}");
            record_storage_health(status, Some(e.to_string()));
        }
    }
}

async fn cached_stats(c: &ForgejoClient, force: bool) -> Result<ForgejoStats, JediError> {
    let cell = STATS_CACHE.get_or_init(|| Mutex::new(None));
    if !force {
        if let Some(v) = cell.lock().ok().and_then(|g| {
            g.as_ref()
                .filter(|(t, _)| t.elapsed() < AGG_TTL)
                .map(|(_, v)| v.clone())
        }) {
            return Ok(v);
        }
    }
    let fresh = c.repo_stats().await?;
    if let Ok(mut g) = cell.lock() {
        *g = Some((Instant::now(), fresh.clone()));
    }
    Ok(fresh)
}

async fn cached_storage(c: &ForgejoClient, force: bool) -> Result<ForgejoStorage, JediError> {
    let cell = STORAGE_CACHE.get_or_init(|| Mutex::new(None));
    if !force {
        if let Some(v) = cell.lock().ok().and_then(|g| {
            g.as_ref()
                .filter(|(t, _)| t.elapsed() < AGG_TTL)
                .map(|(_, v)| v.clone())
        }) {
            return Ok(v);
        }
    }
    let fresh = c.instance_storage().await?;
    if let Ok(mut g) = cell.lock() {
        *g = Some((Instant::now(), fresh.clone()));
    }
    Ok(fresh)
}

static FORGEJO_API: OnceLock<ForgejoClient> = OnceLock::new();

pub fn init_forgejo_api() -> bool {
    let upstream = match std::env::var("FORGEJO_UPSTREAM_URL") {
        Ok(u) => u,
        Err(_) => return false,
    };
    let token = match std::env::var("FORGEJO_AUTH_TOKEN") {
        Ok(t) => t,
        Err(_) => return false,
    };
    let mut client = ForgejoClient::new(&upstream, &token);
    if let Ok(owners) = std::env::var("FORGEJO_ALLOWED_OWNERS") {
        let policy = ForgejoPolicy::from_owners(owners.split(','));
        client = client.with_policy(policy);
    }
    FORGEJO_API.set(client).is_ok()
}

fn client() -> Result<&'static ForgejoClient, Response> {
    FORGEJO_API.get().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "Forgejo API not configured"})),
        )
            .into_response()
    })
}

#[derive(Debug, Default, Deserialize)]
pub struct ListQuery {
    page: Option<u32>,
    limit: Option<u32>,
    q: Option<String>,
    state: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    purge: Option<bool>,
    #[serde(rename = "ref")]
    git_ref: Option<String>,
    force: Option<bool>,
}

impl ListQuery {
    fn page(&self) -> u32 {
        self.page.unwrap_or(1)
    }
    fn limit(&self) -> u32 {
        self.limit.unwrap_or(50)
    }
    fn force(&self) -> bool {
        self.force.unwrap_or(false)
    }
}

async fn gate(headers: &HeaderMap) -> Result<&'static ForgejoClient, Response> {
    require_dashboard_view(headers, "Forgejo-API").await?;
    client()
}

async fn gate_manage(headers: &HeaderMap) -> Result<&'static ForgejoClient, Response> {
    require_dashboard_manage_with_query(headers, None, "Forgejo-API").await?;
    client()
}

macro_rules! reply {
    ($expr:expr) => {
        match $expr {
            Ok(v) => Json(v).into_response(),
            Err(e) => e.into_response(),
        }
    };
}

/// MANAGE-gated handler: resolve client or early-return the gate response.
macro_rules! mc {
    ($headers:expr) => {
        match gate_manage(&$headers).await {
            Ok(c) => c,
            Err(r) => return r,
        }
    };
}

/// VIEW-gated handler: resolve client or early-return the gate response.
macro_rules! vc {
    ($headers:expr) => {
        match gate(&$headers).await {
            Ok(c) => c,
            Err(r) => return r,
        }
    };
}

// ── Top-level reads ──────────────────────────────────────────────────

async fn users(headers: HeaderMap, q: axum::extract::Query<ListQuery>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_admin_users(q.page(), q.limit()).await)
}

async fn orgs(headers: HeaderMap, q: axum::extract::Query<ListQuery>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_orgs(q.page(), q.limit()).await)
}

async fn repos_search(headers: HeaderMap, q: axum::extract::Query<ListQuery>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    match c.search_repos(q.page(), q.limit(), q.q.as_deref()).await {
        Ok(mut repos) => {
            enrich_repo_storage(&mut repos).await;
            Json(repos).into_response()
        }
        Err(e) => e.into_response(),
    }
}

/// Reports whether the per-repo storage enrichment is healthy, running a live
/// schema probe so a Forgejo upgrade that renames a column is caught here.
async fn storage_health(headers: HeaderMap) -> Response {
    if let Err(r) = gate(&headers).await {
        return r;
    }
    let probe = match get_pg_cluster() {
        Some(cluster) => match verify_schema(&cluster).await {
            Ok(()) => {
                record_storage_health(StorageHealth::Ok, None);
                None
            }
            Err(e) => {
                let status = match e {
                    ForgejoStorageError::SchemaDrift { .. } => StorageHealth::SchemaDrift,
                    ForgejoStorageError::AccessDenied => StorageHealth::AccessDenied,
                    ForgejoStorageError::Db(_) => StorageHealth::Db,
                };
                record_storage_health(status, Some(e.to_string()));
                Some(e.to_string())
            }
        },
        None => {
            record_storage_health(
                StorageHealth::Unconfigured,
                Some("PgCluster unavailable".into()),
            );
            Some("PgCluster unavailable".into())
        }
    };
    let (status, detail) = STORAGE_DB_HEALTH
        .lock()
        .map(|g| (g.0, g.1.clone()))
        .unwrap_or((StorageHealth::Unknown, None));
    let code = if status == StorageHealth::Ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        code,
        Json(json!({
            "status": status.as_str(),
            "detail": detail.or(probe),
        })),
    )
        .into_response()
}

async fn version(headers: HeaderMap) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.version().await)
}

async fn cron(headers: HeaderMap, q: axum::extract::Query<ListQuery>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_cron(q.limit()).await)
}

async fn unadopted(headers: HeaderMap, q: axum::extract::Query<ListQuery>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_unadopted(q.limit()).await)
}

// ── Per-repo reads ───────────────────────────────────────────────────

async fn repo(headers: HeaderMap, Path((owner, repo)): Path<(String, String)>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.get_repo(&owner, &repo).await)
}

async fn branches(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_branches(&owner, &repo, q.limit()).await)
}

async fn commits(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_commits(&owner, &repo, q.limit()).await)
}

async fn languages(headers: HeaderMap, Path((owner, repo)): Path<(String, String)>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_languages(&owner, &repo).await)
}

async fn collaborators(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_collaborators(&owner, &repo, q.limit()).await)
}

async fn releases(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_releases(&owner, &repo, q.limit()).await)
}

async fn hooks(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_hooks(&owner, &repo, q.limit()).await)
}

async fn protections(headers: HeaderMap, Path((owner, repo)): Path<(String, String)>) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_branch_protections(&owner, &repo).await)
}

async fn secrets(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_secrets(&owner, &repo, q.limit()).await)
}

async fn variables(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_variables(&owner, &repo, q.limit()).await)
}

async fn issues(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    let state = q.state.as_deref().unwrap_or("open");
    let kind = q.kind.as_deref().unwrap_or("issues");
    reply!(c.list_issues(&owner, &repo, state, kind, q.limit()).await)
}

async fn pulls(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    let state = q.state.as_deref().unwrap_or("open");
    reply!(c.list_pulls(&owner, &repo, state, q.limit()).await)
}

async fn get_pull(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
) -> Response {
    let c = vc!(headers);
    reply!(c.get_pull(&owner, &repo, index).await)
}

async fn issue_comments(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_issue_comments(&owner, &repo, index, q.limit()).await)
}

async fn labels(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_labels(&owner, &repo, q.limit()).await)
}

async fn milestones(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    let state = q.state.as_deref().unwrap_or("open");
    reply!(c.list_milestones(&owner, &repo, state, q.limit()).await)
}

async fn user_keys(
    headers: HeaderMap,
    Path(login): Path<String>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_user_keys(&login, q.limit()).await)
}

// ── Org / team reads ─────────────────────────────────────────────────

async fn org_members(
    headers: HeaderMap,
    Path(org): Path<String>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_org_members(&org, q.limit()).await)
}

async fn teams(
    headers: HeaderMap,
    Path(org): Path<String>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_teams(&org, q.limit()).await)
}

async fn team_members(
    headers: HeaderMap,
    Path(team_id): Path<u64>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = match gate(&headers).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    reply!(c.list_team_members(team_id, q.limit()).await)
}

// ── Aggregate / runners (reads) ──────────────────────────────────────

async fn stats(headers: HeaderMap, q: axum::extract::Query<ListQuery>) -> Response {
    let c = vc!(headers);
    reply!(cached_stats(c, q.force()).await)
}

async fn storage(headers: HeaderMap, q: axum::extract::Query<ListQuery>) -> Response {
    let c = vc!(headers);
    reply!(cached_storage(c, q.force()).await)
}

async fn repo_runners(headers: HeaderMap, Path((owner, repo)): Path<(String, String)>) -> Response {
    let c = vc!(headers);
    reply!(c.list_repo_runners(&owner, &repo).await)
}

async fn org_runners(headers: HeaderMap, Path(org): Path<String>) -> Response {
    let c = vc!(headers);
    reply!(c.list_org_runners(&org).await)
}

// ── Runner registration tokens (manage — credential) ─────────────────

async fn repo_runner_token(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.repo_runner_token(&owner, &repo).await)
}

async fn org_runner_token(headers: HeaderMap, Path(org): Path<String>) -> Response {
    let c = mc!(headers);
    reply!(c.org_runner_token(&org).await)
}

async fn admin_runner_token(headers: HeaderMap) -> Response {
    let c = mc!(headers);
    reply!(c.admin_runner_token().await)
}

// ── Repo writes ──────────────────────────────────────────────────────

async fn create_repo_for_user(
    headers: HeaderMap,
    Path(user): Path<String>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_repo_for_user(&user, &body).await)
}

async fn create_repo_for_org(
    headers: HeaderMap,
    Path(org): Path<String>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_repo_for_org(&org, &body).await)
}

async fn edit_repo(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_repo(&owner, &repo, &body).await)
}

async fn delete_repo(headers: HeaderMap, Path((owner, repo)): Path<(String, String)>) -> Response {
    let c = mc!(headers);
    reply!(c.delete_repo(&owner, &repo).await)
}

async fn transfer_repo(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.transfer_repo(&owner, &repo, &body).await)
}

async fn migrate_repo(headers: HeaderMap, Json(body): Json<Value>) -> Response {
    let c = mc!(headers);
    reply!(c.migrate_repo(&body).await)
}

async fn add_collaborator(
    headers: HeaderMap,
    Path((owner, repo, user)): Path<(String, String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.add_collaborator(&owner, &repo, &user, &body).await)
}

async fn remove_collaborator(
    headers: HeaderMap,
    Path((owner, repo, user)): Path<(String, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.remove_collaborator(&owner, &repo, &user).await)
}

// ── User writes ──────────────────────────────────────────────────────

async fn create_user(headers: HeaderMap, Json(body): Json<Value>) -> Response {
    let c = mc!(headers);
    reply!(c.create_user(&body).await)
}

async fn edit_user(
    headers: HeaderMap,
    Path(login): Path<String>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_user(&login, &body).await)
}

async fn delete_user(
    headers: HeaderMap,
    Path(login): Path<String>,
    Query(q): Query<ListQuery>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_user(&login, q.purge.unwrap_or(false)).await)
}

// ── Org & team writes ────────────────────────────────────────────────

async fn create_org(headers: HeaderMap, Json(body): Json<Value>) -> Response {
    let c = mc!(headers);
    reply!(c.create_org(&body).await)
}

async fn edit_org(
    headers: HeaderMap,
    Path(org): Path<String>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_org(&org, &body).await)
}

async fn delete_org(headers: HeaderMap, Path(org): Path<String>) -> Response {
    let c = mc!(headers);
    reply!(c.delete_org(&org).await)
}

async fn remove_org_member(
    headers: HeaderMap,
    Path((org, user)): Path<(String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.remove_org_member(&org, &user).await)
}

async fn create_team(
    headers: HeaderMap,
    Path(org): Path<String>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_team(&org, &body).await)
}

async fn delete_team(headers: HeaderMap, Path(team_id): Path<u64>) -> Response {
    let c = mc!(headers);
    reply!(c.delete_team(team_id).await)
}

async fn add_team_member(
    headers: HeaderMap,
    Path((team_id, user)): Path<(u64, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.add_team_member(team_id, &user).await)
}

async fn remove_team_member(
    headers: HeaderMap,
    Path((team_id, user)): Path<(u64, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.remove_team_member(team_id, &user).await)
}

// ── Webhook / release / protection / secret / variable writes ────────

async fn create_hook(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_hook(&owner, &repo, &body).await)
}

async fn delete_hook(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_hook(&owner, &repo, id).await)
}

async fn test_hook(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.test_hook(&owner, &repo, id).await)
}

async fn create_release(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_release(&owner, &repo, &body).await)
}

async fn delete_release(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_release(&owner, &repo, id).await)
}

async fn create_protection(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_branch_protection(&owner, &repo, &body).await)
}

async fn delete_protection(
    headers: HeaderMap,
    Path((owner, repo, name)): Path<(String, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_branch_protection(&owner, &repo, &name).await)
}

async fn set_secret(
    headers: HeaderMap,
    Path((owner, repo, name)): Path<(String, String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.set_secret(&owner, &repo, &name, &body).await)
}

async fn delete_secret(
    headers: HeaderMap,
    Path((owner, repo, name)): Path<(String, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_secret(&owner, &repo, &name).await)
}

async fn create_variable(
    headers: HeaderMap,
    Path((owner, repo, name)): Path<(String, String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_variable(&owner, &repo, &name, &body).await)
}

async fn delete_variable(
    headers: HeaderMap,
    Path((owner, repo, name)): Path<(String, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_variable(&owner, &repo, &name).await)
}

// ── Issue / system writes ────────────────────────────────────────────

async fn set_issue_state(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.set_issue_state(&owner, &repo, index, &body).await)
}

async fn lock_issue(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.lock_issue(&owner, &repo, index, &body).await)
}

async fn unlock_issue(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.unlock_issue(&owner, &repo, index).await)
}

// ── Pull request / ticket writes ─────────────────────────────────────

async fn create_pull(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_pull(&owner, &repo, &body).await)
}

async fn edit_pull(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_pull(&owner, &repo, index, &body).await)
}

async fn merge_pull(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.merge_pull(&owner, &repo, index, &body).await)
}

async fn create_issue_comment(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_issue_comment(&owner, &repo, index, &body).await)
}

async fn edit_issue_comment(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_issue_comment(&owner, &repo, id, &body).await)
}

async fn delete_issue_comment(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_issue_comment(&owner, &repo, id).await)
}

async fn create_label(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_label(&owner, &repo, &body).await)
}

async fn edit_label(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_label(&owner, &repo, id, &body).await)
}

async fn delete_label(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_label(&owner, &repo, id).await)
}

async fn set_issue_labels(
    headers: HeaderMap,
    Path((owner, repo, index)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.set_issue_labels(&owner, &repo, index, &body).await)
}

async fn create_milestone(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_milestone(&owner, &repo, &body).await)
}

async fn edit_milestone(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_milestone(&owner, &repo, id, &body).await)
}

async fn delete_milestone(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_milestone(&owner, &repo, id).await)
}

async fn edit_hook(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_hook(&owner, &repo, id, &body).await)
}

async fn edit_release(
    headers: HeaderMap,
    Path((owner, repo, id)): Path<(String, String, u64)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_release(&owner, &repo, id, &body).await)
}

async fn create_user_key(
    headers: HeaderMap,
    Path(login): Path<String>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_user_key(&login, &body).await)
}

async fn delete_user_key(headers: HeaderMap, Path((login, id)): Path<(String, u64)>) -> Response {
    let c = mc!(headers);
    reply!(c.delete_user_key(&login, id).await)
}

async fn user_gpg_keys(
    headers: HeaderMap,
    Path(login): Path<String>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_user_gpg_keys(&login, q.limit()).await)
}

// ── Branches / tags / assets ─────────────────────────────────────────

async fn get_branch(
    headers: HeaderMap,
    Path((owner, repo, branch)): Path<(String, String, String)>,
) -> Response {
    let c = vc!(headers);
    reply!(c.get_branch(&owner, &repo, &branch).await)
}

async fn create_branch(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_branch(&owner, &repo, &body).await)
}

async fn delete_branch(
    headers: HeaderMap,
    Path((owner, repo, branch)): Path<(String, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_branch(&owner, &repo, &branch).await)
}

async fn edit_protection(
    headers: HeaderMap,
    Path((owner, repo, name)): Path<(String, String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_branch_protection(&owner, &repo, &name, &body).await)
}

async fn tags(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_tags(&owner, &repo, q.limit()).await)
}

async fn create_tag(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_tag(&owner, &repo, &body).await)
}

async fn delete_tag(
    headers: HeaderMap,
    Path((owner, repo, tag)): Path<(String, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_tag(&owner, &repo, &tag).await)
}

async fn release_assets(
    headers: HeaderMap,
    Path((owner, repo, release_id)): Path<(String, String, u64)>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_release_assets(&owner, &repo, release_id).await)
}

async fn delete_release_asset(
    headers: HeaderMap,
    Path((owner, repo, release_id, asset_id)): Path<(String, String, u64, u64)>,
) -> Response {
    let c = mc!(headers);
    reply!(
        c.delete_release_asset(&owner, &repo, release_id, asset_id)
            .await
    )
}

// ── Teams (extended) ─────────────────────────────────────────────────

async fn get_team(headers: HeaderMap, Path(team_id): Path<u64>) -> Response {
    let c = vc!(headers);
    reply!(c.get_team(team_id).await)
}

async fn edit_team(
    headers: HeaderMap,
    Path(team_id): Path<u64>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.edit_team(team_id, &body).await)
}

async fn team_repos(
    headers: HeaderMap,
    Path(team_id): Path<u64>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_team_repos(team_id, q.limit()).await)
}

async fn add_team_repo(
    headers: HeaderMap,
    Path((team_id, org, repo)): Path<(u64, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.add_team_repo(team_id, &org, &repo).await)
}

async fn remove_team_repo(
    headers: HeaderMap,
    Path((team_id, org, repo)): Path<(u64, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.remove_team_repo(team_id, &org, &repo).await)
}

// ── Repository contents / packages ───────────────────────────────────

async fn contents(
    headers: HeaderMap,
    Path((owner, repo, path)): Path<(String, String, String)>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(
        c.list_contents(&owner, &repo, &path, q.git_ref.as_deref())
            .await
    )
}

async fn put_file(
    headers: HeaderMap,
    Path((owner, repo, path)): Path<(String, String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.create_or_update_file(&owner, &repo, &path, &body).await)
}

async fn delete_file(
    headers: HeaderMap,
    Path((owner, repo, path)): Path<(String, String, String)>,
    Json(body): Json<Value>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_file(&owner, &repo, &path, &body).await)
}

async fn packages(
    headers: HeaderMap,
    Path(owner): Path<String>,
    q: axum::extract::Query<ListQuery>,
) -> Response {
    let c = vc!(headers);
    reply!(c.list_packages(&owner, q.page(), q.limit()).await)
}

async fn delete_package(
    headers: HeaderMap,
    Path((owner, kind, name, version)): Path<(String, String, String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_package(&owner, &kind, &name, &version).await)
}

async fn run_cron(headers: HeaderMap, Path(task): Path<String>) -> Response {
    let c = mc!(headers);
    reply!(c.run_cron(&task).await)
}

async fn adopt_unadopted(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.adopt_unadopted(&owner, &repo).await)
}

async fn delete_unadopted(
    headers: HeaderMap,
    Path((owner, repo)): Path<(String, String)>,
) -> Response {
    let c = mc!(headers);
    reply!(c.delete_unadopted(&owner, &repo).await)
}

pub fn routes() -> Router {
    let base = "/dashboard/forgejo/api";
    let p = |s: &str| format!("{base}{s}");
    Router::new()
        // top-level
        .route(&p("/stats"), get(stats))
        .route(&p("/storage"), get(storage))
        .route(&p("/storage/health"), get(storage_health))
        .route(&p("/version"), get(version))
        .route(&p("/cron"), get(cron))
        .route(&p("/cron/{task}"), post(run_cron))
        .route(&p("/unadopted"), get(unadopted))
        .route(
            &p("/unadopted/{owner}/{repo}"),
            post(adopt_unadopted).delete(delete_unadopted),
        )
        .route(
            &p("/admin/runners/registration-token"),
            post(admin_runner_token),
        )
        // users
        .route(&p("/users"), get(users).post(create_user))
        .route(&p("/users/{login}"), patch(edit_user).delete(delete_user))
        .route(&p("/users/{user}/repos"), post(create_repo_for_user))
        .route(
            &p("/users/{login}/keys"),
            get(user_keys).post(create_user_key),
        )
        .route(&p("/users/{login}/keys/{id}"), delete(delete_user_key))
        .route(&p("/users/{login}/gpg_keys"), get(user_gpg_keys))
        // orgs & teams
        .route(&p("/orgs"), get(orgs).post(create_org))
        .route(&p("/orgs/{org}"), patch(edit_org).delete(delete_org))
        .route(&p("/orgs/{org}/repos"), post(create_repo_for_org))
        .route(&p("/orgs/{org}/members"), get(org_members))
        .route(&p("/orgs/{org}/members/{user}"), delete(remove_org_member))
        .route(&p("/orgs/{org}/teams"), get(teams).post(create_team))
        .route(&p("/orgs/{org}/runners"), get(org_runners))
        .route(
            &p("/orgs/{org}/runners/registration-token"),
            post(org_runner_token),
        )
        .route(
            &p("/teams/{team_id}"),
            get(get_team).patch(edit_team).delete(delete_team),
        )
        .route(&p("/teams/{team_id}/members"), get(team_members))
        .route(
            &p("/teams/{team_id}/members/{user}"),
            put(add_team_member).delete(remove_team_member),
        )
        .route(&p("/teams/{team_id}/repos"), get(team_repos))
        .route(
            &p("/teams/{team_id}/repos/{org}/{repo}"),
            put(add_team_repo).delete(remove_team_repo),
        )
        // repos
        .route(&p("/repos/search"), get(repos_search))
        .route(&p("/repos/migrate"), post(migrate_repo))
        .route(
            &p("/repos/{owner}/{repo}"),
            get(repo).patch(edit_repo).delete(delete_repo),
        )
        .route(&p("/repos/{owner}/{repo}/transfer"), post(transfer_repo))
        .route(
            &p("/repos/{owner}/{repo}/branches"),
            get(branches).post(create_branch),
        )
        .route(
            &p("/repos/{owner}/{repo}/branches/{branch}"),
            get(get_branch).delete(delete_branch),
        )
        .route(&p("/repos/{owner}/{repo}/commits"), get(commits))
        .route(&p("/repos/{owner}/{repo}/languages"), get(languages))
        .route(
            &p("/repos/{owner}/{repo}/collaborators"),
            get(collaborators),
        )
        .route(
            &p("/repos/{owner}/{repo}/collaborators/{user}"),
            put(add_collaborator).delete(remove_collaborator),
        )
        .route(
            &p("/repos/{owner}/{repo}/releases"),
            get(releases).post(create_release),
        )
        .route(
            &p("/repos/{owner}/{repo}/releases/{id}"),
            patch(edit_release).delete(delete_release),
        )
        .route(
            &p("/repos/{owner}/{repo}/releases/{id}/assets"),
            get(release_assets),
        )
        .route(
            &p("/repos/{owner}/{repo}/releases/{id}/assets/{asset_id}"),
            delete(delete_release_asset),
        )
        .route(&p("/repos/{owner}/{repo}/tags"), get(tags).post(create_tag))
        .route(&p("/repos/{owner}/{repo}/tags/{tag}"), delete(delete_tag))
        .route(
            &p("/repos/{owner}/{repo}/hooks"),
            get(hooks).post(create_hook),
        )
        .route(
            &p("/repos/{owner}/{repo}/hooks/{id}"),
            patch(edit_hook).delete(delete_hook),
        )
        .route(
            &p("/repos/{owner}/{repo}/hooks/{id}/tests"),
            post(test_hook),
        )
        .route(
            &p("/repos/{owner}/{repo}/protections"),
            get(protections).post(create_protection),
        )
        .route(
            &p("/repos/{owner}/{repo}/protections/{name}"),
            patch(edit_protection).delete(delete_protection),
        )
        .route(&p("/repos/{owner}/{repo}/secrets"), get(secrets))
        .route(
            &p("/repos/{owner}/{repo}/secrets/{name}"),
            put(set_secret).delete(delete_secret),
        )
        .route(&p("/repos/{owner}/{repo}/variables"), get(variables))
        .route(
            &p("/repos/{owner}/{repo}/variables/{name}"),
            post(create_variable).delete(delete_variable),
        )
        .route(&p("/repos/{owner}/{repo}/issues"), get(issues))
        .route(
            &p("/repos/{owner}/{repo}/issues/{index}"),
            patch(set_issue_state),
        )
        .route(
            &p("/repos/{owner}/{repo}/issues/{index}/lock"),
            put(lock_issue).delete(unlock_issue),
        )
        .route(
            &p("/repos/{owner}/{repo}/issues/{index}/comments"),
            get(issue_comments).post(create_issue_comment),
        )
        .route(
            &p("/repos/{owner}/{repo}/issues/comments/{id}"),
            patch(edit_issue_comment).delete(delete_issue_comment),
        )
        .route(
            &p("/repos/{owner}/{repo}/issues/{index}/labels"),
            put(set_issue_labels),
        )
        .route(
            &p("/repos/{owner}/{repo}/labels"),
            get(labels).post(create_label),
        )
        .route(
            &p("/repos/{owner}/{repo}/labels/{id}"),
            patch(edit_label).delete(delete_label),
        )
        .route(
            &p("/repos/{owner}/{repo}/milestones"),
            get(milestones).post(create_milestone),
        )
        .route(
            &p("/repos/{owner}/{repo}/milestones/{id}"),
            patch(edit_milestone).delete(delete_milestone),
        )
        .route(
            &p("/repos/{owner}/{repo}/pulls"),
            get(pulls).post(create_pull),
        )
        .route(
            &p("/repos/{owner}/{repo}/pulls/{index}"),
            get(get_pull).patch(edit_pull),
        )
        .route(
            &p("/repos/{owner}/{repo}/pulls/{index}/merge"),
            post(merge_pull),
        )
        .route(
            &p("/repos/{owner}/{repo}/contents/{*path}"),
            get(contents)
                .post(put_file)
                .put(put_file)
                .delete(delete_file),
        )
        .route(&p("/packages/{owner}"), get(packages))
        .route(
            &p("/packages/{owner}/{kind}/{name}/{version}"),
            delete(delete_package),
        )
        .route(&p("/repos/{owner}/{repo}/runners"), get(repo_runners))
        .route(
            &p("/repos/{owner}/{repo}/runners/registration-token"),
            post(repo_runner_token),
        )
}
