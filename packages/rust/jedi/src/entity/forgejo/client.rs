//! Thin typed wrapper around the Forgejo (Gitea-compatible) REST API v1.
//!
//! Hand-written, mirroring the GitHub client. Callers provide the upstream
//! base URL and an admin/sudo token at construction. Errors are normalised to
//! [`JediError`] so handlers can return them directly. Reads return typed
//! structs; writes accept a `serde_json::Value` body and return the typed
//! created/updated resource (or `()` for empty responses).

use reqwest::{Client, Method, RequestBuilder, Response, StatusCode};
use serde_json::Value;
use std::borrow::Cow;
use std::collections::HashMap;
use std::time::Duration;

use super::types::*;
use crate::entity::error::JediError;

const USER_AGENT: &str = "kbve-jedi/1.0";

#[derive(Clone)]
pub struct ForgejoClient {
    client: Client,
    token: String,
    base_url: String,
}

impl ForgejoClient {
    pub fn new(base_url: &str, token: &str) -> Self {
        let client = Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(20))
            .build()
            .expect("Failed to build reqwest client for ForgejoClient");

        Self {
            client,
            token: token.to_string(),
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    // ── Core helpers ─────────────────────────────────────────────────

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    async fn send(&self, req: RequestBuilder) -> Result<Response, JediError> {
        req.send().await.map_err(|e| {
            if e.is_timeout() {
                JediError::Timeout
            } else {
                JediError::Internal(Cow::Owned(format!("Forgejo request failed: {e}")))
            }
        })
    }

    async fn parse_response<T: serde::de::DeserializeOwned>(
        &self,
        resp: Response,
    ) -> Result<T, JediError> {
        let status = resp.status();
        if status.is_success() {
            let text = resp
                .text()
                .await
                .map_err(|e| JediError::Parse(format!("Failed to read response body: {e}")))?;
            serde_json::from_str(&text)
                .map_err(|e| JediError::Parse(format!("JSON parse error: {e}")))
        } else {
            Err(self.error_for(resp).await)
        }
    }

    async fn error_for(&self, resp: Response) -> JediError {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let message = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
            .unwrap_or(body);
        match status {
            StatusCode::UNAUTHORIZED => JediError::Unauthorized,
            StatusCode::FORBIDDEN => JediError::Forbidden,
            StatusCode::NOT_FOUND => JediError::NotFound,
            StatusCode::BAD_REQUEST | StatusCode::CONFLICT | StatusCode::UNPROCESSABLE_ENTITY => {
                JediError::BadRequest(message)
            }
            _ => JediError::Internal(Cow::Owned(format!("Forgejo API error {status}: {message}"))),
        }
    }

    async fn get<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, JediError> {
        let mut req = self.client.get(self.url(path)).bearer_auth(&self.token);
        if !query.is_empty() {
            req = req.query(query);
        }
        let resp = self.send(req).await?;
        self.parse_response(resp).await
    }

    async fn write<T: serde::de::DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
    ) -> Result<T, JediError> {
        let mut req = self
            .client
            .request(method, self.url(path))
            .bearer_auth(&self.token);
        if let Some(b) = body {
            req = req.json(b);
        }
        let resp = self.send(req).await?;
        self.parse_response(resp).await
    }

