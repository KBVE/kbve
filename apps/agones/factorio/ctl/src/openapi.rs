//! OpenAPI spec aggregator for factorio-ctl.
//!
//! Mirrors firecracker-ctl/src/openapi.rs: handlers carry `#[utoipa::path]`,
//! types derive `ToSchema`, `ApiDoc` enumerates the set, served at
//! `/openapi.json` for the staff dashboard Scalar viewer. Routes use the
//! `/factorio/*` prefix (never `/fc/*`, which belongs to firecracker-ctl).

use axum::Json;
use utoipa::{
    Modify, OpenApi,
    openapi::security::{Http, HttpAuthScheme, SecurityScheme},
};

use crate::{HealthResponse, ServerResponse, agones::GameServerStatus};

/// Adds `bearerAuth` so `security(("bearerAuth" = []))` on handlers resolves.
/// The actual gate lives in the front-end proxy (axum-kbve); this is purely
/// metadata for the Scalar UI.
pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi
            .components
            .as_mut()
            .expect("components defined in derive");
        components.add_security_scheme(
            "bearerAuth",
            SecurityScheme::Http(Http::new(HttpAuthScheme::Bearer)),
        );
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Factorio Control API",
        description = "Internal staff API for the Agones-managed Factorio server. Surfaced through the kbve.com dashboard via a same-origin proxy; not exposed publicly. Routes use the /factorio/* prefix.",
        contact(name = "KBVE", url = "https://kbve.com", email = "support@kbve.com"),
        license(name = "MIT")
    ),
    servers(
        (url = "/dashboard/factorio/proxy", description = "Same-origin staff proxy (DASHBOARD_VIEW)"),
        (url = "http://localhost:9002", description = "Local factorio-ctl")
    ),
    tags(
        (name = "system", description = "Liveness + build identity. Used by uptime probes."),
        (name = "server", description = "GameServer status + telemetry for the live Factorio server.")
    ),
    paths(
        crate::health,
        crate::server,
    ),
    components(
        schemas(
            HealthResponse,
            ServerResponse,
            GameServerStatus,
        )
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;

/// `GET /openapi.json` — full spec served to the staff dashboard Scalar viewer.
pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
