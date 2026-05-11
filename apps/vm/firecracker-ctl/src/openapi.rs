//! OpenAPI spec aggregator for firecracker-ctl.
//!
//! Mirrors `axum-kbve/src/openapi.rs`: handlers carry `#[utoipa::path(...)]`,
//! request/response types derive `ToSchema`, and `ApiDoc` enumerates the set
//! that ends up in the generated spec. Mounted at `/openapi.json` so the
//! astro side can render it via Scalar alongside the public API surface.
//!
//! Each new annotated handler = one line in `paths(...)`.

use axum::Json;
use utoipa::{
    Modify, OpenApi,
    openapi::security::{Http, HttpAuthScheme, SecurityScheme},
};

use crate::{
    CreateVmRequest, DeployFcRequest, EndpointStatus, PersistentEndpointInfo, VmInfo, VmResult,
    VmStatus,
};

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
        title = "Firecracker Control API",
        description = "Internal staff API for managing Firecracker microVMs. Surfaced through the kbve.com dashboard via a same-origin proxy; not exposed publicly.",
        contact(
            name = "KBVE",
            url = "https://kbve.com",
            email = "support@kbve.com"
        ),
        license(name = "MIT")
    ),
    servers(
        (url = "/api/firecracker", description = "Same-origin proxy on kbve.com"),
        (url = "http://localhost:8080", description = "Local firecracker-ctl")
    ),
    tags(
        (name = "system", description = "Liveness + build identity. Used by uptime probes."),
        (name = "ephemeral", description = "One-shot VMs that boot, run an entrypoint, capture stdout/stderr, then teardown."),
        (name = "persistent", description = "Long-lived microVMs addressed by name with TAP networking + /proxy/{name} reverse-proxy.")
    ),
    paths(
        crate::health,
        crate::create_vm,
        crate::get_vm_status,
        crate::get_vm_result,
        crate::destroy_vm,
        crate::list_vms,
        crate::fc_deploy,
        crate::fc_list,
        crate::fc_get,
        crate::fc_destroy,
    ),
    components(
        schemas(
            CreateVmRequest,
            VmStatus,
            VmInfo,
            VmResult,
            DeployFcRequest,
            EndpointStatus,
            PersistentEndpointInfo,
        )
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;

/// `GET /openapi.json` — full spec served to staff dashboard Scalar viewer.
pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
