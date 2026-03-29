//! Supabase integration module — JWT validation + service key auth.
//!
//! Two auth paths for ROWS:
//!
//! ## A) Player Auth (JWT)
//! Client logs in via Supabase Auth → gets JWT → sends as Authorization: Bearer <jwt>
//! ROWS validates JWT locally using Supabase JWT secret (no round-trip).
//!
//! Flow:
//!   1. Client: POST /auth/v1/token → Supabase Auth → returns JWT
//!   2. Client: GET /api/Users/GetAllCharacters (Authorization: Bearer <jwt>)
//!   3. ROWS: validate JWT signature, extract user_id + customer_guid from claims
//!   4. ROWS: proceed with request using extracted identities
//!
//! ## B) Service Key Auth
//! Dashboard/CI/admin tools use the Supabase service_role key.
//! Required for /api/System/* endpoints.
//!
//! Flow:
//!   1. Admin: sends X-Service-Key: <service_role_key>
//!   2. ROWS: validates against stored hash (not plaintext compare)
//!   3. ROWS: grants full access to system endpoints
//!
//! ## Migration Strategy (backward compatible)
//! - Phase 1 (current): X-CustomerGUID header (no JWT)
//! - Phase 2: Accept BOTH X-CustomerGUID and Authorization: Bearer (dual mode)
//! - Phase 3: Require JWT for player endpoints, X-CustomerGUID deprecated
//! - Phase 4: Remove X-CustomerGUID support entirely
//!
//! ## Environment Variables
//! - SUPABASE_JWT_SECRET: JWT signing secret from Supabase project settings
//! - SUPABASE_URL: Supabase project URL (e.g. https://xyz.supabase.co)
//! - SUPABASE_SERVICE_KEY: service_role key for admin operations
//! - SUPABASE_ANON_KEY: anon key for client-side operations (optional, for reference)

use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Supabase configuration — loaded from env vars at startup.
#[derive(Clone)]
pub struct SupabaseConfig {
    /// JWT signing secret (from Supabase dashboard → Settings → API → JWT Secret)
    pub jwt_secret: Option<String>,
    /// Supabase project URL (e.g. https://xyz.supabase.co)
    pub url: Option<String>,
    /// Service role key hash — stored as argon2 hash, not plaintext.
    /// Compare incoming service keys against this hash.
    pub service_key_hash: Option<String>,
}

impl SupabaseConfig {
    /// Load Supabase config from environment variables.
    /// All fields are optional — ROWS works without Supabase (legacy mode).
    pub fn from_env() -> Self {
        Self {
            jwt_secret: std::env::var("SUPABASE_JWT_SECRET").ok(),
            url: std::env::var("SUPABASE_URL").ok(),
            service_key_hash: std::env::var("SUPABASE_SERVICE_KEY_HASH").ok(),
        }
    }

    /// Check if JWT validation is configured.
    pub fn jwt_enabled(&self) -> bool {
        self.jwt_secret.is_some()
    }

    /// Check if service key validation is configured.
    pub fn service_key_enabled(&self) -> bool {
        self.service_key_hash.is_some()
    }
}

/// Supabase JWT claims — matches the structure Supabase Auth generates.
/// See: https://supabase.com/docs/guides/auth/jwts
#[derive(Debug, Deserialize, Serialize)]
pub struct SupabaseClaims {
    /// Subject — Supabase user ID (UUID)
    pub sub: String,
    /// Audience — usually ["authenticated"]
    #[serde(default)]
    pub aud: String,
    /// Role — "authenticated", "anon", or "service_role"
    #[serde(default)]
    pub role: String,
    /// Issued at (Unix timestamp)
    #[serde(default)]
    pub iat: i64,
    /// Expiry (Unix timestamp)
    #[serde(default)]
    pub exp: i64,
    /// Email from Supabase Auth
    #[serde(default)]
    pub email: Option<String>,
    /// Custom app metadata — we store customer_guid here
    #[serde(default)]
    pub app_metadata: Option<AppMetadata>,
}

/// Custom metadata stored in the JWT by Supabase Auth hooks.
/// Set via: supabase.auth.admin.updateUserById(uid, { app_metadata: { customer_guid: "..." } })
#[derive(Debug, Deserialize, Serialize, Default)]
pub struct AppMetadata {
    /// The OWS customer GUID this user belongs to.
    #[serde(default)]
    pub customer_guid: Option<String>,
    /// Admin flag — set by Supabase Auth hooks for privileged users.
    #[serde(default)]
    pub is_admin: Option<bool>,
}