    async fn write_empty(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
    ) -> Result<(), JediError> {
        let mut req = self
            .client
            .request(method, self.url(path))
            .bearer_auth(&self.token);
        if let Some(b) = body {
            req = req.json(b);
        }
        let resp = self.send(req).await?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(self.error_for(resp).await)
        }
    }

    fn page_query(page: u32, limit: u32) -> Vec<(&'static str, String)> {
        vec![("page", page.to_string()), ("limit", limit.to_string())]
    }

    // ── Repos ────────────────────────────────────────────────────────

    pub async fn search_repos(
        &self,
        page: u32,
        limit: u32,
        query: Option<&str>,
    ) -> Result<Vec<ForgejoRepo>, JediError> {
        let mut q = Self::page_query(page, limit);
        q.push(("sort", "updated".to_string()));
        if let Some(s) = query.filter(|s| !s.is_empty()) {
            q.push(("q", s.to_string()));
        }
        let results: ForgejoSearchResults<ForgejoRepo> =
            self.get("/api/v1/repos/search", &q).await?;
        Ok(results.data)
    }

    pub async fn get_repo(&self, owner: &str, repo: &str) -> Result<ForgejoRepo, JediError> {
        self.get(&format!("/api/v1/repos/{owner}/{repo}"), &[])
            .await
    }

    pub async fn create_repo_for_user(
        &self,
        user: &str,
        body: &Value,
    ) -> Result<ForgejoRepo, JediError> {
        self.write(
            Method::POST,
            &format!("/api/v1/admin/users/{user}/repos"),
            Some(body),
        )
        .await
    }

    pub async fn create_repo_for_org(
        &self,
        org: &str,
        body: &Value,
    ) -> Result<ForgejoRepo, JediError> {
        self.write(
            Method::POST,
            &format!("/api/v1/orgs/{org}/repos"),
            Some(body),
        )
        .await
    }

    pub async fn edit_repo(
        &self,
        owner: &str,
        repo: &str,
        body: &Value,
    ) -> Result<ForgejoRepo, JediError> {
        self.write(
            Method::PATCH,
            &format!("/api/v1/repos/{owner}/{repo}"),
            Some(body),
        )
        .await
    }

    pub async fn delete_repo(&self, owner: &str, repo: &str) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}"),
            None,
        )
        .await
    }

    pub async fn transfer_repo(
        &self,
        owner: &str,
        repo: &str,
        body: &Value,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::POST,
            &format!("/api/v1/repos/{owner}/{repo}/transfer"),
            Some(body),
        )
        .await
    }

    pub async fn migrate_repo(&self, body: &Value) -> Result<ForgejoRepo, JediError> {
        self.write(Method::POST, "/api/v1/repos/migrate", Some(body))
            .await
    }

    pub async fn list_branches(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoBranch>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/branches"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn list_commits(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoCommit>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/commits"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn list_languages(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<HashMap<String, u64>, JediError> {
        self.get(&format!("/api/v1/repos/{owner}/{repo}/languages"), &[])
            .await
    }

    pub async fn list_collaborators(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoCollaborator>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/collaborators"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn add_collaborator(
        &self,
        owner: &str,
        repo: &str,
        user: &str,
        body: &Value,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::PUT,
            &format!("/api/v1/repos/{owner}/{repo}/collaborators/{user}"),
            Some(body),
        )
        .await
    }

    pub async fn remove_collaborator(
        &self,
        owner: &str,
        repo: &str,
        user: &str,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}/collaborators/{user}"),
            None,
        )
        .await
    }

    // ── Users (admin) ────────────────────────────────────────────────

    pub async fn list_admin_users(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<Vec<ForgejoUser>, JediError> {
        self.get("/api/v1/admin/users", &Self::page_query(page, limit))
            .await
    }

    pub async fn create_user(&self, body: &Value) -> Result<ForgejoUser, JediError> {
        self.write(Method::POST, "/api/v1/admin/users", Some(body))
            .await
    }

    pub async fn edit_user(&self, login: &str, body: &Value) -> Result<ForgejoUser, JediError> {
        self.write(
            Method::PATCH,
            &format!("/api/v1/admin/users/{login}"),
            Some(body),
        )
        .await
    }

    pub async fn delete_user(&self, login: &str, purge: bool) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/admin/users/{login}?purge={purge}"),
            None,
        )
        .await
    }

    // ── Orgs & teams ─────────────────────────────────────────────────

    pub async fn list_orgs(&self, page: u32, limit: u32) -> Result<Vec<ForgejoOrg>, JediError> {
        self.get("/api/v1/orgs", &Self::page_query(page, limit))
            .await
    }

    pub async fn create_org(&self, body: &Value) -> Result<ForgejoOrg, JediError> {
        self.write(Method::POST, "/api/v1/orgs", Some(body)).await
    }

    pub async fn edit_org(&self, org: &str, body: &Value) -> Result<ForgejoOrg, JediError> {
        self.write(Method::PATCH, &format!("/api/v1/orgs/{org}"), Some(body))
            .await
    }

    pub async fn delete_org(&self, org: &str) -> Result<(), JediError> {
        self.write_empty(Method::DELETE, &format!("/api/v1/orgs/{org}"), None)
            .await
    }

    pub async fn list_org_members(
        &self,
        org: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoUser>, JediError> {
        self.get(
            &format!("/api/v1/orgs/{org}/members"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn remove_org_member(&self, org: &str, user: &str) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/orgs/{org}/members/{user}"),
            None,
        )
        .await
    }

    pub async fn list_teams(&self, org: &str, limit: u32) -> Result<Vec<ForgejoTeam>, JediError> {
        self.get(
            &format!("/api/v1/orgs/{org}/teams"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn create_team(&self, org: &str, body: &Value) -> Result<ForgejoTeam, JediError> {
        self.write(
            Method::POST,
            &format!("/api/v1/orgs/{org}/teams"),
            Some(body),
        )
        .await
    }

    pub async fn delete_team(&self, team_id: u64) -> Result<(), JediError> {
        self.write_empty(Method::DELETE, &format!("/api/v1/teams/{team_id}"), None)
            .await
    }

    pub async fn list_team_members(
        &self,
        team_id: u64,
        limit: u32,
    ) -> Result<Vec<ForgejoUser>, JediError> {
        self.get(
            &format!("/api/v1/teams/{team_id}/members"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn add_team_member(&self, team_id: u64, user: &str) -> Result<(), JediError> {
        self.write_empty(
            Method::PUT,
            &format!("/api/v1/teams/{team_id}/members/{user}"),
            None,
        )
        .await
    }

    pub async fn remove_team_member(&self, team_id: u64, user: &str) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/teams/{team_id}/members/{user}"),
            None,
        )
        .await
    }

    // ── Webhooks ─────────────────────────────────────────────────────

    pub async fn list_hooks(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoHook>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/hooks"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn create_hook(
        &self,
        owner: &str,
        repo: &str,
        body: &Value,
    ) -> Result<ForgejoHook, JediError> {
        self.write(
            Method::POST,
            &format!("/api/v1/repos/{owner}/{repo}/hooks"),
            Some(body),
        )
        .await
    }

    pub async fn delete_hook(&self, owner: &str, repo: &str, id: u64) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}/hooks/{id}"),
            None,
        )
        .await
    }

    pub async fn test_hook(&self, owner: &str, repo: &str, id: u64) -> Result<(), JediError> {
        self.write_empty(
            Method::POST,
            &format!("/api/v1/repos/{owner}/{repo}/hooks/{id}/tests"),
            None,
        )
        .await
    }

    // ── Releases ─────────────────────────────────────────────────────

    pub async fn list_releases(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoRelease>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/releases"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn create_release(
        &self,
        owner: &str,
        repo: &str,
        body: &Value,
    ) -> Result<ForgejoRelease, JediError> {
        self.write(
            Method::POST,
            &format!("/api/v1/repos/{owner}/{repo}/releases"),
            Some(body),
        )
        .await
    }

    pub async fn delete_release(&self, owner: &str, repo: &str, id: u64) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}/releases/{id}"),
            None,
        )
        .await
    }

    // ── Branch protection ────────────────────────────────────────────

    pub async fn list_branch_protections(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<ForgejoBranchProtection>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/branch_protections"),
            &[],
        )
        .await
    }

    pub async fn create_branch_protection(
        &self,
        owner: &str,
        repo: &str,
        body: &Value,
    ) -> Result<ForgejoBranchProtection, JediError> {
        self.write(
            Method::POST,
            &format!("/api/v1/repos/{owner}/{repo}/branch_protections"),
            Some(body),
        )
        .await
    }

    pub async fn delete_branch_protection(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}/branch_protections/{name}"),
            None,
        )
        .await
    }

    // ── Actions secrets & variables ──────────────────────────────────

    pub async fn list_secrets(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoSecret>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/actions/secrets"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn set_secret(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
        body: &Value,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::PUT,
            &format!("/api/v1/repos/{owner}/{repo}/actions/secrets/{name}"),
            Some(body),
        )
        .await
    }

    pub async fn delete_secret(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}/actions/secrets/{name}"),
            None,
        )
        .await
    }

    pub async fn list_variables(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoVariable>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/actions/variables"),
            &[("limit", limit.to_string())],
        )
        .await
    }

    pub async fn create_variable(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
        body: &Value,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::POST,
            &format!("/api/v1/repos/{owner}/{repo}/actions/variables/{name}"),
            Some(body),
        )
        .await
    }

    pub async fn delete_variable(
        &self,
        owner: &str,
        repo: &str,
        name: &str,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}/actions/variables/{name}"),
            None,
        )
        .await
    }

    // ── Issues & PR moderation ───────────────────────────────────────

    pub async fn list_issues(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        kind: &str,
        limit: u32,
    ) -> Result<Vec<ForgejoIssue>, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/issues"),
            &[
                ("state", state.to_string()),
                ("type", kind.to_string()),
                ("limit", limit.to_string()),
            ],
        )
        .await
    }

    pub async fn set_issue_state(
        &self,
        owner: &str,
        repo: &str,
        index: u64,
        body: &Value,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::PATCH,
            &format!("/api/v1/repos/{owner}/{repo}/issues/{index}"),
            Some(body),
        )
        .await
    }

    pub async fn lock_issue(
        &self,
        owner: &str,
        repo: &str,
        index: u64,
        body: &Value,
    ) -> Result<(), JediError> {
        self.write_empty(
            Method::PUT,
            &format!("/api/v1/repos/{owner}/{repo}/issues/{index}/lock"),
            Some(body),
        )
        .await
    }

    pub async fn unlock_issue(&self, owner: &str, repo: &str, index: u64) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/repos/{owner}/{repo}/issues/{index}/lock"),
            None,
        )
        .await
    }

    // ── System / admin ───────────────────────────────────────────────

    pub async fn version(&self) -> Result<ForgejoVersion, JediError> {
        self.get("/api/v1/version", &[]).await
    }

    pub async fn list_cron(&self, limit: u32) -> Result<Vec<ForgejoCronTask>, JediError> {
        self.get("/api/v1/admin/cron", &[("limit", limit.to_string())])
            .await
    }

    pub async fn run_cron(&self, task: &str) -> Result<(), JediError> {
        self.write_empty(Method::POST, &format!("/api/v1/admin/cron/{task}"), None)
            .await
    }

    pub async fn list_unadopted(&self, limit: u32) -> Result<Vec<String>, JediError> {
        self.get("/api/v1/admin/unadopted", &[("limit", limit.to_string())])
            .await
    }

    pub async fn adopt_unadopted(&self, owner: &str, repo: &str) -> Result<(), JediError> {
        self.write_empty(
            Method::POST,
            &format!("/api/v1/admin/unadopted/{owner}/{repo}"),
            None,
        )
        .await
    }

    pub async fn delete_unadopted(&self, owner: &str, repo: &str) -> Result<(), JediError> {
        self.write_empty(
            Method::DELETE,
            &format!("/api/v1/admin/unadopted/{owner}/{repo}"),
            None,
        )
        .await
    }

    // ── Aggregates ───────────────────────────────────────────────────

    /// Pages through every accessible repository server-side and aggregates
    /// true totals (count + storage), so the dashboard reports accurate size
    /// across all repos rather than only the first loaded page.
    pub async fn repo_stats(&self) -> Result<ForgejoStats, JediError> {
        const PAGE: u32 = 50;
        const MAX_PAGES: u32 = 400;
        let mut stats = ForgejoStats::default();
        let mut page = 1u32;
        loop {
            let batch = self.search_repos(page, PAGE, None).await?;
            let n = batch.len() as u32;
            for r in &batch {
                stats.repo_count += 1;
                stats.total_size_kb += r.size;
                stats.git_size_kb += r.git_size;
                stats.lfs_size_kb += r.lfs_size;
                if r.private {
                    stats.private += 1;
                } else {
                    stats.public += 1;
                }
                if r.mirror {
                    stats.mirror += 1;
                }
                if r.archived {
                    stats.archived += 1;
                }
                if r.fork {
                    stats.fork += 1;
                }
            }
            if n < PAGE {
                break;
            }
            page += 1;
            if page > MAX_PAGES {
                stats.truncated = true;
                break;
            }
        }
        Ok(stats)
    }

    async fn owner_quota(&self, owner: &str) -> Result<QuotaInfo, JediError> {
        self.get(&format!("/api/v1/admin/users/{owner}/quota"), &[])
            .await
    }

    /// Aggregates true used storage from Forgejo's per-owner quota API across
    /// every user and org: git repos, LFS, packages, Actions artifacts and
    /// attachments (all in bytes). Requires quota tracking enabled on the
    /// instance; when disabled the totals come back zero and callers should
    /// fall back to [`repo_stats`].
    pub async fn instance_storage(&self) -> Result<ForgejoStorage, JediError> {
        const PAGE: u32 = 50;
        const MAX_OWNERS: usize = 1000;
        let mut storage = ForgejoStorage::default();
        let mut owners: Vec<String> = Vec::new();

        let mut page = 1u32;
        loop {
            let batch = self.list_admin_users(page, PAGE).await?;
            let n = batch.len() as u32;
            owners.extend(batch.into_iter().map(|u| u.login));
            if n < PAGE || owners.len() >= MAX_OWNERS {
                break;
            }
            page += 1;
        }
        let mut page = 1u32;
        loop {
            let batch = self.list_orgs(page, PAGE).await?;
            let n = batch.len() as u32;
            owners.extend(batch.into_iter().map(|o| o.username));
            if n < PAGE || owners.len() >= MAX_OWNERS {
                break;
            }
            page += 1;
        }
        if owners.len() > MAX_OWNERS {
            owners.truncate(MAX_OWNERS);
            storage.truncated = true;
        }

        for owner in &owners {
            if let Ok(q) = self.owner_quota(owner).await {
                let s = &q.used.size;
                storage.repos_bytes += s.repos.public + s.repos.private;
                storage.lfs_bytes += s.git.lfs;
                storage.attachments_bytes +=
                    s.assets.attachments.issues + s.assets.attachments.releases;
                storage.artifacts_bytes += s.assets.artifacts;
                storage.packages_bytes += s.assets.packages.all;
                storage.owners_counted += 1;
            }
        }
        storage.total_bytes = storage.repos_bytes
            + storage.lfs_bytes
            + storage.attachments_bytes
            + storage.artifacts_bytes
            + storage.packages_bytes;
        storage.quota_enabled = storage.total_bytes > 0;
        Ok(storage)
    }

    // ── Actions runners ──────────────────────────────────────────────

    pub async fn list_repo_runners(&self, owner: &str, repo: &str) -> Result<Value, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/actions/runners"),
            &[],
        )
        .await
    }

    pub async fn list_org_runners(&self, org: &str) -> Result<Value, JediError> {
        self.get(&format!("/api/v1/orgs/{org}/actions/runners"), &[])
            .await
    }

    pub async fn repo_runner_token(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<ForgejoRegistrationToken, JediError> {
        self.get(
            &format!("/api/v1/repos/{owner}/{repo}/actions/runners/registration-token"),
            &[],
        )
        .await
    }

    pub async fn org_runner_token(&self, org: &str) -> Result<ForgejoRegistrationToken, JediError> {
        self.get(
            &format!("/api/v1/orgs/{org}/actions/runners/registration-token"),
            &[],
        )
        .await
    }

    pub async fn admin_runner_token(&self) -> Result<ForgejoRegistrationToken, JediError> {
        self.get("/api/v1/admin/runners/registration-token", &[])
            .await
    }
}
