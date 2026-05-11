use axum::{
    extract::Request,
    http::{StatusCode, header},
    middleware::Next,
    response::IntoResponse,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};

pub const SUPABASE_AUDIENCE: &str = "authenticated";
pub const MAX_NICK_LEN: usize = 16;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserMetadata {
    #[serde(default)]
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub user_name: Option<String>,
    #[serde(default)]
    pub nickname: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub aud: Option<String>,
    #[serde(default)]
    pub kbve_username: Option<String>,
    #[serde(default)]
    pub user_metadata: UserMetadata,
    pub exp: u64,
    pub iat: u64,
}

impl Claims {
    pub fn irc_nick(&self) -> Option<String> {
        let candidates = [
            self.kbve_username.as_deref(),
            self.user_metadata.preferred_username.as_deref(),
            self.user_metadata.user_name.as_deref(),
            self.user_metadata.nickname.as_deref(),
        ];

        candidates
            .into_iter()
            .flatten()
            .map(sanitize_nick)
            .find(|n| !n.is_empty())
    }
}

fn sanitize_nick(raw: &str) -> String {
    let mut nick: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(MAX_NICK_LEN)
        .collect();
    if nick.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        nick.insert(0, '_');
        nick.truncate(MAX_NICK_LEN);
    }
    nick
}

/// Extract JWT from Authorization header or query param
pub fn extract_token(req: &Request) -> Option<String> {
    // Try Authorization: Bearer <token>
    req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(String::from)
        .or_else(|| {
            // Try ?token= query param (for WebSocket upgrades)
            req.uri().query().and_then(|q| {
                q.split('&').find_map(|pair| {
                    let (key, value) = pair.split_once('=')?;
                    if key == "token" {
                        Some(value.to_string())
                    } else {
                        None
                    }
                })
            })
        })
}

/// Validate JWT and return claims
pub fn validate_token(token: &str) -> Result<Claims, StatusCode> {
    let secret = std::env::var("JWT_SECRET").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_required_spec_claims(&["sub", "exp", "iat", "aud"]);
    validation.set_audience(&[SUPABASE_AUDIENCE]);

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|_| StatusCode::UNAUTHORIZED)
}

