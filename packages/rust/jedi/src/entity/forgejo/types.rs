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

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ForgejoSearchResults<T> {
    #[serde(default = "Vec::new")]
    pub data: Vec<T>,
}

fn default_true() -> bool {
    true
}
