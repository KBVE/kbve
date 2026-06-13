//! Typed Forgejo read routes backed by the jedi `forgejo` client.
//!
//! Reads only — typed responses + normalised `JediError` JSON, gated by
//! DASHBOARD_VIEW. Mutations continue through the method-gated generic proxy
//! (`/dashboard/forgejo/proxy/*`); the jedi write methods exist for future
//! server-side validation/policy and are wired here when that lands.

use std::sync::OnceLock;

use axum::{
    Json, Router,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::json;

use jedi::entity::forgejo::ForgejoClient;

use super::proxy::require_dashboard_view;

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
    FORGEJO_API
        .set(ForgejoClient::new(&upstream, &token))
        .is_ok()
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
}

impl ListQuery {
    fn page(&self) -> u32 {
        self.page.unwrap_or(1)
    }
    fn limit(&self) -> u32 {
        self.limit.unwrap_or(50)
    }
}

async fn gate(headers: &HeaderMap) -> Result<&'static ForgejoClient, Response> {
    require_dashboard_view(headers, "Forgejo-API").await?;
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
    reply!(c.search_repos(q.page(), q.limit(), q.q.as_deref()).await)
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

pub fn routes() -> Router {
    let base = "/dashboard/forgejo/api";
    Router::new()
        .route(&format!("{base}/users"), get(users))
        .route(&format!("{base}/orgs"), get(orgs))
        .route(&format!("{base}/repos/search"), get(repos_search))
        .route(&format!("{base}/version"), get(version))
        .route(&format!("{base}/cron"), get(cron))
        .route(&format!("{base}/unadopted"), get(unadopted))
        .route(&format!("{base}/repos/{{owner}}/{{repo}}"), get(repo))
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/branches"),
            get(branches),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/commits"),
            get(commits),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/languages"),
            get(languages),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/collaborators"),
            get(collaborators),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/releases"),
            get(releases),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/hooks"),
            get(hooks),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/protections"),
            get(protections),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/secrets"),
            get(secrets),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/variables"),
            get(variables),
        )
        .route(
            &format!("{base}/repos/{{owner}}/{{repo}}/issues"),
            get(issues),
        )
        .route(&format!("{base}/orgs/{{org}}/members"), get(org_members))
        .route(&format!("{base}/orgs/{{org}}/teams"), get(teams))
        .route(
            &format!("{base}/teams/{{team_id}}/members"),
            get(team_members),
        )
}
