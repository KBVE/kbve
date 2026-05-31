//! `POST /api/v1/rcon/{game}/{server}/exec`
//!
//! Generic RCON exec route shared by every backend (MC / Factorio / future).
//! Auth is the same Supabase-JWT cookie/bearer pattern used elsewhere in
//! axum-kbve; staff gating reads `is_staff` off the cached `TokenInfo`.

use std::time::{Duration, Instant};

use axum::{
    Json,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use jedi::rcon::RconClient;
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;

use crate::auth::{extract_request_token, get_jwt_cache};
use crate::rcon::registry::{Game, get_rcon_registry};

const RCON_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Wire shape mirrors `kbve.rcon.RconRequest`. The path captures cover
/// `game` and `server`, so the body only carries the command + args.
#[derive(Clone, Debug, Deserialize, ToSchema)]
pub struct RconExecRequest {
    /// Canonical command name (must match an allowlist entry).
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
}

/// Wire shape mirrors `kbve.rcon.RconResponse`.
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct RconExecResponse {
    pub ok: bool,
    pub output: String,
    pub latency_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// `POST /api/v1/rcon/{game}/{server}/exec` — auth + allowlist + jedi::rcon.
#[utoipa::path(
    post,
    path = "/api/v1/rcon/{game}/{server}/exec",
    tag = "rcon",
    params(
        ("game" = String, Path, description = "Game id — `mc` or `factorio`"),
        ("server" = String, Path, description = "Logical server name, e.g. `lobby`, `survival`, `main`"),
    ),
    request_body = RconExecRequest,
    responses(
        (status = 200, description = "RCON exec result", body = RconExecResponse),
        (status = 400, description = "Unknown game / unknown command / arg validation failure"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 403, description = "Command requires staff and caller is not staff"),
        (status = 404, description = "Endpoint not configured for this game/server"),
        (status = 502, description = "RCON connect / auth / exec failure"),
        (status = 503, description = "Auth or RCON registry not initialized"),
    ),
)]
pub async fn exec_handler(
    Path((game_raw, server_raw)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<RconExecRequest>,
) -> impl IntoResponse {
    let game = match parse_game(&game_raw) {
        Some(g) => g,
        None => {
            return error(
                StatusCode::BAD_REQUEST,
                format!("unknown game `{game_raw}` — expected `mc` or `factorio`"),
            );
        }
    };

    let registry = match get_rcon_registry() {
        Some(r) => r,
        None => {
            return error(
                StatusCode::SERVICE_UNAVAILABLE,
                "RCON registry not initialized",
            );
        }
    };

    let endpoint = match registry.endpoint(game, &server_raw) {
        Some(ep) => ep.clone(),
        None => {
            return error(
                StatusCode::NOT_FOUND,
                format!("no RCON endpoint configured for {game_raw}/{server_raw}"),
            );
        }
    };

    let spec = match registry.command(game, &body.command) {
        Some(s) => s.clone(),
        None => {
            return error(
                StatusCode::BAD_REQUEST,
                format!("command `{}` not in allowlist for {game_raw}", body.command),
            );
        }
    };

    let token = match extract_request_token(&headers) {
        Some(t) => t,
        None => return error(StatusCode::UNAUTHORIZED, "Missing authentication"),
    };

    let token_info = match get_jwt_cache() {
        Some(cache) => match cache.verify_and_cache(&token).await {
            Ok(info) => info,
            Err(e) => {
                tracing::warn!(error = %e, "JWT verify failed in rcon exec");
                return error(StatusCode::UNAUTHORIZED, "Invalid or expired token");
            }
        },
        None => return error(StatusCode::SERVICE_UNAVAILABLE, "Auth service unavailable"),
    };

    if spec.staff_only && !token_info.is_staff() {
        return error(
            StatusCode::FORBIDDEN,
            format!("command `{}` requires staff", body.command),
        );
    }

    if let Err(msg) = validate_args(&spec.arg_validators, &body.args) {
        return error(StatusCode::BAD_REQUEST, msg);
    }

    let wire_command = match render_template(&spec.template, &body.args) {
        Ok(s) => s,
        Err(msg) => return error(StatusCode::BAD_REQUEST, msg),
    };

    let started = Instant::now();
    let exec_result = exec_rcon(&endpoint, &wire_command).await;
    let latency_ms = started.elapsed().as_millis().min(u32::MAX as u128) as u32;

    match exec_result {
        Ok(output) => {
            tracing::info!(
                target: "rcon_audit",
                source = "axum",
                game = ?game,
                server = %server_raw,
                command = %spec.name,
                user_id = %token_info.user_id,
                ok = true,
                latency_ms = latency_ms,
                "rcon exec ok"
            );
            (
                StatusCode::OK,
                Json(RconExecResponse {
                    ok: true,
                    output,
                    latency_ms,
                    error: None,
                }),
            )
                .into_response()
        }
        Err(err) => {
            tracing::warn!(
                target: "rcon_audit",
                source = "axum",
                game = ?game,
                server = %server_raw,
                command = %spec.name,
                user_id = %token_info.user_id,
                ok = false,
                latency_ms = latency_ms,
                error = %err,
                "rcon exec failed"
            );
            (
                StatusCode::BAD_GATEWAY,
                Json(RconExecResponse {
                    ok: false,
                    output: String::new(),
                    latency_ms,
                    error: Some(err.to_string()),
                }),
            )
                .into_response()
        }
    }
}

fn parse_game(raw: &str) -> Option<Game> {
    match raw.to_ascii_lowercase().as_str() {
        "mc" => Some(Game::Mc),
        "factorio" => Some(Game::Factorio),
        _ => None,
    }
}

async fn exec_rcon(
    endpoint: &jedi::rcon::RconEndpoint,
    command: &str,
) -> Result<String, jedi::rcon::RconError> {
    let mut client = RconClient::connect(endpoint, RCON_CONNECT_TIMEOUT).await?;
    client.exec(command).await
}

/// Substitute positional `{N}` placeholders in the template. Stays
/// intentionally simple — there's no `{0:?}` formatter syntax, no escape
/// sequence, no nested braces. Anything fancier should be a separate
/// command in the allowlist with a richer template.
fn render_template(template: &str, args: &[String]) -> Result<String, String> {
    let mut out = String::with_capacity(template.len());
    let mut chars = template.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '{' {
            out.push(c);
            continue;
        }
        let mut idx_str = String::new();
        let mut closed = false;
        for inner in chars.by_ref() {
            if inner == '}' {
                closed = true;
                break;
            }
            idx_str.push(inner);
        }
        if !closed {
            return Err(format!("template has unterminated `{{` in `{template}`"));
        }
        let idx: usize = idx_str
            .parse()
            .map_err(|_| format!("template placeholder `{{{idx_str}}}` is not numeric"))?;
        let value = args
            .get(idx)
            .ok_or_else(|| format!("template needs arg {idx} but only {} provided", args.len()))?;
        out.push_str(value);
    }
    Ok(out)
}