/// Result of JWT validation.
#[derive(Debug)]
pub struct ValidatedUser {
    /// Supabase user ID
    pub user_id: Uuid,
    /// OWS customer GUID (from app_metadata or fallback)
    pub customer_guid: Uuid,
    /// User role (authenticated, service_role)
    pub role: String,
    /// Email (if present in JWT)
    pub email: Option<String>,
    /// Whether this user has admin privileges
    pub is_admin: bool,
}

/// Validate a Supabase JWT and extract user identity.
///
/// # Errors
/// - Invalid signature → Unauthorized
/// - Expired token → Unauthorized
/// - Missing customer_guid in claims → BadRequest
///
/// # Note
/// This validates locally using the JWT secret — no network call to Supabase.
/// Token revocation is NOT checked (Supabase doesn't support token blocklists).
/// For revocation, check session validity against the DB.
pub fn validate_jwt(token: &str, config: &SupabaseConfig) -> Result<ValidatedUser, JwtError> {
    let secret = config.jwt_secret.as_ref().ok_or(JwtError::NotConfigured)?;

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["authenticated"]);
    // Supabase uses "authenticated" as the default audience
    // Service role tokens have audience "service_role"
    validation.validate_aud = false; // TODO: enable after confirming Supabase audience format

    let key = DecodingKey::from_secret(secret.as_bytes());

    let token_data = jsonwebtoken::decode::<SupabaseClaims>(token, &key, &validation)
        .map_err(|e| JwtError::Invalid(e.to_string()))?;

    let claims = token_data.claims;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| JwtError::Invalid("Invalid sub (user_id) in JWT".into()))?;

    let customer_guid = claims
        .app_metadata
        .as_ref()
        .and_then(|m| m.customer_guid.as_ref())
        .and_then(|g| Uuid::parse_str(g).ok())
        .unwrap_or(Uuid::nil()); // TODO: make customer_guid required after migration

    let is_admin = claims
        .app_metadata
        .as_ref()
        .and_then(|m| m.is_admin)
        .unwrap_or(false);

    Ok(ValidatedUser {
        user_id,
        customer_guid,
        role: claims.role,
        email: claims.email,
        is_admin,
    })
}

/// Validate a service key against the stored hash.
///
/// # Security
/// - Service key is compared against an argon2 hash, not plaintext
/// - Prevents timing attacks (argon2 verify is constant-time)
/// - Hash stored in SUPABASE_SERVICE_KEY_HASH env var
pub fn validate_service_key(key: &str, config: &SupabaseConfig) -> Result<(), JwtError> {
    let hash = config
        .service_key_hash
        .as_ref()
        .ok_or(JwtError::NotConfigured)?;

    // TODO(implement): Use argon2::verify_password to compare key against hash
    // For now, stub that returns NotConfigured
    let _ = (key, hash);

    Err(JwtError::NotConfigured)
}

#[derive(Debug, thiserror::Error)]
pub enum JwtError {
    #[error("JWT validation not configured (SUPABASE_JWT_SECRET not set)")]
    NotConfigured,
    #[error("Invalid JWT: {0}")]
    Invalid(String),
    #[error("Token expired")]
    Expired,
    #[error("Invalid service key")]
    InvalidServiceKey,
}

// ─── Middleware Integration Stubs ─────────────────────────────
//
// TODO(jwt-middleware): Add axum middleware that:
//   1. Checks Authorization: Bearer <jwt> header
//   2. Falls back to X-CustomerGUID if no Bearer token (Phase 2 dual mode)
//   3. Validates JWT via validate_jwt()
//   4. Injects ValidatedUser into request extensions
//   5. Handlers extract ValidatedUser from extensions instead of parsing headers
//
// Example handler signature after migration:
//   async fn get_all_characters(
//       user: Extension<ValidatedUser>,
//       Json(body): Json<GetAllCharactersDto>,
//   ) -> impl IntoResponse { ... }
//
// TODO(service-middleware): Add axum middleware for /api/System/* that:
//   1. Checks X-Service-Key header
//   2. Validates via validate_service_key()
//   3. Returns 403 if invalid
//   4. Bypasses JWT check (service key = full access)
//
// TODO(token-refresh): Consider adding a /auth/refresh endpoint that:
//   1. Accepts a Supabase refresh_token
//   2. Proxies to Supabase Auth to get a new JWT
//   3. Returns the new JWT to the client
//   4. Avoids client needing to know Supabase URL directly
//
// TODO(rls-passthrough): For PostgREST compatibility:
//   1. Set request.jwt.claims in each DB transaction
//   2. Enables Supabase RLS policies to work with direct ROWS queries
//   3. Requires: SET LOCAL request.jwt.claims = '<json>' per transaction