pub async fn require_auth(mut req: Request, next: Next) -> impl IntoResponse {
    let token = match extract_token(&req) {
        Some(t) => t,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    match validate_token(&token) {
        Ok(claims) => {
            req.extensions_mut().insert(claims);
            next.run(req).await.into_response()
        }
        Err(status) => status.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serial_test::serial;
    use std::time::{SystemTime, UNIX_EPOCH};

    const TEST_SECRET: &str = "kbve-jwt-secret-for-tests";

    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_secs()
    }

    fn issue(secret: &str, sub: &str, exp_offset: i64) -> String {
        issue_with_aud(secret, sub, exp_offset, Some(SUPABASE_AUDIENCE))
    }

    fn issue_with_aud(secret: &str, sub: &str, exp_offset: i64, aud: Option<&str>) -> String {
        let iat = now_secs();
        let exp = (iat as i64 + exp_offset) as u64;
        let claims = Claims {
            sub: sub.to_string(),
            email: Some(format!("{sub}@example.com")),
            role: Some("authenticated".to_string()),
            aud: aud.map(String::from),
            kbve_username: None,
            user_metadata: UserMetadata::default(),
            exp,
            iat,
        };
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("encode test jwt")
    }

    fn req_with_query(query: &str) -> Request {
        Request::builder()
            .uri(format!("https://chat.kbve.com/ws?{query}"))
            .body(Body::empty())
            .expect("build request")
    }

    fn req_with_bearer(token: &str) -> Request {
        Request::builder()
            .uri("https://chat.kbve.com/ws")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("build request")
    }

    #[test]
    fn extract_token_from_authorization_header() {
        let req = req_with_bearer("abc.def.ghi");
        assert_eq!(extract_token(&req).as_deref(), Some("abc.def.ghi"));
    }

    #[test]
    fn extract_token_falls_back_to_query_param() {
        let req = req_with_query("token=qry.tok.val&other=1");
        assert_eq!(extract_token(&req).as_deref(), Some("qry.tok.val"));
    }

    #[test]
    fn extract_token_prefers_authorization_over_query() {
        let req = Request::builder()
            .uri("https://chat.kbve.com/ws?token=fromquery")
            .header(header::AUTHORIZATION, "Bearer fromheader")
            .body(Body::empty())
            .expect("build request");
        assert_eq!(extract_token(&req).as_deref(), Some("fromheader"));
    }

    #[test]
    fn extract_token_ignores_other_query_keys() {
        let req = req_with_query("foo=bar&token=tok.123");
        assert_eq!(extract_token(&req).as_deref(), Some("tok.123"));
    }

    #[test]
    fn extract_token_returns_none_when_absent() {
        let req = Request::builder()
            .uri("https://chat.kbve.com/ws")
            .body(Body::empty())
            .expect("build request");
        assert!(extract_token(&req).is_none());
    }

    #[test]
    fn extract_token_ignores_bearer_without_space() {
        let req = Request::builder()
            .uri("https://chat.kbve.com/ws")
            .header(header::AUTHORIZATION, "Bearer")
            .body(Body::empty())
            .expect("build request");
        assert!(extract_token(&req).is_none());
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_accepts_valid_token() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue(TEST_SECRET, "user-123", 3600);
        let claims = validate_token(&token).expect("token should validate");
        assert_eq!(claims.sub, "user-123");
        assert_eq!(claims.email.as_deref(), Some("user-123@example.com"));
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_wrong_secret() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue("different-secret", "user-456", 3600);
        let result = validate_token(&token);
        assert_eq!(result.unwrap_err(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_expired_token() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue(TEST_SECRET, "user-789", -120);
        let result = validate_token(&token);
        assert_eq!(result.unwrap_err(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_returns_500_when_secret_unset() {
        std::env::remove_var("JWT_SECRET");
        let result = validate_token("anything.at.all");
        assert_eq!(result.unwrap_err(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_garbage_input() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        assert_eq!(
            validate_token("not-a-jwt").unwrap_err(),
            StatusCode::UNAUTHORIZED,
        );
        assert_eq!(validate_token("").unwrap_err(), StatusCode::UNAUTHORIZED,);
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_accepts_supabase_audience() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue_with_aud(TEST_SECRET, "user-aud", 3600, Some(SUPABASE_AUDIENCE));
        let claims = validate_token(&token).expect("token should validate");
        assert_eq!(claims.aud.as_deref(), Some(SUPABASE_AUDIENCE));
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_wrong_audience() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue_with_aud(TEST_SECRET, "user-bad-aud", 3600, Some("service_role"));
        assert_eq!(
            validate_token(&token).unwrap_err(),
            StatusCode::UNAUTHORIZED,
        );
        std::env::remove_var("JWT_SECRET");
    }

    #[test]
    #[serial(jwt_env)]
    fn validate_token_rejects_missing_audience() {
        std::env::set_var("JWT_SECRET", TEST_SECRET);
        let token = issue_with_aud(TEST_SECRET, "user-no-aud", 3600, None);
        assert_eq!(
            validate_token(&token).unwrap_err(),
            StatusCode::UNAUTHORIZED,
        );
        std::env::remove_var("JWT_SECRET");
    }

    fn claims_with_metadata(sub: &str, email: Option<&str>, meta: UserMetadata) -> Claims {
        Claims {
            sub: sub.to_string(),
            email: email.map(String::from),
            role: Some("authenticated".to_string()),
            aud: Some(SUPABASE_AUDIENCE.to_string()),
            kbve_username: None,
            user_metadata: meta,
            exp: 0,
            iat: 0,
        }
    }

    #[test]
    fn irc_nick_prefers_kbve_username() {
        let mut c = claims_with_metadata(
            "uuid-kbve",
            Some("admin@kbve.com"),
            UserMetadata {
                preferred_username: Some("provider_name".to_string()),
                user_name: Some("provider_alt".to_string()),
                ..Default::default()
            },
        );
        c.kbve_username = Some("h0lybyte".to_string());
        assert_eq!(c.irc_nick().as_deref(), Some("h0lybyte"));
    }

    #[test]
    fn irc_nick_skips_empty_kbve_username() {
        let mut c = claims_with_metadata(
            "uuid-kbve-empty",
            None,
            UserMetadata {
                preferred_username: Some("h0lybyte".to_string()),
                ..Default::default()
            },
        );
        c.kbve_username = Some("!!!".to_string());
        assert_eq!(c.irc_nick().as_deref(), Some("h0lybyte"));
    }

    #[test]
    fn irc_nick_prefers_preferred_username() {
        let meta = UserMetadata {
            preferred_username: Some("h0lybyte".to_string()),
            user_name: Some("ignored".to_string()),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-1", Some("admin@kbve.com"), meta);
        assert_eq!(c.irc_nick().as_deref(), Some("h0lybyte"));
    }

    #[test]
    fn irc_nick_falls_back_to_user_name() {
        let meta = UserMetadata {
            user_name: Some("h0lybyte".to_string()),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-2", Some("admin@kbve.com"), meta);
        assert_eq!(c.irc_nick().as_deref(), Some("h0lybyte"));
    }

    #[test]
    fn irc_nick_falls_back_to_nickname() {
        let meta = UserMetadata {
            nickname: Some("KBVE".to_string()),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-3", Some("admin@kbve.com"), meta);
        assert_eq!(c.irc_nick().as_deref(), Some("KBVE"));
    }

    #[test]
    fn irc_nick_returns_none_when_no_provider_username() {
        let c = claims_with_metadata("uuid-4", Some("admin@kbve.com"), UserMetadata::default());
        assert_eq!(c.irc_nick(), None);
    }

    #[test]
    fn irc_nick_returns_none_when_email_only() {
        let c = claims_with_metadata("uuid-5", Some("admin@kbve.com"), UserMetadata::default());
        assert_eq!(c.irc_nick(), None);
    }

    #[test]
    fn irc_nick_strips_disallowed_chars() {
        let meta = UserMetadata {
            preferred_username: Some("h0ly!byte@123".to_string()),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-6", None, meta);
        assert_eq!(c.irc_nick().as_deref(), Some("h0lybyte123"));
    }

    #[test]
    fn irc_nick_truncates_to_max_len() {
        let meta = UserMetadata {
            preferred_username: Some("a".repeat(64)),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-7", None, meta);
        assert_eq!(c.irc_nick().unwrap().len(), MAX_NICK_LEN);
    }

    #[test]
    fn irc_nick_prefixes_leading_digit() {
        let meta = UserMetadata {
            preferred_username: Some("0xCafe".to_string()),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-8", None, meta);
        assert!(c.irc_nick().unwrap().starts_with('_'));
    }

    #[test]
    fn irc_nick_skips_empty_candidates() {
        let meta = UserMetadata {
            preferred_username: Some("!!!".to_string()),
            user_name: Some("h0lybyte".to_string()),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-9", None, meta);
        assert_eq!(c.irc_nick().as_deref(), Some("h0lybyte"));
    }

    #[test]
    fn irc_nick_returns_none_when_all_candidates_sanitize_empty() {
        let meta = UserMetadata {
            preferred_username: Some("!!!".to_string()),
            user_name: Some("@@@".to_string()),
            nickname: Some("###".to_string()),
            ..Default::default()
        };
        let c = claims_with_metadata("uuid-10", Some("admin@kbve.com"), meta);
        assert_eq!(c.irc_nick(), None);
    }
}
