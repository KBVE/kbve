//! `POST /api/v1/wow/soap/{server}/exec`
//!
//! WoW GM-command exec route. Shape-for-shape the RCON exec route, minus the
//! `game` path segment: SOAP only ever talks to a worldserver, so the logical
//! server name is the whole address space. Auth is the same Supabase-JWT
//! cookie/bearer pattern used elsewhere in axum-kbve; staff gating reads
//! `is_staff` off the cached `TokenInfo`.

use std::time::Instant;

use axum::{
    Json,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;

use crate::auth::{extract_request_token, get_jwt_cache};
use crate::soap::registry::{SoapScope, get_soap_registry};
use crate::soap::transport;

/// The path capture covers `server`, so the body only carries the command
/// name + args. Args are never a raw command line — they fill positional
/// `{N}` slots in an allowlisted template.
#[derive(Clone, Debug, Deserialize, ToSchema)]
pub struct SoapExecRequest {
    /// Canonical command name (must match an allowlist entry).
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
}

/// `scope` is echoed from the allowlist entry rather than inferred, and is
/// present on both the success and the failure body: a `node`-scoped command
/// can report success while having reached only one of the Fleet's
/// worldservers, so the caller needs it to qualify the output it just got.
#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct SoapExecResponse {
    pub ok: bool,
    pub output: String,
    pub latency_ms: u64,
    pub scope: SoapScope,
    pub error: Option<String>,
}

