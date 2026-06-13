use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoOwner {
    pub id: u64,
    pub login: String,
    #[serde(default)]
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub mirror: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub git_size: u64,
    #[serde(default)]
    pub lfs_size: u64,
    #[serde(default)]
    pub default_branch: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub language: String,
    pub owner: ForgejoOwner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoUser {
    pub id: u64,
    pub login: String,
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub avatar_url: String,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub last_login: String,
    #[serde(default)]
    pub created: String,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub prohibit_login: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoOrg {
    pub id: u64,
    pub username: String,
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub avatar_url: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub visibility: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoCollaborator {
    #[serde(flatten)]
    pub user: ForgejoUser,
    #[serde(default)]
    pub permissions: Option<ForgejoPermissions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoPermissions {
    #[serde(default)]
    pub admin: bool,
    #[serde(default)]
    pub push: bool,
    #[serde(default)]
    pub pull: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoCommitAuthor {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoBranchCommit {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoBranch {
    pub name: String,
    #[serde(default)]
    pub commit: Option<ForgejoBranchCommit>,
    #[serde(default)]
    pub protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoCommitDetail {
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub author: Option<ForgejoCommitAuthor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoCommit {
    pub sha: String,
    #[serde(default)]
    pub commit: Option<ForgejoCommitDetail>,
    #[serde(default)]
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoReleaseAsset {
    pub id: u64,
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub download_count: u64,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub browser_download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoRelease {
    pub id: u64,
    pub tag_name: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub published_at: String,
    #[serde(default)]
    pub assets: Vec<ForgejoReleaseAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoTeam {
    pub id: u64,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub permission: String,
    #[serde(default)]
    pub units: Vec<String>,
    #[serde(default)]
    pub includes_all_repositories: bool,
    #[serde(default)]
    pub can_create_org_repo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoHook {
    pub id: u64,
    #[serde(rename = "type", default)]
    pub hook_type: String,
    #[serde(default)]
    pub active: bool,
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub config: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoBranchProtection {
    #[serde(default)]
    pub branch_name: String,
    #[serde(default)]
    pub rule_name: String,
    #[serde(default)]
    pub enable_push: bool,
    #[serde(default)]
    pub required_approvals: u32,
    #[serde(default)]
    pub enable_status_check: bool,
    #[serde(default)]
    pub require_signed_commits: bool,
    #[serde(default)]
    pub block_on_outdated_branch: bool,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoSecret {
    pub name: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoVariable {
    pub name: String,
    #[serde(default)]
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoPullMeta {
    #[serde(default)]
    pub merged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoIssue {
    pub id: u64,
    pub number: u64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub is_locked: bool,
    #[serde(default)]
    pub comments: u64,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub user: Option<ForgejoOwner>,
    #[serde(default)]
    pub pull_request: Option<ForgejoPullMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoCronTask {
    pub name: String,
    #[serde(default)]
    pub schedule: String,
    #[serde(default)]
    pub next: String,
    #[serde(default)]
    pub prev: String,
    #[serde(default)]
    pub exec_times: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoVersion {
    #[serde(default)]
    pub version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ForgejoStats {
    pub repo_count: u64,
    pub total_size_kb: u64,
    pub git_size_kb: u64,
    pub lfs_size_kb: u64,
    pub public: u64,
    pub private: u64,
    pub mirror: u64,
    pub archived: u64,
    pub fork: u64,
    pub truncated: bool,
}

// Forgejo quota API ("used" bytes). Fields default to 0 so instances with
// quota tracking disabled (or older versions) deserialize to an empty quota.

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaInfo {
    #[serde(default)]
    pub used: QuotaUsed,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaUsed {
    #[serde(default)]
    pub size: QuotaUsedSize,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaUsedSize {
    #[serde(default)]
    pub repos: QuotaRepos,
    #[serde(default)]
    pub git: QuotaGit,
    #[serde(default)]
    pub assets: QuotaAssets,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaRepos {
    #[serde(default)]
    pub public: u64,
    #[serde(default)]
    pub private: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaGit {
    #[serde(rename = "LFS", default)]
    pub lfs: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaAssets {
    #[serde(default)]
    pub attachments: QuotaAttachments,
    #[serde(default)]
    pub artifacts: u64,
    #[serde(default)]
    pub packages: QuotaPackages,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaAttachments {
    #[serde(default)]
    pub issues: u64,
    #[serde(default)]
    pub releases: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct QuotaPackages {
    #[serde(default)]
    pub all: u64,
}

/// Instance storage aggregated from per-owner Forgejo quota (bytes).
#[derive(Debug, Clone, Default, Serialize)]
pub struct ForgejoStorage {
    pub quota_enabled: bool,
    pub owners_counted: u64,
    pub truncated: bool,
    pub repos_bytes: u64,
    pub lfs_bytes: u64,
    pub attachments_bytes: u64,
    pub artifacts_bytes: u64,
    pub packages_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgejoRegistrationToken {
    #[serde(default)]
    pub token: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ForgejoSearchResults<T> {
    #[serde(default = "Vec::new")]
    pub data: Vec<T>,
}

fn default_true() -> bool {
    true
}
