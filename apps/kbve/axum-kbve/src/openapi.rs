//! OpenAPI spec aggregator.
//!
//! `ApiDoc` derives an `OpenApi` value from every annotated `#[utoipa::path]`
//! handler + `#[derive(ToSchema)]` type. Mounted at `/api/openapi.json` so
//! the astro side renders it via Scalar at `/dashboard/api` and the
//! `/llms.txt` build step reads paths/summaries from it.
//!
//! Handlers are listed explicitly in `paths(...)` rather than auto-collected
//! via `utoipa-axum` because the router is a hand-written monolith and we
//! don't want to rewire it just to register paths. Adding a new annotated
//! handler = one line here.

use axum::Json;
use utoipa::{
    Modify, OpenApi,
    openapi::security::{Http, HttpAuthScheme, SecurityScheme},
};

use crate::db::{
    CommentRow, DiscordInfo, FeedRow, GithubInfo, RentEarthProfile, SpaceRow, TagRow, ThreadRow,
    TwitchInfo, UserProfile, UserProvider,
};
use crate::gameserver::token::{TokenRequest, TokenResponse};
use crate::transport::https::{
    CreateCommentBody, CreateThreadBody, EditCommentBody, HealthResponse, SetUsernameRequest,
    StatusResponse,
};
use crate::transport::proxy::{ClickHouseLogsRequest, ClickHouseLogsResponse};

/// Adds the `bearerAuth` security scheme so `#[utoipa::path(security(...))]`
/// references resolve. JWT goes in the `Authorization: Bearer ...` header.
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
        title = "KBVE API",
        description = "Public HTTP surface served by axum-kbve. Drives the website, game-server token issuance, and forum.",
        contact(
            name = "KBVE",
            url = "https://kbve.com",
            email = "support@kbve.com"
        ),
        license(name = "MIT")
    ),
    servers(
        (url = "https://kbve.com", description = "Production"),
        (url = "http://localhost:4321", description = "Local dev")
    ),
    tags(
        (name = "system", description = "Health + status endpoints. Used by uptime probes and the public footer."),
        (name = "auth", description = "Authentication tokens. Includes the Netcode game-server handshake."),
        (name = "profile", description = "User profile lookup + self-service. Cache-first, enriched with Discord/Twitch/RentEarth providers."),
        (name = "forum", description = "Public forum threads, comments, spaces, and tags."),
        (name = "osrs", description = "Old School RuneScape item lookups."),
        (name = "mc", description = "Minecraft RCON-backed live data: player list, head textures."),
        (name = "telemetry", description = "Client-side error reporting from WASM/JS."),
        (name = "dashboard", description = "Staff-only routes powering kbve.com/dashboard. Gated on DASHBOARD_VIEW."),
        (name = "wallet", description = "Authenticated wallet surface: balance, coupons, claim flows.")
    ),
    paths(
        // system
        crate::transport::https::health,
        crate::transport::https::api_status,
        // auth
        crate::gameserver::token::game_token_handler,
        // telemetry
        crate::telemetry::report_handler,
        // profile
        crate::transport::https::profile_me_handler,
        crate::transport::https::set_username_handler,
        crate::transport::https::profile_api_handler,
        // osrs
        crate::transport::https::osrs_api_handler,
        // mc
        crate::transport::https::mc_players_handler,
        crate::transport::https::mc_texture_handler,
        // forum
        crate::transport::https::api_me,
        crate::transport::https::api_me_staff,
        crate::transport::https::api_list_spaces,
        crate::transport::https::api_list_tags,
        crate::transport::https::api_create_thread,
        crate::transport::https::api_create_comment,
        crate::transport::https::api_edit_comment,
        crate::transport::https::api_remove_comment,
        crate::transport::https::api_staff_edit_comment,
        // dashboard
        crate::transport::proxy::clickhouse_logs_proxy_handler,
        // wallet — authenticated user surface
        crate::transport::wallet::me_balance,
        crate::transport::wallet::me_coupons,
        crate::transport::wallet::me_redeem_coupon,
        // wallet — service surface (service_role JWT)
        crate::transport::wallet::service_credit,
        crate::transport::wallet::service_credit_user,
        crate::transport::wallet::service_debit,
        crate::transport::wallet::service_transfer,
        crate::transport::wallet::service_redeem_coupon,
        crate::transport::wallet::service_revoke_coupon,
        crate::transport::wallet::service_verify_balance,
    ),
    components(
        schemas(
            HealthResponse,
            StatusResponse,
            SetUsernameRequest,
            TokenRequest,
            TokenResponse,
            crate::telemetry::ClientEvent,
            UserProfile,
            UserProvider,
            DiscordInfo,
            GithubInfo,
            TwitchInfo,
            RentEarthProfile,
            FeedRow,
            ThreadRow,
            CommentRow,
            SpaceRow,
            TagRow,
            CreateThreadBody,
            CreateCommentBody,
            EditCommentBody,
            ClickHouseLogsRequest,
            ClickHouseLogsResponse,
            // wallet — user surface
            crate::transport::wallet::BalanceDto,
            crate::transport::wallet::CouponDto,
            crate::transport::wallet::RedeemCouponBody,
            crate::transport::wallet::RedeemCouponDto,
            // wallet — service surface
            crate::transport::wallet::ServiceCreditBody,
            crate::transport::wallet::ServiceCreditUserBody,
            crate::transport::wallet::ServiceCreditUserDto,
            crate::transport::wallet::ServiceLedgerDto,
            crate::transport::wallet::ServiceTransferBody,
            crate::transport::wallet::ServiceRedeemCouponBody,
            crate::transport::wallet::ServiceRevokeCouponBody,
            crate::transport::wallet::ServiceRevokeDto,
            crate::transport::wallet::ServiceVerifyBalanceDto,
        )
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;

/// `GET /api/openapi.json`
///
/// Returns the full OpenAPI 3.1 spec. Used by:
/// - `astro-kbve` `/dashboard/api` Scalar viewer (runtime fetch)
/// - `astro-kbve` `/llms.txt` build-time generator (build-time fetch)
/// - any external client that wants typed access to the API
pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
