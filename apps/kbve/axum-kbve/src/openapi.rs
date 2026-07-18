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
        (name = "mc-lot", description = "Minecraft digital real-estate: schematic catalog, lot listings, viewport map, caller-scoped purchase and build/demolish queue."),
        (name = "mc-lot-staff", description = "Staff-only ops surface for the MC lot system: failed-job triage, retry, forced user-lot release, orphan-transitional repair."),
        (name = "mc-lot-service", description = "service_role-only worker surface for the MC mod: claim job batches, mark applied/failed, requeue stale claims."),
        (name = "rcon", description = "Generic RCON exec — staff-gated, allowlist-driven, MC + Factorio backends."),
        (name = "telemetry", description = "Client-side error reporting from WASM/JS."),
        (name = "dashboard", description = "Staff-only routes powering kbve.com/dashboard. Gated on DASHBOARD_VIEW."),
        (name = "wallet", description = "Authenticated wallet surface: balance, coupons, claim flows."),
        (name = "market", description = "Player marketplace: list, browse, bid, buy-now. Khash-only with a 1% KBVE Treasury fee.")
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
        crate::transport::https::mc_player_by_uuid_handler,
        crate::transport::https::mc_texture_handler,
        // rcon (generic exec)
        crate::rcon::handler::exec_handler,
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
        crate::transport::ledger::me_ledger,
        // wallet — service surface (service_role JWT)
        crate::transport::wallet::service_balance,
        crate::transport::wallet::service_credit,
        crate::transport::wallet::service_credit_user,
        crate::transport::wallet::service_debit,
        crate::transport::wallet::service_debit_discord,
        crate::transport::wallet::service_transfer,
        crate::transport::wallet::service_redeem_coupon,
        crate::transport::wallet::service_revoke_coupon,
        crate::transport::wallet::service_verify_balance,
        // marketplace — public browse
        crate::transport::market::list_active,
        crate::transport::market::listing_detail,
        // marketplace — caller scope
        crate::transport::market::me_listings,
        crate::transport::market::me_bids,
        // marketplace — write
        crate::transport::market::create_listing,
        crate::transport::market::place_bid,
        crate::transport::market::buy_now,
        crate::transport::market::cancel_listing,
        // store
        crate::transport::store::list_products,
        crate::transport::store::product_detail,
        crate::transport::store::my_entitlements,
        crate::transport::store::buy,
        crate::transport::store::staff_upsert_product,
        crate::transport::store::staff_set_product_status,
        crate::transport::store::staff_upsert_variant,
        crate::transport::store::staff_set_variant_status,
        crate::transport::store::buy_physical,
        crate::transport::store::my_orders,
        crate::transport::store::staff_list_orders,
        crate::transport::store::staff_advance_order,
        crate::transport::store::staff_refund_order,
        crate::transport::topup::checkout,
        crate::transport::pod::submit_pod,
        // mc-lot — user surface
        crate::transport::mc_lot::list_schematics,
        crate::transport::mc_lot::list_vacant,
        crate::transport::mc_lot::list_viewport,
        crate::transport::mc_lot::list_my_active,
        crate::transport::mc_lot::list_my_transitional,
        crate::transport::mc_lot::me_purchase,
        crate::transport::mc_lot::me_queue_build,
        crate::transport::mc_lot::me_queue_demolish,
        // mc-lot — staff surface (forum.is_staff gate)
        crate::transport::mc_lot::staff_get_lot,
        crate::transport::mc_lot::staff_list_failed,
        crate::transport::mc_lot::staff_retry,
        crate::transport::mc_lot::staff_release_user,
        crate::transport::mc_lot::staff_repair_orphan,
        // mc-lot — service surface (service_role JWT)
        crate::transport::mc_lot::service_claim,
        crate::transport::mc_lot::service_mark_applied,
        crate::transport::mc_lot::service_mark_failed,
        crate::transport::mc_lot::service_requeue_stale,
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
            crate::transport::ledger::LedgerRowDto,
            crate::transport::ledger::LedgerPageDto,
            crate::transport::ledger::NextCursorDto,
            // wallet — service surface
            crate::transport::wallet::ServiceCreditBody,
            crate::transport::wallet::ServiceCreditUserBody,
            crate::transport::wallet::ServiceCreditUserDto,
            crate::transport::wallet::ServiceDebitDiscordBody,
            crate::transport::wallet::ServiceDebitDiscordDto,
            crate::transport::wallet::ServiceLedgerDto,
            crate::transport::wallet::ServiceTransferBody,
            crate::transport::wallet::ServiceRedeemCouponBody,
            crate::transport::wallet::ServiceRevokeCouponBody,
            crate::transport::wallet::ServiceRevokeDto,
            crate::transport::wallet::ServiceVerifyBalanceDto,
            // rcon
            crate::rcon::handler::RconExecRequest,
            crate::rcon::handler::RconExecResponse,
            // marketplace
            crate::transport::market::MarketListingDto,
            crate::transport::market::MarketListingDetailDto,
            crate::transport::market::MarketMyListingDto,
            crate::transport::market::MarketMyBidDto,
            crate::transport::market::CreateListingBody,
            crate::transport::market::PlaceBidBody,
            crate::transport::market::BuyNowBody,
            crate::transport::market::CancelListingBody,
            crate::transport::market::MarketIdDto,
            // store
            crate::transport::store::StoreProductDto,
            crate::transport::store::StoreEntitlementDto,
            crate::transport::store::StoreBuyBody,
            crate::transport::store::StoreItemDto,
            crate::transport::store::StoreVariantDto,
            crate::transport::store::StoreProductDetailDto,
            crate::transport::store::StoreIdDto,
            crate::transport::store::StaffUpsertProductBody,
            crate::transport::store::StaffStatusBody,
            crate::transport::store::StaffUpsertVariantBody,
            crate::transport::store::BuyPhysicalBody,
            crate::transport::store::StoreOrderDto,
            crate::transport::store::StoreOrderStaffDto,
            crate::transport::store::OrderIdDto,
            crate::transport::store::AdvanceOrderBody,
            crate::transport::store::RefundOrderBody,
            crate::transport::store::MyOrdersQuery,
            crate::transport::topup::CheckoutBody,
            crate::transport::topup::CheckoutDto,
            crate::transport::pod::PodSubmitDto,
            // mc-lot — DTOs
            crate::transport::mc_lot::SchematicDto,
            crate::transport::mc_lot::VacantLotDto,
            crate::transport::mc_lot::OwnedLotDto,
            crate::transport::mc_lot::ViewportLotDto,
            crate::transport::mc_lot::ServiceLotDto,
            crate::transport::mc_lot::ClaimedBuildDto,
            crate::transport::mc_lot::FailedBuildDto,
            crate::transport::mc_lot::ReleasedLotDto,
            crate::transport::mc_lot::RepairedLotDto,
            crate::transport::mc_lot::RequeueSummaryDto,
            crate::transport::mc_lot::PurchaseLotDto,
            crate::transport::mc_lot::BuildIdDto,
            crate::transport::mc_lot::OkDto,
            // mc-lot — request bodies
            crate::transport::mc_lot::PurchaseLotBody,
            crate::transport::mc_lot::QueueBuildBody,
            crate::transport::mc_lot::QueueDemolishBody,
            crate::transport::mc_lot::ServiceClaimBody,
            crate::transport::mc_lot::ServiceMarkAppliedBody,
            crate::transport::mc_lot::ServiceMarkFailedBody,
            crate::transport::mc_lot::StaffRetryBody,
            crate::transport::mc_lot::StaffReleaseUserBody,
            // mc-lot — Query types (ToSchema for cross-reference)
            crate::transport::mc_lot::ListSchematicsQuery,
            crate::transport::mc_lot::ListLotsQuery,
            crate::transport::mc_lot::ViewportQuery,
            crate::transport::mc_lot::ServiceRequeueStaleQuery,
            crate::transport::mc_lot::StaffListFailedQuery,
            crate::transport::mc_lot::StaffRepairQuery,
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
