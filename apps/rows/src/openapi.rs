use utoipa::OpenApi;

use crate::error::SuccessResponse;
use crate::models::*;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "ROWS — Rust Open World Server",
        description = "Single-binary game backend (REST + gRPC) replacing the OWS .NET microservices.",
        version = env!("CARGO_PKG_VERSION"),
    ),
    paths(
        crate::rest::root,
        crate::rest::health,
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
    )),
    tags(
        (name = "health", description = "Health and readiness probes"),
        (name = "auth", description = "Login, registration, session management"),
        (name = "characters", description = "Character CRUD, stats, custom data"),
        (name = "instances", description = "Server instance lifecycle"),
        (name = "abilities", description = "Character ability management"),
        (name = "zones", description = "Zone management"),
        (name = "global", description = "Global key-value data"),
    )
)]
pub struct ApiDoc;
