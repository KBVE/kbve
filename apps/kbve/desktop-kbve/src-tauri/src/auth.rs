use erust::supabase::{Session, SupabaseUser};
use erust::tauri as ebridge;
use erust::SupabaseClient;
use serde::{Deserialize, Serialize};
use tauri::State;

pub struct Auth(pub SupabaseClient);

/// specta-friendly mirror of `erust::supabase::SupabaseUser`.
/// erust lives outside this crate and does not derive `specta::Type`, so we
/// mirror its shape at the IPC boundary. Field-for-field so serde output is identical.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SupabaseUserDto {
    pub id: String,
    pub email: Option<String>,
    #[serde(default)]
    pub role: String,
    pub aud: Option<String>,
    #[serde(default)]
    pub user_metadata: serde_json::Value,
    #[serde(default)]
    pub app_metadata: serde_json::Value,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// specta-friendly mirror of `erust::supabase::Session`.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SessionDto {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub expires_at: Option<u64>,
    pub user: SupabaseUserDto,
}

impl From<SupabaseUser> for SupabaseUserDto {
    fn from(u: SupabaseUser) -> Self {
        Self {
            id: u.id,
            email: u.email,
            role: u.role,
            aud: u.aud,
            user_metadata: u.user_metadata,
            app_metadata: u.app_metadata,
            created_at: u.created_at,
            updated_at: u.updated_at,
        }
    }
}

impl From<Session> for SessionDto {
    fn from(s: Session) -> Self {
        Self {
            access_token: s.access_token,
            refresh_token: s.refresh_token,
            token_type: s.token_type,
            expires_in: s.expires_in,
            expires_at: s.expires_at,
            user: s.user.into(),
        }
    }
}

impl From<SupabaseUserDto> for SupabaseUser {
    fn from(u: SupabaseUserDto) -> Self {
        Self {
            id: u.id,
            email: u.email,
            role: u.role,
            aud: u.aud,
            user_metadata: u.user_metadata,
            app_metadata: u.app_metadata,
            created_at: u.created_at,
            updated_at: u.updated_at,
        }
    }
}

impl From<SessionDto> for Session {
    fn from(s: SessionDto) -> Self {
        Self {
            access_token: s.access_token,
            refresh_token: s.refresh_token,
            token_type: s.token_type,
            expires_in: s.expires_in,
            expires_at: s.expires_at,
            user: s.user.into(),
        }
    }
}

const SUPABASE_URL: &str = "https://supabase.kbve.com";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg";

pub fn init() -> Auth {
    Auth(SupabaseClient::new(SUPABASE_URL, SUPABASE_ANON_KEY))
}

#[tauri::command]
#[specta::specta]
pub fn auth_authorize_url(
    provider: String,
    redirect_to: String,
    auth: State<'_, Auth>,
) -> String {
    auth.0.authorize_url(&provider, &redirect_to)
}

#[tauri::command]
#[specta::specta]
pub async fn auth_complete(
    callback_url: String,
    auth: State<'_, Auth>,
) -> Result<SessionDto, String> {
    let client = auth.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match ebridge::complete_oauth_blocking(&client.config, &callback_url) {
            Ok(session) => {
                client.set_session(session.clone());
                Ok(SessionDto::from(session))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub fn auth_session(auth: State<'_, Auth>) -> Option<SessionDto> {
    auth.0.get_session().map(SessionDto::from)
}

#[tauri::command]
#[specta::specta]
pub fn auth_restore(session: SessionDto, auth: State<'_, Auth>) {
    auth.0.set_session(session.into());
}

#[tauri::command]
#[specta::specta]
pub async fn auth_refresh(auth: State<'_, Auth>) -> Result<Option<SessionDto>, String> {
    let client = auth.0.clone();
    let refresh = match client.get_session() {
        Some(s) => s.refresh_token,
        None => return Ok(None),
    };
    tauri::async_runtime::spawn_blocking(move || {
        match ebridge::refresh_blocking(&client.config, &refresh) {
            Ok(session) => {
                client.set_session(session.clone());
                Ok(Some(SessionDto::from(session)))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub fn auth_sign_out(auth: State<'_, Auth>) {
    auth.0.clear_session();
}