/// `POST /api/v1/wow/soap/{server}/exec` — auth + allowlist + SOAP exec.
#[utoipa::path(
    post,
    path = "/api/v1/wow/soap/{server}/exec",
    tag = "soap",
    params(
        ("server" = String, Path, description = "Logical realm/server name, e.g. `main`"),
    ),
    request_body = SoapExecRequest,
    responses(
        (status = 200, description = "SOAP exec result", body = SoapExecResponse),
        (status = 400, description = "Unknown command / arg validation failure"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 403, description = "Command requires staff and caller is not staff"),
        (status = 404, description = "Endpoint not configured for this server"),
        (status = 502, description = "SOAP transport / auth / fault"),
        (status = 503, description = "Auth or SOAP registry not initialized"),
    ),
)]
pub async fn exec_handler(
    Path(server_raw): Path<String>,
    headers: HeaderMap,
    Json(body): Json<SoapExecRequest>,
) -> impl IntoResponse {
    let registry = match get_soap_registry() {
        Some(r) => r,
        None => {
            return error(
                StatusCode::SERVICE_UNAVAILABLE,
                "SOAP registry not initialized",
            );
        }
    };

    let endpoint = match registry.endpoint(&server_raw) {
        Some(ep) => ep,
        None => {
            return error(
                StatusCode::NOT_FOUND,
                format!("no SOAP endpoint configured for wow/{server_raw}"),
            );
        }
    };

    let spec = match registry.command(&body.command) {
        Some(s) => s,
        None => {
            return error(
                StatusCode::BAD_REQUEST,
                format!("command `{}` not in SOAP allowlist", body.command),
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
                tracing::warn!(error = %e, "JWT verify failed in soap exec");
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

    let scope = spec.scope;
    let started = Instant::now();
    let exec_result = transport::exec(endpoint, &wire_command).await;
    let latency_ms = started.elapsed().as_millis().min(u64::MAX as u128) as u64;

    match exec_result {
        Ok(output) => {
            tracing::info!(
                target: "soap_audit",
                source = "axum",
                game = "wow",
                server = %server_raw,
                command = %spec.name,
                user_id = %token_info.user_id,
                scope = ?scope,
                ok = true,
                latency_ms = latency_ms,
                "soap exec ok"
            );
            (
                StatusCode::OK,
                Json(SoapExecResponse {
                    ok: true,
                    output,
                    latency_ms,
                    scope,
                    error: None,
                }),
            )
                .into_response()
        }
        Err(err) => {
            tracing::warn!(
                target: "soap_audit",
                source = "axum",
                game = "wow",
                server = %server_raw,
                command = %spec.name,
                user_id = %token_info.user_id,
                scope = ?scope,
                ok = false,
                latency_ms = latency_ms,
                error = %err,
                "soap exec failed"
            );
            (
                StatusCode::BAD_GATEWAY,
                Json(SoapExecResponse {
                    ok: false,
                    output: String::new(),
                    latency_ms,
                    scope,
                    error: Some(err.to_string()),
                }),
            )
                .into_response()
        }
    }
}

/// Substitute positional `{N}` placeholders in the template. Stays
/// intentionally simple — there's no formatter syntax, no escape sequence,
/// no nested braces. Anything fancier should be a separate command in the
/// allowlist with a richer template.
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

const MAX_NAME_LEN: usize = 32;
const MAX_TEXT_LEN: usize = 255;
const MAX_DURATION_LEN: usize = 16;
const MAX_UINT_LEN: usize = 10;

/// Shared floor under every validator. An argument is spliced straight into a
/// GM command line, so the two shapes that turn one command into two —
/// an embedded newline and a leading `.` — are rejected everywhere, as are
/// the other C0 control characters gSOAP would happily carry.
fn reject_injection(i: usize, arg: &str) -> Result<(), String> {
    if arg.starts_with('.') {
        return Err(format!("arg {i} must not start with `.`"));
    }
    if let Some(c) = arg.chars().find(|c| c.is_control()) {
        return Err(format!(
            "arg {i} contains a control character (U+{:04X})",
            c as u32
        ));
    }
    Ok(())
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
        reject_injection(i, arg)?;
        match name.as_str() {
            // Account / character name: the shape the auth DB itself allows.
            "name" => {
                if arg.is_empty() || arg.len() > MAX_NAME_LEN {
                    return Err(format!("arg {i} (name) must be 1..={MAX_NAME_LEN} chars"));
                }
                if !arg.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                    return Err(format!(
                        "arg {i} (name) allows only ASCII letters, digits and `_`"
                    ));
                }
            }
            // Free-form message body — announce/notify/kick reason. Printable
            // ASCII only: the client renders these into chat, and anything
            // outside that range is more likely an injection probe than a
            // legitimate broadcast.
            "text" => {
                if arg.is_empty() || arg.len() > MAX_TEXT_LEN {
                    return Err(format!("arg {i} (text) must be 1..={MAX_TEXT_LEN} chars"));
                }
                if !arg.chars().all(|c| c.is_ascii_graphic() || c == ' ') {
                    return Err(format!("arg {i} (text) must be printable ASCII"));
                }
            }
            "uint" => {
                if arg.is_empty() || arg.len() > MAX_UINT_LEN {
                    return Err(format!("arg {i} (uint) must be 1..={MAX_UINT_LEN} digits"));
                }
                if !arg.chars().all(|c| c.is_ascii_digit()) {
                    return Err(format!("arg {i} (uint) must be digits only"));
                }
            }
            // AzerothCore duration: `-1` (permanent) or `<n><unit>` runs such
            // as `30m`, `1d`, `2h30m`.
            "duration" => {
                if arg.is_empty() || arg.len() > MAX_DURATION_LEN {
                    return Err(format!(
                        "arg {i} (duration) must be 1..={MAX_DURATION_LEN} chars"
                    ));
                }
                if arg != "-1"
                    && !arg
                        .chars()
                        .all(|c| c.is_ascii_digit() || matches!(c, 's' | 'm' | 'h' | 'd' | 'w'))
                {
                    return Err(format!(
                        "arg {i} (duration) must be `-1` or digits with s/m/h/d/w units"
                    ));
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
    fn render_template_substitutes_positional_args() {
        let out = render_template("kick {0} {1}", &["bob".into(), "afk".into()]).unwrap();
        assert_eq!(out, "kick bob afk");
    }

    #[test]
    fn render_template_passes_through_no_args() {
        assert_eq!(render_template("server info", &[]).unwrap(), "server info");
    }

    #[test]
    fn render_template_errors_on_missing_arg() {
        let err = render_template("kick {0} {1}", &["bob".into()]).unwrap_err();
        assert!(err.contains("arg 1"));
    }

    #[test]
    fn render_template_errors_on_bad_index() {
        let err = render_template("kick {who}", &[]).unwrap_err();
        assert!(err.contains("not numeric"));
    }

    #[test]
    fn validators_accept_well_formed_args() {
        assert!(validate_args(&[], &[]).is_ok());
        assert!(validate_args(&["name".into()], &["Bob_1".into()]).is_ok());
        assert!(validate_args(&["text".into()], &["server going down".into()]).is_ok());
        assert!(validate_args(&["uint".into()], &["30".into()]).is_ok());
        assert!(validate_args(&["duration".into()], &["1d".into()]).is_ok());
        assert!(validate_args(&["duration".into()], &["-1".into()]).is_ok());
    }

    #[test]
    fn validators_reject_wrong_shapes() {
        assert!(validate_args(&["name".into()], &["".into()]).is_err());
        assert!(validate_args(&["name".into()], &["bob smith".into()]).is_err());
        assert!(validate_args(&["name".into()], &["a".repeat(33)]).is_err());
        assert!(validate_args(&["uint".into()], &["-5".into()]).is_err());
        assert!(validate_args(&["uint".into()], &["3x".into()]).is_err());
        assert!(validate_args(&["duration".into()], &["forever".into()]).is_err());
        assert!(validate_args(&["text".into()], &["a".repeat(256)]).is_err());
        assert!(validate_args(&["text".into()], &["héllo".into()]).is_err());
        assert!(validate_args(&["unknown".into()], &["x".into()]).is_err());
        assert!(validate_args(&["name".into(), "uint".into()], &["bob".into()]).is_err());
    }

    #[test]
    fn every_validator_rejects_newline_injection() {
        for v in ["name", "text", "uint", "duration"] {
            for payload in [
                "bob\nserver shutdown 1",
                "bob\r\nannounce pwned",
                "bob\u{0}x",
            ] {
                assert!(
                    validate_args(&[v.into()], &[payload.into()]).is_err(),
                    "validator `{v}` accepted `{payload:?}`"
                );
            }
        }
    }

    #[test]
    fn every_validator_rejects_leading_dot() {
        for v in ["name", "text", "uint", "duration"] {
            assert!(
                validate_args(&[v.into()], &[".server shutdown 1".into()]).is_err(),
                "validator `{v}` accepted a leading dot"
            );
        }
    }

    #[test]
    fn allowlist_validator_names_are_all_implemented() {
        let reg = crate::soap::registry::SoapRegistry::from_env().unwrap();
        for spec in [
            "server_info",
            "server_motd",
            "announce",
            "notify",
            "kick",
            "ban_account",
            "unban_account",
            "account_set_gmlevel",
            "gm_list",
            "reload_config",
        ] {
            let spec = reg.command(spec).expect("command must be allowlisted");
            for v in &spec.arg_validators {
                let sample = match v.as_str() {
                    "name" => "Bob",
                    "text" => "hello",
                    "uint" => "1",
                    "duration" => "1d",
                    other => panic!("validator `{other}` has no handler"),
                };
                validate_args(std::slice::from_ref(v), &[sample.into()])
                    .unwrap_or_else(|e| panic!("validator `{v}` rejected its own sample: {e}"));
            }
        }
    }

    #[test]
    fn response_body_always_carries_scope_and_error() {
        let ok = serde_json::to_value(SoapExecResponse {
            ok: true,
            output: "up".into(),
            latency_ms: 7,
            scope: SoapScope::Node,
            error: None,
        })
        .unwrap();
        assert_eq!(ok["scope"], "node");
        assert!(ok["error"].is_null(), "error must serialize, not be skipped");
        assert_eq!(ok["latency_ms"], 7);

        let failed = serde_json::to_value(SoapExecResponse {
            ok: false,
            output: String::new(),
            latency_ms: 0,
            scope: SoapScope::Realm,
            error: Some("boom".into()),
        })
        .unwrap();
        assert_eq!(failed["scope"], "realm");
        assert_eq!(failed["error"], "boom");
    }

    #[test]
    fn shared_database_writes_are_realm_scoped() {
        let reg = crate::soap::registry::SoapRegistry::from_env().unwrap();
        for name in ["account_set_gmlevel", "ban_account", "unban_account"] {
            assert_eq!(reg.command(name).unwrap().scope, SoapScope::Realm, "{name}");
        }
        for name in ["server_info", "announce", "kick", "reload_config"] {
            assert_eq!(reg.command(name).unwrap().scope, SoapScope::Node, "{name}");
        }
    }
}
