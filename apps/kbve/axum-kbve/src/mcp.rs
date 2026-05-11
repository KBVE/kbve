//! MCP server bridge.
//!
//! Re-uses the utoipa OpenAPI document from [`crate::openapi::ApiDoc`] to
//! expose every annotated handler as an MCP tool at `/api/mcp`. Tool calls
//! dispatch back into the local axum listener via loopback so we do not
//! double-route through Cloudflare for in-pod traffic.
//!
//! Authorization runs in passthrough mode: clients send their kbve JWT as
//! `Authorization: Bearer <token>`; rmcp-openapi forwards the header into
//! the upstream request and the existing axum auth middleware validates it.

use std::sync::Arc;

use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, session::local::LocalSessionManager, tower::StreamableHttpService,
};
use rmcp_openapi::{AuthorizationMode, Server};
use tracing::{info, warn};
use url::Url;
use utoipa::OpenApi;

use crate::openapi::ApiDoc;

pub type McpService = StreamableHttpService<Server, LocalSessionManager>;

pub fn build_service() -> Option<McpService> {
    let upstream = std::env::var("MCP_UPSTREAM_BASE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:4321".to_string());
    let base_url = match Url::parse(&upstream) {
        Ok(u) => u,
        Err(err) => {
            warn!(%err, %upstream, "invalid MCP_UPSTREAM_BASE_URL — MCP disabled");
            return None;
        }
    };

    let spec = serde_json::to_value(ApiDoc::openapi()).expect("ApiDoc::openapi() must serialise");

    let mut server = Server::new(spec, base_url, None, None, false, false);
    server.name = Some("kbve".to_string());
    server.version = Some(crate::version::current().to_string());
    server.title = Some("KBVE MCP".to_string());
    server.instructions = Some(
        "MCP surface for the public KBVE HTTP API. Each tool corresponds to a \
         #[utoipa::path] handler in axum-kbve. Protected tools require an \
         Authorization: Bearer <kbve-jwt> header on the MCP transport."
            .to_string(),
    );
    server.set_authorization_mode(AuthorizationMode::PassthroughSilent);

    if let Err(err) = server.load_openapi_spec() {
        warn!(%err, "failed to load OpenAPI spec into MCP server — MCP disabled");
        return None;
    }
    if let Err(err) = server.validate_registry() {
        warn!(%err, "MCP tool registry failed validation — MCP disabled");
        return None;
    }

    info!(
        tool_count = server.tool_count(),
        "MCP server initialised (passthrough auth, loopback upstream)"
    );

    Some(StreamableHttpService::new(
        move || Ok(server.clone()),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    ))
}
