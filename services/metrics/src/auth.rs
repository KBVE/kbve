use axum::http::HeaderMap;
use kbve::gate::{AuthError, Claims, StaffGate, extract_token, validate_token};

pub struct StaffAuth {
    jwt_secret: String,
    staff: Option<StaffGate>,
    /// Accept-both verifier (HS256 + ES256/JWKS) for the asymmetric-signing
    /// transition. `None` → HS256-only via `validate_token`.
    verifier: Option<jedi::jwks::JwtVerifier>,
}

impl StaffAuth {
    pub fn from_env() -> Option<Self> {
        let jwt_secret = std::env::var("SUPABASE_JWT_SECRET")
            .ok()
            .filter(|s| !s.is_empty())?;

        let staff = match std::env::var("SUPABASE_URL").ok().filter(|s| !s.is_empty()) {
            Some(url) => {
                let apikey = std::env::var("SUPABASE_ANON_KEY")
                    .ok()
                    .filter(|s| !s.is_empty());
                let schema =
                    std::env::var("METRICS_STAFF_SCHEMA").unwrap_or_else(|_| "forum".into());
                let rpc =
                    std::env::var("METRICS_STAFF_RPC").unwrap_or_else(|_| "is_staff".into());
                let ttl = std::env::var("METRICS_STAFF_TTL_SECS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(30);
                Some(StaffGate::new(
                    &url,
                    jwt_secret.clone(),
                    apikey,
                    schema,
                    &rpc,
                    ttl,
                ))
            }
            None => None,
        };

        let verifier = std::env::var("SUPABASE_JWKS_URI")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                std::env::var("SUPABASE_URL").ok().and_then(|u| {
                    let u = u.trim().trim_end_matches('/');
                    (!u.is_empty()).then(|| format!("{u}/auth/v1/.well-known/jwks.json"))
                })
            })
            .map(|jwks_uri| {
                let issuer = std::env::var("SUPABASE_JWT_ISSUER")
                    .ok()
                    .filter(|s| !s.trim().is_empty());
                let v = jedi::jwks::JwtVerifier::new(
                    jwks_uri,
                    Some(jwt_secret.as_bytes()),
                    issuer,
                    None,
                );
                let bg = v.clone();
                tokio::spawn(async move {
                    bg.start(std::time::Duration::from_secs(300)).await;
                });
                v
            });

        Some(Self {
            jwt_secret,
            staff,
            verifier,
        })
    }

    pub async fn require_staff(&self, headers: &HeaderMap) -> Result<Claims, AuthError> {
        let auth = headers.get("authorization").and_then(|v| v.to_str().ok());
        let cookie = headers.get("cookie").and_then(|v| v.to_str().ok());
        let token = extract_token(auth, cookie, None).ok_or(AuthError::MissingToken)?;

        let claims = match &self.verifier {
            Some(v) => v.verify::<Claims>(&token).map_err(|e| match e {
                jedi::jwks::VerifyError::Expired => AuthError::TokenExpired,
                other => AuthError::InvalidToken(other.to_string()),
            })?,
            None => validate_token(&token, &self.jwt_secret)?.claims,
        };

        if matches!(claims.role.as_str(), "service_role" | "supabase_admin") {
            return Ok(claims);
        }

        match &self.staff {
            Some(gate) if gate.is_staff(&claims.sub).await? => Ok(claims),
            _ => Err(AuthError::NotStaff),
        }
    }
}
