use utoipa::OpenApi;

use crate::error::SuccessResponse;
use crate::models::*;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "ROWS — Rust Open World Server",
        description = "Single-binary game backend (REST + gRPC + WS) replacing the OWS .NET microservices for ChuckRPG. Surfaced through the kbve.com dashboard via a same-origin proxy that injects the tenant X-CustomerGUID header.",
        contact(
            name = "KBVE",
            url = "https://kbve.com",
            email = "support@kbve.com"
        ),
        license(name = "MIT"),
        version = env!("CARGO_PKG_VERSION"),
    ),
    servers(
        (url = "/dashboard/chuckrpg/proxy", description = "Same-origin staff proxy (DASHBOARD_VIEW, X-CustomerGUID injected by axum-kbve)"),
        (url = "http://localhost:4322", description = "Local ROWS (set X-CustomerGUID manually)"),
    ),
    paths(
        crate::rest::root,
        crate::rest::health,
        crate::rest::system::fleet_status,
        crate::rest::system::aggregated_health,
        crate::rest::system::active_players,
        crate::rest::system::instance_log,
        crate::rest::system::deployment_info,
        crate::rest::system::restart_game_server,
        crate::rest::system::restart_fleet,
        crate::rest::system::verify_deployment,
    ),
    components(schemas(
        HealthResponse,
        SuccessResponse,
        LoginResult,
        Character,
        UserSession,
        UserSessionWithCharacter,
        ZoneInstance,
        JoinMapResult,
        GlobalData,
        CustomCharacterData,
        CharacterAbility,
        CustomDataRows,
        AbilityBar,
        AbilityBarAbility,
        ServerInstanceInfo,
        CharacterStatus,
        PlayerGroupMembership,
        UserInfo,
        crate::rest::system::InstanceEvent,
    )),
    tags(
        (name = "health", description = "Health and readiness probes"),
        (name = "system", description = "Dashboard endpoints — fleet, health, active players, instance log, deployment metadata, restart + verification ops."),
        (name = "auth", description = "Login, registration, session management"),
        (name = "characters", description = "Character CRUD, stats, custom data"),
        (name = "instances", description = "Server instance lifecycle"),
        (name = "abilities", description = "Character ability management"),
        (name = "zones", description = "Zone management"),
        (name = "global", description = "Global key-value data"),
    )
)]
pub struct ApiDoc;
