use erust::supabase::Session;
use erust::tauri as ebridge;
use erust::SupabaseClient;
use tauri::State;

pub struct Auth(pub SupabaseClient);

const SUPABASE_URL: &str = "https://supabase.kbve.com";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg";

pub fn init() -> Auth {
    Auth(SupabaseClient::new(SUPABASE_URL, SUPABASE_ANON_KEY))
}

#[tauri::command]
pub fn auth_authorize_url(
    provider: String,
    redirect_to: String,
    auth: State<'_, Auth>,
) -> String {
    auth.0.authorize_url(&provider, &redirect_to)
}

#[tauri::command]
pub async fn auth_complete(
    callback_url: String,
    auth: State<'_, Auth>,
) -> Result<Session, String> {
    let client = auth.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match ebridge::complete_oauth_blocking(&client.config, &callback_url) {
            Ok(session) => {
                client.set_session(session.clone());
                Ok(session)
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn auth_session(auth: State<'_, Auth>) -> Option<Session> {
    auth.0.get_session()
}

#[tauri::command]
pub fn auth_restore(session: Session, auth: State<'_, Auth>) {
    auth.0.set_session(session);
}

#[tauri::command]
pub async fn auth_refresh(auth: State<'_, Auth>) -> Result<Option<Session>, String> {
    let client = auth.0.clone();
    let refresh = match client.get_session() {
        Some(s) => s.refresh_token,
        None => return Ok(None),
    };
    tauri::async_runtime::spawn_blocking(move || {
        match ebridge::refresh_blocking(&client.config, &refresh) {
            Ok(session) => {
                client.set_session(session.clone());
                Ok(Some(session))
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn auth_sign_out(auth: State<'_, Auth>) {
    auth.0.clear_session();
}
