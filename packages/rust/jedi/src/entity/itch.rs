use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::entity::error::JediError;

const DEFAULT_BASE: &str = "https://itch.io/api/1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItchPlatform {
    Windows,
    #[serde(rename = "macos")]
    Mac,
    Linux,
}

impl ItchPlatform {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "windows" | "win" | "win64" | "win32" => Some(Self::Windows),
            "mac" | "macos" | "osx" | "darwin" => Some(Self::Mac),
            "linux" | "lin" => Some(Self::Linux),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Windows => "Windows",
            Self::Mac => "macOS",
            Self::Linux => "Linux",
        }
    }

    pub fn slug(&self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Mac => "macos",
            Self::Linux => "linux",
        }
    }

    fn matches(&self, u: &ItchUpload) -> bool {
        match self {
            Self::Windows => u.p_windows,
            Self::Mac => u.p_osx,
            Self::Linux => u.p_linux,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ItchBuild {
    pub id: u64,
    #[serde(default)]
    pub user_version: Option<String>,
    #[serde(default)]
    pub version: Option<u64>,
    #[serde(default)]
    pub state: Option<String>,
}

impl ItchBuild {
    pub fn is_live(&self) -> bool {
        self.state.as_deref() == Some("completed")
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ItchUpload {
    pub id: u64,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub channel_name: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub demo: bool,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub build: Option<ItchBuild>,
    #[serde(default)]
    pub p_windows: bool,
    #[serde(default)]
    pub p_linux: bool,
    #[serde(default)]
    pub p_osx: bool,
    #[serde(default)]
    pub p_android: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ClientVersion {
    pub platform: ItchPlatform,
    pub upload_id: u64,
    pub channel: Option<String>,
    pub user_version: Option<String>,
    pub build_id: Option<u64>,
    pub state: Option<String>,
    pub live: bool,
    pub updated_at: Option<String>,
}

impl ClientVersion {
    fn from_upload(platform: ItchPlatform, u: &ItchUpload) -> Self {
        let build = u.build.as_ref();
        Self {
            platform,
            upload_id: u.id,
            channel: u.channel_name.clone(),
            user_version: build.and_then(|b| b.user_version.clone()),
            build_id: build.map(|b| b.id),
            state: build.and_then(|b| b.state.clone()),
            live: build.map(ItchBuild::is_live).unwrap_or(true),
            updated_at: u.updated_at.clone(),
        }
    }
}

#[derive(Deserialize)]
struct UploadsEnvelope {
    #[serde(default)]
    uploads: Vec<ItchUpload>,
}

#[derive(Deserialize)]
struct DownloadEnvelope {
    url: String,
}

#[derive(Clone)]
pub struct ItchClient {
    http: Arc<reqwest::Client>,
    api_key: String,
    base: String,
}

impl ItchClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            http: Arc::new(reqwest::Client::new()),
            api_key: api_key.into(),
            base: DEFAULT_BASE.to_string(),
        }
    }

    pub fn with_base(mut self, base: impl Into<String>) -> Self {
        self.base = base.into();
        self
    }

    pub async fn list_uploads(&self, game_id: u64) -> Result<Vec<ItchUpload>, JediError> {
        let url = format!("{}/{}/game/{}/uploads", self.base, self.api_key, game_id);
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(map_reqwest)?
            .error_for_status()
            .map_err(map_reqwest)?;
        let body: UploadsEnvelope = resp.json().await.map_err(map_reqwest)?;
        Ok(body.uploads)
    }

    pub async fn download_url(&self, upload_id: u64) -> Result<String, JediError> {
        let url = format!(
            "{}/{}/upload/{}/download",
            self.base, self.api_key, upload_id
        );
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(map_reqwest)?
            .error_for_status()
            .map_err(map_reqwest)?;
        let body: DownloadEnvelope = resp.json().await.map_err(map_reqwest)?;
        Ok(body.url)
    }

    pub fn pick_upload(
        uploads: &[ItchUpload],
        platform: ItchPlatform,
        channel: Option<&str>,
    ) -> Option<ItchUpload> {
        uploads
            .iter()
            .filter(|u| platform.matches(u))
            .filter(|u| match channel {
                Some(c) => u.channel_name.as_deref() == Some(c),
                None => true,
            })
            .min_by_key(|u| (u.demo as u8, u.id))
            .cloned()
    }

    pub async fn client_versions(&self, game_id: u64) -> Result<Vec<ClientVersion>, JediError> {
        let uploads = self.list_uploads(game_id).await?;
        let mut out = Vec::new();
        for platform in [
            ItchPlatform::Windows,
            ItchPlatform::Mac,
            ItchPlatform::Linux,
        ] {
            if let Some(u) = Self::pick_upload(&uploads, platform, None) {
                out.push(ClientVersion::from_upload(platform, &u));
            }
        }
        Ok(out)
    }

    pub async fn resolve_download(
        &self,
        game_id: u64,
        platform: ItchPlatform,
        channel: Option<&str>,
    ) -> Result<String, JediError> {
        let uploads = self.list_uploads(game_id).await?;
        let upload = Self::pick_upload(&uploads, platform, channel).ok_or(JediError::NotFound)?;
        self.download_url(upload.id).await
    }
}

fn map_reqwest(err: reqwest::Error) -> JediError {
    if err.is_timeout() {
        JediError::Timeout
    } else if let Some(status) = err.status() {
        match status.as_u16() {
            401 | 403 => JediError::Unauthorized,
            404 => JediError::NotFound,
            _ => JediError::Internal(std::borrow::Cow::Owned(err.to_string())),
        }
    } else {
        JediError::Internal(std::borrow::Cow::Owned(err.to_string()))
    }
}