/// Per-arg validators referenced in the allowlist. New validator names need
/// a branch here AND a code review — they're part of the security boundary.
fn validate_args(validators: &[String], args: &[String]) -> Result<(), String> {
    if validators.is_empty() {
        return Ok(());
    }
    if args.len() < validators.len() {
        return Err(format!(
            "expected {} args, got {}",
            validators.len(),
            args.len()
        ));
    }
    for (i, name) in validators.iter().enumerate() {
        let arg = &args[i];
        match name.as_str() {
            "string" => {
                if arg.is_empty() {
                    return Err(format!("arg {i} (string) must be non-empty"));
                }
            }
            "int" => {
                arg.parse::<i64>()
                    .map_err(|_| format!("arg {i} (int) is not a valid integer"))?;
            }
            "lua_snippet" => {
                if arg.is_empty() {
                    return Err(format!("arg {i} (lua_snippet) must be non-empty"));
                }
            }
            other => {
                return Err(format!("unknown validator `{other}` for arg {i}"));
            }
        }
    }
    Ok(())
}

fn error(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": msg.into()}))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_game_accepts_canonical_strings() {
        assert_eq!(parse_game("mc"), Some(Game::Mc));
        assert_eq!(parse_game("MC"), Some(Game::Mc));
        assert_eq!(parse_game("factorio"), Some(Game::Factorio));
        assert_eq!(parse_game("Factorio"), Some(Game::Factorio));
        assert_eq!(parse_game("doom"), None);
    }

    #[test]
    fn render_template_substitutes_positional_args() {
        let out = render_template("tp {0} {1}", &["alice".into(), "bob".into()]).unwrap();
        assert_eq!(out, "tp alice bob");
    }

    #[test]
    fn render_template_repeats_same_arg() {
        let out = render_template("say [{0}] {0}", &["hi".into()]).unwrap();
        assert_eq!(out, "say [hi] hi");
    }

    #[test]
    fn render_template_passes_through_no_args() {
        let out = render_template("list", &[]).unwrap();
        assert_eq!(out, "list");
    }

    #[test]
    fn render_template_errors_on_missing_arg() {
        let err = render_template("tp {0} {1}", &["alice".into()]).unwrap_err();
        assert!(err.contains("arg 1"));
    }

    #[test]
    fn render_template_errors_on_bad_index() {
        let err = render_template("tp {foo}", &[]).unwrap_err();
        assert!(err.contains("not numeric"));
    }

    #[test]
    fn validate_args_string_int_and_lua() {
        assert!(validate_args(&[], &[]).is_ok());
        assert!(validate_args(&["string".into()], &["x".into()]).is_ok());
        assert!(validate_args(&["string".into()], &["".into()]).is_err());
        assert!(validate_args(&["int".into()], &["42".into()]).is_ok());
        assert!(validate_args(&["int".into()], &["nope".into()]).is_err());
        assert!(validate_args(&["lua_snippet".into()], &["game.print('hi')".into()]).is_ok());
        assert!(validate_args(&["unknown".into()], &["x".into()]).is_err());
        assert!(validate_args(&["string".into(), "int".into()], &["x".into()]).is_err());
    }
}
