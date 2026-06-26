use axum::http::HeaderMap;
use kbve::gate::{AuthError, Claims, StaffGate, extract_token, validate_token};

pub struct StaffAuth {
    jwt_secret: String,
    staff: Option<StaffGate>,
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

        Some(Self { jwt_secret, staff })
    }

    pub async fn require_staff(&self, headers: &HeaderMap) -> Result<Claims, AuthError> {
        let auth = headers.get("authorization").and_then(|v| v.to_str().ok());
        let cookie = headers.get("cookie").and_then(|v| v.to_str().ok());
        let token = extract_token(auth, cookie, None).ok_or(AuthError::MissingToken)?;

        let claims = validate_token(&token, &self.jwt_secret)?.claims;

        if matches!(claims.role.as_str(), "service_role" | "supabase_admin") {
            return Ok(claims);
        }

        match &self.staff {
            Some(gate) if gate.is_staff(&claims.sub).await? => Ok(claims),
            _ => Err(AuthError::NotStaff),
        }
    }
}
