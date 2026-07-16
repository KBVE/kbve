use anyhow::Result;
use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::Body,
    extract::{OriginalUri, Path, Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
    routing::{any, get, post},
};
use serde::Serialize;
use serde_json::json;
use tokio::net::TcpListener;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::info;
use utoipa::ToSchema;

use crate::astro::askama::{
    ForumCommentPartial, ForumComposeTemplate, ForumFeedItemPartial, ForumFeedTemplate,
    ForumSpaceNotFoundTemplate, ForumTagsIndexTemplate, ForumThreadTemplate, HealthTemplate,
    ProfileForumCommentRowPartial, ProfileForumThreadRowPartial, ProfileNotFoundTemplate,
    ProfileTemplate, RentEarthCharacterDisplay, TemplateResponse,
};
use crate::auth::{extract_request_token, get_jwt_cache};
use crate::db::{
    CommentRow, DiscordClient, FeedQuery, FeedRow, SpaceRow, ThreadRow, UserProfile,
    extract_texture_hash, get_discord_client, get_forum_service, get_mc_service, get_osrs_cache,
    get_profile_cache, get_profile_service, get_rentearth_service, get_role_names,
    get_twitch_client, osrs_ready, validate_username,
};
use askama::Template;

/// Static table of simple permanent redirects handled by Axum before hitting Astro.
const PERMANENT_REDIRECTS: &[(&str, &str)] = &[
    ("/application/k", "/application/kubernetes/"),
    ("/application/k/", "/application/kubernetes/"),
    ("/application/kube", "/application/kubernetes/"),
    ("/application/kube/", "/application/kubernetes/"),
    ("/application/kubes", "/application/kubernetes/"),
    ("/application/kubes/", "/application/kubernetes/"),
    ("/application/kubectl", "/application/kubernetes/"),
    ("/application/kubectl/", "/application/kubernetes/"),
    ("/application/talos", "/application/kubernetes/#talos"),
    ("/application/talos/", "/application/kubernetes/#talos"),
    ("/application/argo", "/application/kubernetes/#argo"),
    ("/application/argo/", "/application/kubernetes/#argo"),
    ("/application/bevy", "/application/rust/#bevy"),
    ("/application/bevy/", "/application/rust/#bevy"),
    ("/health/", "/health"),
    ("/api/v1/forum/tags/", "/api/v1/forum/tags"),
    ("/api/v1/forum/spaces/", "/api/v1/forum/spaces"),
    ("/api/v1/me/", "/api/v1/me"),
    ("/api/v1/me/staff/", "/api/v1/me/staff"),
    ("/dogevideo", "/crypto/"),
    ("/dogevideo/", "/crypto/"),
    ("/donation", "/donate/"),
    ("/donation/", "/donate/"),
    ("/donations", "/donate/"),
    ("/donations/", "/donate/"),
    ("/tta", "/project/"),
    ("/tta/", "/project/"),
    (
        "/osrs/bracelet-of-ethereum",
        "/osrs/bracelet-of-ethereum-uncharged/",
    ),
    (
        "/osrs/bracelet-of-ethereum/",
        "/osrs/bracelet-of-ethereum-uncharged/",
    ),
    ("/tags", "/forum/tags"),
    ("/tags/", "/forum/tags"),
    ("/t", "/forum/tags"),
    ("/t/", "/forum/tags"),
    ("/arcade/towerdefence", "/arcade/towerdefense/"),
    ("/arcade/towerdefence/", "/arcade/towerdefense/"),
    ("/askama/forum/feed", "/forum/"),
    ("/askama/forum/feed/", "/forum/"),
    ("/askama/forum/thread", "/forum/"),
    ("/askama/forum/thread/", "/forum/"),
    ("/askama/forum/compose", "/forum/compose"),
    ("/askama/forum/compose/", "/forum/compose"),
    ("/askama/forum/tags", "/forum/tags"),
    ("/askama/forum/tags/", "/forum/tags"),
    ("/askama/forum/space_not_found", "/forum/"),
    ("/askama/forum/space_not_found/", "/forum/"),
    ("/askama/profile", "/dashboard/profile/"),
    ("/askama/profile/", "/dashboard/profile/"),
    ("/askama/profile_not_found", "/dashboard/profile/"),
    ("/askama/profile_not_found/", "/dashboard/profile/"),
    ("/askama/osrs_not_found", "/osrs/"),
    ("/askama/osrs_not_found/", "/osrs/"),
    ("/account", "/dashboard/account/"),
    ("/account/", "/dashboard/account/"),
    ("/profile", "/dashboard/profile/"),
    ("/profile/", "/dashboard/profile/"),
    ("/profile/account", "/dashboard/account/"),
    ("/profile/account/", "/dashboard/account/"),
    ("/profile/market", "/dashboard/market/"),
    ("/profile/market/", "/dashboard/market/"),
    ("/dashboard/rows", "/dashboard/gameops/rows/"),
    ("/dashboard/rows/", "/dashboard/gameops/rows/"),
];

async fn lang_strip_root() -> Redirect {
    Redirect::permanent("/")
}

async fn lang_strip_handler(Path(rest): Path<String>, OriginalUri(uri): OriginalUri) -> Redirect {
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    Redirect::permanent(&format!("/{rest}{query}"))
}

fn mount_permanent_redirects<S>(
    router: Router<S>,
    redirects: &[(&'static str, &'static str)],
) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    redirects
        .iter()
        .copied()
        .fold(router, |router, (source, target)| {
            router.route(
                source,
                get(move || async move { Redirect::permanent(target) }),
            )
        })
}

#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<AppStateInner>,
}

pub struct AppStateInner {
    pub start_time: std::time::Instant,
    pub version: &'static str,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                start_time: std::time::Instant::now(),
                version: crate::version::current(),
            }),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub(crate) struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct StatusResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub uptime_seconds: u64,
}

/// Request body for setting username
#[derive(Debug, serde::Deserialize, ToSchema)]
pub(crate) struct SetUsernameRequest {
    pub username: String,
}

pub async fn serve(state: AppState) -> Result<()> {
    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4321);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let app = router(state);

    let cert_path = std::env::var("HTTP_CERT").ok();
    let key_path = std::env::var("HTTP_KEY").ok();

    if let (Some(cert), Some(key)) = (cert_path, key_path) {
        let tls_config = axum_server::tls_rustls::RustlsConfig::from_pem_file(&cert, &key)
            .await
            .map_err(|e| anyhow::anyhow!("failed to load TLS certs ({cert}, {key}): {e}"))?;

        info!("HTTPS listening on https://{addr}");

        axum_server::bind_rustls(addr, tls_config)
            .serve(app.into_make_service())
            .await?;
    } else {
        let listener = tuned_listener(addr)?;
        info!("HTTP listening on http://{addr}");

        axum::serve(listener, app)
            .with_graceful_shutdown(shutdown_signal())
            .await?;
    }

    Ok(())
}

fn router(state: AppState) -> Router {
    let max_inflight: usize = num_cpus::get().max(1) * 1024;

    let static_config = crate::astro::StaticConfig::from_env();

    let middleware = tower::ServiceBuilder::new()
        .layer(
            tower_http::trace::TraceLayer::new_for_http().make_span_with(
                tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
            ),
        )
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(axum::error_handling::HandleErrorLayer::new(
            |err: tower::BoxError| async move {
                if err.is::<tower::timeout::error::Elapsed>() {
                    (axum::http::StatusCode::REQUEST_TIMEOUT, "request timed out")
                } else if err.is::<tower::load_shed::error::Overloaded>() {
                    (
                        axum::http::StatusCode::SERVICE_UNAVAILABLE,
                        "service overloaded",
                    )
                } else {
                    tracing::warn!(error = %err, "middleware error");
                    (
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                        "internal server error",
                    )
                }
            },
        ))
        .timeout(Duration::from_secs(10))
        .concurrency_limit(max_inflight)
        .load_shed()
        .layer(tower_http::limit::RequestBodyLimitLayer::new(1024 * 1024));

    let static_router = crate::astro::build_static_router(&static_config)
        .layer(axum::middleware::from_fn(crate::astro::coop_coep_isometric))
        .layer(axum::middleware::from_fn(crate::astro::corp_static_assets))
        .layer(axum::middleware::from_fn(fix_ts_mime))
        .layer(axum::middleware::from_fn(cache_headers));

    let public_router = Router::new()
        .route("/ko", get(lang_strip_root))
        .route("/ko/", get(lang_strip_root))
        .route("/ko/{*rest}", get(lang_strip_handler))
        .route("/ja", get(lang_strip_root))
        .route("/ja/", get(lang_strip_root))
        .route("/ja/{*rest}", get(lang_strip_handler))
        .route("/fr", get(lang_strip_root))
        .route("/fr/", get(lang_strip_root))
        .route("/fr/{*rest}", get(lang_strip_handler))
        .route("/es", get(lang_strip_root))
        .route("/es/", get(lang_strip_root))
        .route("/es/{*rest}", get(lang_strip_handler))
        .route("/health", get(health))
        .route("/health/pg", get(health_pg))
        .route("/health.html", get(health_html))
        .route("/api/status", get(api_status))
        .route("/api/openapi.json", get(crate::openapi::openapi_json))
        .route(
            "/api/firecracker/openapi.json",
            get(super::proxy::firecracker_openapi_handler),
        )
        .route(
            "/api/factorio/openapi.json",
            get(super::proxy::factorio_openapi_handler),
        )
        .route(
            "/api/rows/openapi.json",
            get(super::proxy::chuckrpg_openapi_handler),
        )
        .route("/api/v1/osrs/{item_id}", get(osrs_api_handler))
        .route("/api/v1/profile/me", get(profile_me_handler))
        .route("/api/v1/profile/username", post(set_username_handler))
        // Discord Activity session bridge (arpg embed): OAuth code -> Discord
        // token -> linked KBVE profile -> Supabase HS256 JWT. The Activity itself
        // is served from arpg.kbve.com/discord/arpg/ (portal root); it reaches
        // this kbve.com endpoint cross-origin through the portal URL Mapping
        // /arpg-session -> kbve.com, fetching /.proxy/arpg-session/api/v1/discord/session.
        .route(
            "/api/v1/discord/session",
            post(super::discord_session::session),
        )
        .route("/api/v1/profile/{username}", get(profile_api_handler))
        .route(
            "/api/v1/auth/game-token",
            post(crate::gameserver::token::game_token_handler),
        )
        .route(
            "/api/v1/telemetry/report",
            post(crate::telemetry::report_handler),
        )
        .route("/api/v1/mc/players", get(mc_players_handler))
        .route(
            "/api/v1/mc/players/by-uuid/{uuid}",
            get(mc_player_by_uuid_handler),
        )
        .route("/api/v1/mc/textures/{hash}", get(mc_texture_handler))
        .route(
            "/api/v1/webhooks/github/{guild_id}",
            post(super::webhooks::github_webhook),
        )
        .route(
            "/api/v1/mc/lots/schematics",
            get(super::mc_lot::list_schematics),
        )
        .route("/api/v1/mc/lots/vacant", get(super::mc_lot::list_vacant))
        .route(
            "/api/v1/mc/lots/viewport",
            get(super::mc_lot::list_viewport),
        )
        .route(
            "/api/v1/mc/lots/me/active",
            get(super::mc_lot::list_my_active),
        )
        .route(
            "/api/v1/mc/lots/me/transitional",
            get(super::mc_lot::list_my_transitional),
        )
        .route(
            "/api/v1/mc/lots/me/purchase",
            post(super::mc_lot::me_purchase),
        )
        .route(
            "/api/v1/mc/lots/me/queue-build",
            post(super::mc_lot::me_queue_build),
        )
        .route(
            "/api/v1/mc/lots/me/queue-demolish",
            post(super::mc_lot::me_queue_demolish),
        )
        .route(
            "/api/v1/mc/lots/staff/failed",
            get(super::mc_lot::staff_list_failed),
        )
        .route(
            "/api/v1/mc/lots/staff/retry",
            post(super::mc_lot::staff_retry),
        )
        .route(
            "/api/v1/mc/lots/staff/release-user",
            post(super::mc_lot::staff_release_user),
        )
        .route(
            "/api/v1/mc/lots/staff/repair-orphan",
            post(super::mc_lot::staff_repair_orphan),
        )
        .route(
            "/api/v1/mc/lots/staff/{lot_id}",
            get(super::mc_lot::staff_get_lot),
        )
        .route(
            "/api/v1/mc/lots/service/claim",
            post(super::mc_lot::service_claim),
        )
        .route(
            "/api/v1/mc/lots/service/mark-applied",
            post(super::mc_lot::service_mark_applied),
        )
        .route(
            "/api/v1/mc/lots/service/mark-failed",
            post(super::mc_lot::service_mark_failed),
        )
        .route(
            "/api/v1/mc/lots/service/requeue-stale",
            post(super::mc_lot::service_requeue_stale),
        )
        .route(
            "/api/v1/rcon/{game}/{server}/exec",
            post(crate::rcon::exec_handler),
        )
        .route("/@{username}", get(profile_handler))
        .route("/osrs/{item}", get(osrs_item_handler))
        .route("/osrs/{item}/", get(osrs_item_handler_trailing))
        .route("/forum", get(|| async { Redirect::permanent("/forum/") }))
        .route(
            "/community",
            get(|| async { Redirect::permanent("/forum/") }),
        )
        .route(
            "/community/",
            get(|| async { Redirect::permanent("/forum/") }),
        )
        .route("/c", get(|| async { Redirect::permanent("/forum/") }))
        .route("/c/", get(|| async { Redirect::permanent("/forum/") }))
        .route("/forum/", get(forum_feed_handler))
        .route("/forum/compose", get(forum_compose_handler))
        .route(
            "/forum/compose/",
            get(|| async { Redirect::permanent("/forum/compose") }),
        )
        .route("/forum/s/{slug}", get(forum_space_handler))
        .route(
            "/forum/s/{slug}/",
            get(|Path(slug): Path<String>| async move {
                Redirect::permanent(&format!("/forum/s/{}", slug))
            }),
        )
        .route("/forum/tag/{slug}", get(forum_tag_handler))
        .route(
            "/forum/tag/{slug}/",
            get(|Path(slug): Path<String>| async move {
                Redirect::permanent(&format!("/forum/tag/{}", slug))
            }),
        )
        .route("/forum/tags", get(forum_tags_index_handler))
        .route(
            "/forum/tags/",
            get(|| async { Redirect::permanent("/forum/tags") }),
        )
        .route("/forum/t/{slug_or_id}", get(forum_thread_handler))
        .route(
            "/forum/t/{slug_or_id}/",
            get(|Path(slug): Path<String>| async move {
                Redirect::permanent(&format!("/forum/t/{}", slug))
            }),
        )
        .route("/api/v1/forum/threads", post(api_create_thread))
        .route(
            "/api/v1/forum/t/{slug_or_id}/comments",
            post(api_create_comment),
        )
        .route(
            "/api/v1/forum/c/{comment_id}",
            axum::routing::patch(api_edit_comment).delete(api_remove_comment),
        )
        .route(
            "/api/v1/forum/c/{comment_id}/moderate",
            axum::routing::patch(api_staff_edit_comment),
        )
        .route("/api/v1/me", get(api_me))
        .route("/api/v1/me/staff", get(api_me_staff))
        .route("/api/v1/forum/spaces", get(api_list_spaces))
        .route("/api/v1/forum/tags", get(api_list_tags))
        .route("/api/v1/wallet/me/balance", get(super::wallet::me_balance))
        .route("/api/v1/wallet/me/coupons", get(super::wallet::me_coupons))
        .route("/api/v1/wallet/me/ledger", get(super::ledger::me_ledger))
        .route(
            "/api/v1/wallet/me/redeem-coupon",
            post(super::wallet::me_redeem_coupon),
        )
        .route(
            "/api/v1/referral/{handle}",
            get(super::referral::redirect_default),
        )
        .route(
            "/api/v1/referral/{handle}/{slug}",
            get(super::referral::redirect_slug),
        )
        .route("/referral/{handle}", get(super::referral::redirect_default))
        .route(
            "/referral/{handle}/",
            get(super::referral::redirect_default),
        )
        .route(
            "/referral/{handle}/{slug}",
            get(super::referral::redirect_slug),
        )
        .route(
            "/referral/{handle}/{slug}/",
            get(super::referral::redirect_slug),
        )
        .route(
            "/api/v1/referral/{handle}/",
            get(super::referral::redirect_default),
        )
        .route(
            "/api/v1/referral/{handle}/{slug}/",
            get(super::referral::redirect_slug),
        )
        .route(
            "/api/v1/referral/me/targets",
            get(super::referral::me_list_targets),
        )
        .route("/api/v1/referral/me/stats", get(super::referral::me_stats))
        .route(
            "/api/v1/referral/me/targets/{slug}/enable",
            post(super::referral::me_enable_target),
        )
        .route(
            "/api/v1/referral/me/targets/{slug}/disable",
            post(super::referral::me_disable_target),
        )
        .route(
            "/api/v1/referral/me/targets/{slug}/set-default",
            post(super::referral::me_set_default),
        )
        .route("/api/v1/yuki/chat", get(super::yuki::chat_handler))
        .route(
            "/api/v1/wallet/service/balance/{user_id}",
            get(super::wallet::service_balance),
        )
        .route(
            "/api/v1/wallet/service/credit",
            post(super::wallet::service_credit),
        )
        .route(
            "/api/v1/wallet/service/credit-user",
            post(super::wallet::service_credit_user),
        )
        .route(
            "/api/v1/wallet/service/debit",
            post(super::wallet::service_debit),
        )
        .route(
            "/api/v1/wallet/service/transfer",
            post(super::wallet::service_transfer),
        )
        .route(
            "/api/v1/wallet/service/redeem-coupon",
            post(super::wallet::service_redeem_coupon),
        )
        .route(
            "/api/v1/wallet/service/revoke-coupon",
            post(super::wallet::service_revoke_coupon),
        )
        .route(
            "/api/v1/wallet/service/verify-balance/{account_id}",
            get(super::wallet::service_verify_balance),
        )
        .route(
            "/api/v1/market/listings",
            get(super::market::list_active).post(super::market::create_listing),
        )
        .route(
            "/api/v1/market/listings/{listing_id}",
            get(super::market::listing_detail),
        )
        .route(
            "/api/v1/market/listings/{listing_id}/bid",
            post(super::market::place_bid),
        )
        .route(
            "/api/v1/market/listings/{listing_id}/buy-now",
            post(super::market::buy_now),
        )
        .route(
            "/api/v1/market/listings/{listing_id}/cancel",
            post(super::market::cancel_listing),
        )
        .route(
            "/api/v1/market/me/listings",
            get(super::market::me_listings),
        )
        .route("/api/v1/market/me/bids", get(super::market::me_bids))
        .route("/forum/c/", get(forum_c_root_redirect))
        .route("/forum/c/{slug}", get(forum_c_redirect))
        .route("/forum/c/{slug}/", get(forum_c_redirect));

    let public_router = mount_permanent_redirects(public_router, PERMANENT_REDIRECTS);
    let public_router = mount_permanent_redirects(
        public_router,
        crate::transport::osrs_family_redirects::OSRS_FAMILY_REDIRECTS,
    )
    .with_state(state.clone());

    let main_app = static_router.merge(public_router).layer(middleware);

    let mut bypass_router = Router::new();
    if let Some(mcp_svc) = crate::mcp::build_service() {
        bypass_router = bypass_router
            .route_service("/api/mcp", mcp_svc.clone())
            .route_service("/api/mcp/", mcp_svc);
    }
    let bypass_router = bypass_router
        .route(
            "/dashboard/grafana/proxy/{*path}",
            any(super::proxy::grafana_proxy_handler),
        )
        .route(
            "/dashboard/grafana/proxy",
            any(super::proxy::grafana_proxy_handler),
        )
        .route(
            "/dashboard/argo/proxy/{*path}",
            any(super::proxy::argo_proxy_handler),
        )
        .route(
            "/dashboard/argo/proxy",
            any(super::proxy::argo_proxy_handler),
        )
        .route(
            "/dashboard/clickhouse/proxy/{*path}",
            any(super::proxy::clickhouse_logs_proxy_handler),
        )
        .route(
            "/dashboard/clickhouse/proxy",
            any(super::proxy::clickhouse_logs_proxy_handler),
        )
        .route(
            "/dashboard/forgejo/proxy/{*path}",
            any(super::proxy::forgejo_proxy_handler),
        )
        .route(
            "/dashboard/forgejo/proxy",
            any(super::proxy::forgejo_proxy_handler),
        )
        .merge(super::forgejo_api::routes())
        .route(
            "/dashboard/vm/proxy/{*path}",
            any(super::proxy::kubevirt_proxy_handler),
        )
        .route(
            "/dashboard/vm/proxy",
            any(super::proxy::kubevirt_proxy_handler),
        )
        .route(
            "/dashboard/vm/vnc/{name}",
            axum::routing::get(super::proxy::kubevirt_vnc_handler),
        )
        .route(
            "/dashboard/vm/vnc-info/{name}",
            axum::routing::get(super::proxy::kubevirt_vnc_info_handler),
        )
        .route(
            "/dashboard/vm/vnc-control/{name}",
            axum::routing::post(super::proxy::kubevirt_vnc_control_handler),
        )
        .route(
            "/dashboard/vm/vnc-sessions",
            axum::routing::get(super::proxy::kubevirt_vnc_sessions_handler),
        )
        .route(
            "/dashboard/firecracker/proxy/{*path}",
            any(super::proxy::firecracker_proxy_handler),
        )
        .route(
            "/dashboard/firecracker/proxy",
            any(super::proxy::firecracker_proxy_handler),
        )
        .route(
            "/dashboard/workflows/proxy/{*path}",
            any(super::proxy::windmill_proxy_handler),
        )
        .route(
            "/dashboard/workflows/proxy",
            any(super::proxy::windmill_proxy_handler),
        )
        .route(
            "/dashboard/factorio/proxy/{*path}",
            any(super::proxy::factorio_proxy_handler),
        )
        .route(
            "/dashboard/factorio/proxy",
            any(super::proxy::factorio_proxy_handler),
        )
        .route(
            "/dashboard/vibeshine/proxy/{*path}",
            any(super::proxy::vibeshine_proxy_handler),
        )
        .route(
            "/dashboard/vibeshine/proxy",
            any(super::proxy::vibeshine_proxy_handler),
        )
        .route(
            "/api/v1/vibeshine/status",
            axum::routing::get(super::proxy::vibeshine_status_handler),
        )
        .route(
            "/api/v1/vibeshine/webrtc/{*rest}",
            any(super::proxy::vibeshine_webrtc_handler),
        )
        .route(
            "/dashboard/firecracker-net/proxy/{*path}",
            any(super::proxy::firecracker_net_proxy_handler),
        )
        .route(
            "/dashboard/firecracker-net/proxy",
            any(super::proxy::firecracker_net_proxy_handler),
        )
        .route(
            "/dashboard/firecracker/deployments",
            axum::routing::get(super::proxy::firecracker_deployments_handler),
        )
        .route(
            "/dashboard/firecracker/stats",
            axum::routing::get(super::proxy::firecracker_deployment_stats_handler),
        )
        .route(
            "/api/v1/fc/{*rest}",
            any(super::proxy::firecracker_fc_alias_handler),
        )
        .route(
            "/fc/{name}/{*path}",
            any(super::proxy::firecracker_fc_handler),
        )
        .route("/fc/{name}", any(super::proxy::firecracker_fc_handler))
        .route(
            "/fc/public/{*rest}",
            any(super::proxy::firecracker_fc_public_handler),
        )
        .route(
            "/dashboard/kasm/proxy/{*path}",
            any(super::proxy::kasm_proxy_handler),
        )
        .route(
            "/dashboard/kasm/proxy/",
            any(super::proxy::kasm_proxy_handler),
        )
        .route(
            "/dashboard/kasm/proxy",
            any(super::proxy::kasm_proxy_handler),
        )
        .route(
            "/dashboard/kasm/workspaces",
            axum::routing::get(super::proxy::kasm_workspaces_handler),
        )
        .route(
            "/dashboard/kasm/scale/{name}",
            axum::routing::put(super::proxy::kasm_scale_handler),
        )
        .route(
            "/dashboard/kasm/launch",
            axum::routing::get(super::proxy::kasm_launch_handler),
        )
        .route(
            "/dashboard/kasm/launch-url/{name}",
            axum::routing::post(super::proxy::kasm_launch_url_handler),
        )
        .route(
            "/dashboard/guac/proxy/guacamole/websocket-tunnel",
            axum::routing::get(super::proxy::guacamole_ws_handler),
        )
        .route(
            "/dashboard/guac/proxy/{*path}",
            any(super::proxy::guacamole_proxy_handler),
        )
        .route(
            "/dashboard/guac/proxy",
            any(super::proxy::guacamole_proxy_handler),
        )
        .route(
            "/dashboard/edge/proxy/{*path}",
            any(super::proxy::edge_proxy_handler),
        )
        .route(
            "/dashboard/edge/proxy",
            any(super::proxy::edge_proxy_handler),
        )
        .route(
            "/dashboard/chuckrpg/tenants",
            axum::routing::get(super::proxy::chuckrpg_tenants_handler),
        )
        .route(
            "/dashboard/chuckrpg/proxy/{tenant}/{*path}",
            any(super::proxy::chuckrpg_proxy_handler),
        );

    bypass_router.merge(main_app)
}

#[utoipa::path(
    get,
    path = "/health",
    tag = "system",
    responses(
        (status = 200, description = "Service liveness probe", body = HealthResponse)
    ),
)]
pub(crate) async fn health() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        version: crate::version::current(),
    })
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub(crate) struct PgRoleHealthDto {
    pub role: String,
    pub ok: bool,
    pub latency_ms: u64,
    pub last_error: Option<String>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub(crate) struct PgClusterHealthDto {
    pub all_ok: bool,
    pub rw: PgRoleHealthDto,
    pub ro: PgRoleHealthDto,
    pub any: PgRoleHealthDto,
}

#[utoipa::path(
    get,
    path = "/health/pg",
    tag = "system",
    responses(
        (status = 200, description = "Per-role PgCluster liveness", body = PgClusterHealthDto),
        (status = 503, description = "PgCluster not configured"),
    ),
)]
pub(crate) async fn health_pg() -> Response {
    let Some(cluster) = crate::db::get_pg_cluster() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "PgCluster not configured"})),
        )
            .into_response();
    };
    let h = cluster.health().await;
    let to_dto = |r: jedi::state::pg::PgRoleHealth| PgRoleHealthDto {
        role: match r.role {
            jedi::state::pg::PgRole::Rw => "rw",
            jedi::state::pg::PgRole::Ro => "ro",
            jedi::state::pg::PgRole::Any => "any",
        }
        .into(),
        ok: r.ok,
        latency_ms: r.latency.as_millis() as u64,
        last_error: r.last_error,
    };
    Json(PgClusterHealthDto {
        all_ok: h.all_ok(),
        rw: to_dto(h.rw),
        ro: to_dto(h.ro),
        any: to_dto(h.any),
    })
    .into_response()
}

async fn health_html(State(state): State<AppState>) -> impl IntoResponse {
    let uptime = state.inner.start_time.elapsed().as_secs();
    TemplateResponse(HealthTemplate {
        status: "Operational".to_string(),
        version: state.inner.version.to_string(),
        uptime_seconds: uptime,
    })
}

#[utoipa::path(
    get,
    path = "/api/status",
    tag = "system",
    responses(
        (status = 200, description = "Service status with uptime", body = StatusResponse)
    ),
)]
pub(crate) async fn api_status(State(state): State<AppState>) -> impl IntoResponse {
    let uptime = state.inner.start_time.elapsed().as_secs();
    Json(StatusResponse {
        status: "ok",
        version: state.inner.version,
        uptime_seconds: uptime,
    })
}

/// Profile page handler — cache-first with Discord enrichment.
async fn profile_handler(Path(username): Path<String>) -> impl IntoResponse {
    let validated_username = match validate_username(&username) {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("Invalid username format '{}': {}", username, e);
            return (
                StatusCode::BAD_REQUEST,
                TemplateResponse(ProfileNotFoundTemplate {
                    username: username.clone(),
                }),
            )
                .into_response();
        }
    };

    let profile = if let Some(cache) = get_profile_cache() {
        cache
            .get_or_load(&validated_username, |u| async move {
                fetch_enriched_profile(&u).await
            })
            .await
    } else {
        fetch_profile_from_db(&validated_username)
            .await
            .map(std::sync::Arc::new)
    };

    match profile {
        Some(profile) => {
            let forum_block = fetch_forum_profile_block(&profile.user_id).await;
            let response =
                render_profile_template(&validated_username, &profile, forum_block.as_ref());
            (
                [
                    (
                        header::CACHE_CONTROL,
                        "public, max-age=300, stale-while-revalidate=60",
                    ),
                    (header::VARY, "Accept-Encoding"),
                ],
                response,
            )
                .into_response()
        }
        None => {
            tracing::info!("Profile not found for username: {}", validated_username);
            (
                StatusCode::NOT_FOUND,
                [(header::CACHE_CONTROL, "public, max-age=60")],
                TemplateResponse(ProfileNotFoundTemplate {
                    username: validated_username,
                }),
            )
                .into_response()
        }
    }
}

/// Fetch profile from database and run the enrichment pipeline.
/// Caching is the caller's responsibility (typically via `ProfileCache::get_or_load`).
async fn fetch_enriched_profile(username: &str) -> Option<UserProfile> {
    let profile = fetch_profile_from_db(username).await?;

    let enriched = enrich_with_discord(profile).await;
    let enriched = enrich_with_twitch(enriched).await;
    let enriched = enrich_with_rentearth(enriched).await;

    Some(enriched)
}

/// Fetch profile directly from database
async fn fetch_profile_from_db(username: &str) -> Option<UserProfile> {
    let service = get_profile_service()?;

    match service.get_profile_by_username(username).await {
        Ok(Some(profile)) => Some(profile),
        Ok(None) => None,
        Err(e) => {
            tracing::error!("Database error fetching profile: {}", e);
            None
        }
    }
}

/// Enrich profile with Discord API data (guild member info)
async fn enrich_with_discord(mut profile: UserProfile) -> UserProfile {
    let discord_id = match &profile.discord {
        Some(d) => d.id.clone(),
        None => return profile,
    };

    let client = match get_discord_client() {
        Some(c) => c,
        None => return profile,
    };

    match client.get_guild_member(&discord_id).await {
        Ok(Some(member)) => {
            if let Some(ref mut discord) = profile.discord {
                discord.is_guild_member = Some(true);
                discord.guild_nickname = member.nick.clone();

                if member.nick.is_some() {
                    discord.username = member.nick.clone();
                }

                if let Some(avatar_hash) = member.avatar {
                    discord.avatar_url = Some(DiscordClient::guild_avatar_url(
                        client.guild_id(),
                        &discord_id,
                        &avatar_hash,
                    ));
                } else if let Some(ref user) = member.user {
                    if let Some(ref avatar) = user.avatar {
                        discord.avatar_url = Some(DiscordClient::avatar_url(&discord_id, avatar));
                    }
                }

                if discord.username.is_none() {
                    if let Some(ref user) = member.user {
                        discord.username = user.global_name.clone().or(Some(user.username.clone()));
                    }
                }

                discord.joined_at = member.joined_at.clone();
                discord.role_ids = member.roles.clone();
                discord.role_names = get_role_names(&member.roles);
                discord.is_boosting = Some(member.premium_since.is_some());
            }

            tracing::debug!("Enriched Discord profile for user {}", discord_id);
        }
        Ok(None) => {
            if let Some(ref mut discord) = profile.discord {
                discord.is_guild_member = Some(false);
            }
            tracing::debug!("User {} not in Discord guild", discord_id);
        }
        Err(e) => {
            tracing::warn!("Failed to fetch Discord guild member: {}", e);
        }
    }

    profile
}

/// Enrich profile with Twitch API data (live status, updated avatar)
async fn enrich_with_twitch(mut profile: UserProfile) -> UserProfile {
    let twitch_username = match &profile.twitch {
        Some(t) => match &t.username {
            Some(u) => u.clone(),
            None => return profile,
        },
        None => return profile,
    };

    let client = match get_twitch_client() {
        Some(c) => c,
        None => return profile,
    };

    match client.is_user_live(&twitch_username).await {
        Ok(is_live) => {
            if let Some(ref mut twitch) = profile.twitch {
                twitch.is_live = Some(is_live);
                if is_live {
                    tracing::debug!("User {} is live on Twitch", twitch_username);
                }
            }
        }
        Err(e) => {
            tracing::warn!(
                "Failed to check Twitch live status for {}: {}",
                twitch_username,
                e
            );
        }
    }

    match client.get_user_by_login(&twitch_username).await {
        Ok(Some(user)) => {
            if let Some(ref mut twitch) = profile.twitch {
                twitch.avatar_url = Some(user.profile_image_url);
            }
            tracing::debug!("Enriched Twitch profile for user {}", twitch_username);
        }
        Ok(None) => {
            tracing::debug!("Twitch user {} not found", twitch_username);
        }
        Err(e) => {
            tracing::warn!("Failed to fetch Twitch user {}: {}", twitch_username, e);
        }
    }

    profile
}

/// Enrich profile with RentEarth character data
async fn enrich_with_rentearth(mut profile: UserProfile) -> UserProfile {
    let service = match get_rentearth_service() {
        Some(s) => s,
        None => return profile,
    };

    match service
        .get_profile(&profile.user_id, &profile.username)
        .await
    {
        Ok(Some(rentearth)) => {
            let char_count = rentearth.characters.len();
            profile.rentearth = Some(rentearth);
            tracing::debug!(
                "Enriched RentEarth profile for user {} with {} characters",
                profile.username,
                char_count
            );
        }
        Ok(None) => {
            tracing::debug!("No RentEarth characters for user {}", profile.username);
        }
        Err(e) => {
            tracing::warn!(
                "Failed to fetch RentEarth data for {}: {}",
                profile.username,
                e
            );
        }
    }

    profile
}

/// Convert archetype flags to human-readable class name
fn archetype_flags_to_name(flags: i64) -> String {
    match flags {
        1 => "Warrior".to_string(),
        2 => "Mage".to_string(),
        4 => "Rogue".to_string(),
        8 => "Merchant".to_string(),
        16 => "Craftsman".to_string(),
        32 => "Farmer".to_string(),
        64 => "Explorer".to_string(),
        128 => "Healer".to_string(),
        256 => "Ranger".to_string(),
        512 => "Bard".to_string(),
        1024 => "Necromancer".to_string(),
        2048 => "Paladin".to_string(),
        _ if flags > 0 => "Multi-class".to_string(),
        _ => "Adventurer".to_string(),
    }
}

/// Render profile to template response. Forum block is optional —
/// pre-fetched in the handler so post counts and recent activity stay
/// fresh while the rest of the profile sits in the cache.
fn render_profile_template(
    username: &str,
    profile: &UserProfile,
    forum: Option<&ForumProfileBlock>,
) -> TemplateResponse<ProfileTemplate> {
    let (
        discord_username,
        discord_avatar,
        discord_is_guild_member,
        discord_id,
        discord_guild_nickname,
        discord_joined_at,
        discord_is_boosting,
        discord_role_count,
        discord_role_names,
    ) = profile
        .discord
        .as_ref()
        .map(|d| {
            (
                d.username.clone(),
                d.avatar_url.clone(),
                d.is_guild_member,
                Some(d.id.clone()),
                d.guild_nickname.clone(),
                d.joined_at.clone(),
                d.is_boosting,
                d.role_ids.len(),
                d.role_names.clone(),
            )
        })
        .unwrap_or((None, None, None, None, None, None, None, 0, Vec::new()));

    let (github_username, github_avatar) = profile
        .github
        .as_ref()
        .map(|g| (g.username.clone(), g.avatar_url.clone()))
        .unwrap_or((None, None));

    let (twitch_username, twitch_avatar, twitch_is_live) = profile
        .twitch
        .as_ref()
        .map(|t| (t.username.clone(), t.avatar_url.clone(), t.is_live))
        .unwrap_or((None, None, None));

    let (rentearth_characters, rentearth_total_playtime_hours, rentearth_last_activity) = profile
        .rentearth
        .as_ref()
        .map(|r| {
            let characters: Vec<RentEarthCharacterDisplay> = r
                .characters
                .iter()
                .map(|c| {
                    let archetype_name = archetype_flags_to_name(c.archetype_flags);
                    let total_playtime_hours = c.total_playtime_seconds.unwrap_or(0) / 3600;
                    let health_percent = if c.health_max > 0 {
                        ((c.health_current as i64 * 100) / c.health_max as i64).clamp(0, 100) as i32
                    } else {
                        0
                    };

                    RentEarthCharacterDisplay {
                        id: c.id.clone(),
                        slot: c.slot,
                        display_name: c.display_name.clone(),
                        first_name: c.first_name.clone(),
                        level: c.level,
                        archetype_name,
                        current_zone: c.current_zone.clone(),
                        health_current: c.health_current,
                        health_max: c.health_max,
                        health_percent,
                        gold: c.gold,
                        total_playtime_hours,
                        last_login_at: c.last_login_at.clone(),
                    }
                })
                .collect();

            let total_hours = r.total_playtime_seconds.map(|s| s / 3600);
            let last_activity = r.last_activity_at.clone();

            (characters, total_hours, last_activity)
        })
        .unwrap_or((Vec::new(), None, None));

    let username_first_char = username
        .chars()
        .next()
        .map(|c| c.to_uppercase().to_string())
        .unwrap_or_else(|| "?".to_string());

    let profile_description = match (&discord_username, &github_username, &twitch_username) {
        (Some(_), Some(_), _) => {
            format!(
                "{}'s KBVE profile - Connected via Discord and GitHub",
                username
            )
        }
        (Some(_), None, _) => {
            format!("{}'s KBVE profile - Connected via Discord", username)
        }
        (None, Some(_), _) => {
            format!("{}'s KBVE profile - Connected via GitHub", username)
        }
        (None, None, Some(_)) => {
            format!("{}'s KBVE profile - Connected via Twitch", username)
        }
        _ => format!("{}'s member profile on KBVE", username),
    };

    tracing::info!(
        "Profile {} - discord_username: {:?}, discord_is_guild_member: {:?}, twitch_username: {:?}, twitch_is_live: {:?}, github_username: {:?}",
        username,
        discord_username,
        discord_is_guild_member,
        twitch_username,
        twitch_is_live,
        github_username
    );

    let primary_avatar_url = discord_avatar
        .clone()
        .or_else(|| github_avatar.clone())
        .or_else(|| twitch_avatar.clone());

    TemplateResponse(ProfileTemplate {
        username: username.to_string(),
        username_first_char,
        profile_description,
        unsplash_banner_id: "1594671581654-cc7ed83167bb".to_string(),
        bio: None,
        status: None,
        primary_avatar_url,
        discord_username,
        discord_avatar,
        discord_is_guild_member,
        discord_id,
        discord_guild_nickname,
        discord_joined_at,
        discord_is_boosting,
        discord_role_count,
        discord_role_names,
        github_username,
        github_avatar,
        twitch_username,
        twitch_avatar,
        twitch_is_live,
        rentearth_characters,
        rentearth_total_playtime_hours,
        rentearth_last_activity,
        forum_present: forum.is_some(),
        forum_karma: forum.map(|f| f.karma).unwrap_or(0),
        forum_post_count: forum.map(|f| f.post_count).unwrap_or(0),
        forum_comment_count: forum.map(|f| f.comment_count).unwrap_or(0),
        forum_upvotes_received: forum.map(|f| f.upvotes_received).unwrap_or(0),
        forum_trust_level: forum.map(|f| f.trust_level).unwrap_or(0),
        forum_signature: forum.and_then(|f| f.signature.clone()),
        forum_joined_human: forum.map(|f| f.joined_human.clone()).unwrap_or_default(),
        forum_last_active_human: forum.and_then(|f| f.last_active_human.clone()),
        forum_recent_threads_html: forum
            .map(|f| f.recent_threads_html.clone())
            .unwrap_or_default(),
        forum_recent_comments_html: forum
            .map(|f| f.recent_comments_html.clone())
            .unwrap_or_default(),
    })
}

/// Build a JSON response object from a UserProfile
fn build_profile_json(profile: &UserProfile) -> serde_json::Value {
    let mut response = json!({
        "username": profile.username,
        "user_id": profile.user_id,
    });

    if let Some(ref discord) = profile.discord {
        response["discord"] = json!({
            "id": discord.id,
            "username": discord.username,
            "avatar_url": discord.avatar_url,
            "is_guild_member": discord.is_guild_member,
            "guild_nickname": discord.guild_nickname,
            "joined_at": discord.joined_at,
            "role_ids": discord.role_ids,
            "role_names": discord.role_names,
            "is_boosting": discord.is_boosting,
        });
    }

    if let Some(ref github) = profile.github {
        response["github"] = json!({
            "id": github.id,
            "username": github.username,
            "avatar_url": github.avatar_url,
        });
    }

    if let Some(ref twitch) = profile.twitch {
        response["twitch"] = json!({
            "id": twitch.id,
            "username": twitch.username,
            "avatar_url": twitch.avatar_url,
            "is_live": twitch.is_live,
        });
    }

    if let Some(ref rentearth) = profile.rentearth {
        response["rentearth"] = json!(rentearth);
    }

    let mut connected_providers = Vec::new();
    if profile.discord.is_some() {
        connected_providers.push("discord");
    }
    if profile.github.is_some() {
        connected_providers.push("github");
    }
    if profile.twitch.is_some() {
        connected_providers.push("twitch");
    }
    if profile.rentearth.is_some() {
        connected_providers.push("rentearth");
    }
    response["connected_providers"] = json!(connected_providers);

    response["provider_count"] = json!(connected_providers.len());

    response
}

/// Convert item name or query to URL slug format.
/// "Dragon hunter crossbow" -> "dragon-hunter-crossbow"
/// "Dragon_hunter_crossbow" -> "dragon-hunter-crossbow"
fn item_to_slug(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// OSRS item page handler — redirects to static Astro pages.
/// Supports both item names and numeric IDs.
async fn osrs_item_handler(Path(item): Path<String>) -> impl IntoResponse {
    let cache = match get_osrs_cache() {
        Some(c) => c,
        None => {
            let slug = item_to_slug(&item);
            return (
                StatusCode::TEMPORARY_REDIRECT,
                [(header::LOCATION, format!("/osrs/{}/", slug))],
            )
                .into_response();
        }
    };

    let result = if let Ok(id) = item.parse::<u32>() {
        cache.get_by_id(id).await
    } else {
        cache.get_by_name(&item).await
    };

    match result {
        Some(item_with_price) => {
            let slug = item_to_slug(&item_with_price.item.name);
            (
                StatusCode::MOVED_PERMANENTLY,
                [(header::LOCATION, format!("/osrs/{}/", slug))],
            )
                .into_response()
        }
        None => {
            let slug = item_to_slug(&item);
            (
                StatusCode::TEMPORARY_REDIRECT,
                [(header::LOCATION, format!("/osrs/{}/", slug))],
            )
                .into_response()
        }
    }
}

/// OSRS item handler for trailing slash URLs.
/// Supports both item names and numeric IDs, normalizes to canonical lowercase slug.
async fn osrs_item_handler_trailing(Path(item): Path<String>) -> Response<Body> {
    if let Ok(id) = item.parse::<u32>() {
        if let Some(cache) = get_osrs_cache() {
            if let Some(item_with_price) = cache.get_by_id(id).await {
                let slug = item_to_slug(&item_with_price.item.name);
                return Response::builder()
                    .status(StatusCode::MOVED_PERMANENTLY)
                    .header(header::LOCATION, format!("/osrs/{}/", slug))
                    .body(Body::empty())
                    .unwrap();
            }
        }
    }

    let slug = item_to_slug(&item);

    if slug != item {
        return Response::builder()
            .status(StatusCode::MOVED_PERMANENTLY)
            .header(header::LOCATION, format!("/osrs/{}/", slug))
            .body(Body::empty())
            .unwrap();
    }

    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| {
        for candidate in ["templates/dist", "../astro/dist", "astro/dist"] {
            let path = std::path::Path::new(candidate);
            if path.exists() {
                return candidate.to_string();
            }
        }
        "templates/dist".to_string()
    });

    let file_path = format!("{}/osrs/{}/index.html", static_dir, slug);
    let gz_path = format!("{}.gz", file_path);

    if let Ok(content) = tokio::fs::read(&gz_path).await {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_ENCODING, "gzip")
            .header(header::CACHE_CONTROL, "public, max-age=3600")
            .body(Body::from(content))
            .unwrap();
    }

    if let Ok(content) = tokio::fs::read(&file_path).await {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "public, max-age=3600")
            .body(Body::from(content))
            .unwrap();
    }

    let not_found_path = format!("{}/404.html", static_dir);
    let not_found_gz = format!("{}.gz", not_found_path);

    if let Ok(content) = tokio::fs::read(&not_found_gz).await {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_ENCODING, "gzip")
            .body(Body::from(content))
            .unwrap();
    }

    if let Ok(content) = tokio::fs::read(&not_found_path).await {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(content))
            .unwrap();
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("404 Not Found"))
        .unwrap()
}

fn resolve_static_dir() -> String {
    std::env::var("STATIC_DIR").unwrap_or_else(|_| {
        for candidate in ["templates/dist", "../astro/dist", "astro/dist"] {
            if std::path::Path::new(candidate).exists() {
                return candidate.to_string();
            }
        }
        "templates/dist".to_string()
    })
}

async fn serve_astro_error_page(status: StatusCode) -> Response {
    let static_dir = resolve_static_dir();
    let html_path = match status {
        StatusCode::BAD_GATEWAY => format!("{}/502.html", static_dir),
        StatusCode::SERVICE_UNAVAILABLE => format!("{}/503.html", static_dir),
        _ => format!("{}/404.html", static_dir),
    };
    let gz_path = format!("{}.gz", html_path);

    if let Ok(content) = tokio::fs::read(&gz_path).await {
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_ENCODING, "gzip")
            .body(Body::from(content))
            .unwrap_or_else(|_| Response::new(Body::empty()));
    }

    if let Ok(content) = tokio::fs::read(&html_path).await {
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(content))
            .unwrap_or_else(|_| Response::new(Body::empty()));
    }

    let fallback_404 = format!("{}/404.html", static_dir);
    let fallback_404_gz = format!("{}.gz", fallback_404);
    if let Ok(content) = tokio::fs::read(&fallback_404_gz).await {
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_ENCODING, "gzip")
            .body(Body::from(content))
            .unwrap_or_else(|_| Response::new(Body::empty()));
    }
    if let Ok(content) = tokio::fs::read(&fallback_404).await {
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(content))
            .unwrap_or_else(|_| Response::new(Body::empty()));
    }

    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from(status.canonical_reason().unwrap_or("Error")))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

/// OSRS API endpoint — returns item price data as JSON.
/// Supports both numeric IDs and item names. Cache refreshes every 60s.
#[utoipa::path(
    get,
    path = "/api/v1/osrs/{item_id}",
    tag = "osrs",
    params(
        ("item_id" = String, Path, description = "Numeric OSRS item id or kebab-case item name (e.g. `21012` or `dragon-hunter-crossbow`)")
    ),
    responses(
        (status = 200, description = "Current Grand Exchange price snapshot", body = serde_json::Value),
        (status = 404, description = "Item not found"),
        (status = 503, description = "OSRS price service unavailable")
    ),
)]
pub(crate) async fn osrs_api_handler(Path(item_id): Path<String>) -> impl IntoResponse {
    let cache = match get_osrs_cache() {
        Some(c) => c,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "OSRS price service temporarily unavailable"
                })),
            )
                .into_response();
        }
    };

    // Cache still loading its mapping — answer 503 rather than a misleading 404.
    if !osrs_ready() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "OSRS cache is warming up, retry shortly"
            })),
        )
            .into_response();
    }

    let result = if let Ok(id) = item_id.parse::<u32>() {
        cache.get_by_id(id).await
    } else {
        cache.get_by_name(&item_id).await
    };

    match result {
        Some(item_with_price) => {
            let item = &item_with_price.item;
            let price = &item_with_price.price;

            let avg = match (price.high, price.low) {
                (Some(h), Some(l)) => Some((h + l) / 2),
                (Some(h), None) => Some(h),
                (None, Some(l)) => Some(l),
                (None, None) => None,
            };

            (
                StatusCode::OK,
                [(
                    header::CACHE_CONTROL,
                    "public, max-age=30, stale-while-revalidate=30",
                )],
                Json(json!({
                    "id": item.id,
                    "name": item.name,
                    "high": price.high,
                    "low": price.low,
                    "avg": avg,
                    "high_time": price.high_time,
                    "low_time": price.low_time
                })),
            )
                .into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({
                "error": "Item not found",
                "query": item_id
            })),
        )
            .into_response(),
    }
}

/// MC players API endpoint — returns online player list with UUIDs and skin URLs.
/// Data is cached and refreshed every 15s via RCON background task.
#[utoipa::path(
    get,
    path = "/api/v1/mc/players",
    tag = "mc",
    responses(
        (status = 200, description = "Currently-online Minecraft players (UUID + skin URL)", body = serde_json::Value),
        (status = 503, description = "MC player service not configured (RCON env not set)")
    ),
)]
pub(crate) async fn mc_players_handler() -> impl IntoResponse {
    let svc = match get_mc_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "MC player service not configured"
                })),
            )
                .into_response();
        }
    };

    let players = svc.get_players().await;

    (
        StatusCode::OK,
        [(
            header::CACHE_CONTROL,
            "public, max-age=10, stale-while-revalidate=10",
        )],
        Json(json!(players)),
    )
        .into_response()
}

/// MC player skin lookup by UUID — returns skin_url + texture hash for the
/// supplied Mojang UUID. Falls back to a live Mojang sessionserver query
/// when the player isn't currently online in the RCON cache.
#[utoipa::path(
    get,
    path = "/api/v1/mc/players/by-uuid/{uuid}",
    tag = "mc",
    params(
        ("uuid" = String, Path, description = "Mojang UUID (dashed or undashed, 32-36 chars)")
    ),
    responses(
        (status = 200, description = "Skin URL + texture hash for the player", body = serde_json::Value),
        (status = 400, description = "Invalid UUID format"),
        (status = 404, description = "Mojang has no skin for this UUID"),
        (status = 503, description = "MC service not configured")
    ),
)]
pub(crate) async fn mc_player_by_uuid_handler(Path(uuid): Path<String>) -> impl IntoResponse {
    let normalized: String = uuid
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    if normalized.len() != 32 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid UUID format" })),
        )
            .into_response();
    }

    let svc = match get_mc_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": "MC player service not configured" })),
            )
                .into_response();
        }
    };

    let skin_url = match svc.resolve_skin_by_uuid(&normalized).await {
        Some(u) => u,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "No skin for UUID", "uuid": normalized })),
            )
                .into_response();
        }
    };

    let hash = extract_texture_hash(&skin_url);

    (
        StatusCode::OK,
        [(
            header::CACHE_CONTROL,
            "public, max-age=300, stale-while-revalidate=600",
        )],
        Json(json!({
            "uuid": normalized,
            "skin_url": skin_url,
            "hash": hash,
        })),
    )
        .into_response()
}

/// MC texture proxy — fetches skin PNGs from textures.minecraft.net.
/// Hash must be 60-64 hex characters. Responses are immutably cached (24h).
#[utoipa::path(
    get,
    path = "/api/v1/mc/textures/{hash}",
    tag = "mc",
    params(
        ("hash" = String, Path, description = "60-64 character hex texture hash from Mojang")
    ),
    responses(
        (status = 200, description = "PNG skin texture", content_type = "image/png"),
        (status = 400, description = "Invalid hash format"),
        (status = 404, description = "Texture not found upstream"),
        (status = 503, description = "MC service not configured")
    ),
)]
pub(crate) async fn mc_texture_handler(Path(hash): Path<String>) -> impl IntoResponse {
    if hash.len() < 60 || hash.len() > 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return StatusCode::BAD_REQUEST.into_response();
    }

    let svc = match get_mc_service() {
        Some(s) => s,
        None => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };

    match svc.fetch_texture(&hash).await {
        Some(bytes) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "image/png"),
                (header::CACHE_CONTROL, "public, max-age=86400, immutable"),
            ],
            bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Profile API endpoint — returns user profile data as JSON, enriched
/// from Discord / GitHub / Twitch / RentEarth when available.
#[utoipa::path(
    get,
    path = "/api/v1/profile/{username}",
    tag = "profile",
    params(
        ("username" = String, Path, description = "Public username (3-24 chars, alphanumeric + underscore, must start with letter)")
    ),
    responses(
        (status = 200, description = "User profile with provider enrichment", body = UserProfile),
        (status = 400, description = "Invalid username format"),
        (status = 404, description = "Profile not found"),
    ),
)]
pub(crate) async fn profile_api_handler(Path(username): Path<String>) -> impl IntoResponse {
    let validated_username = match validate_username(&username) {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("Invalid username '{}': {}", username, e);
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Invalid username format",
                    "message": e.to_string()
                })),
            )
                .into_response();
        }
    };

    let profile = if let Some(cache) = get_profile_cache() {
        cache
            .get_or_load(&validated_username, |u| async move {
                fetch_enriched_profile(&u).await
            })
            .await
    } else {
        fetch_profile_from_db(&validated_username)
            .await
            .map(std::sync::Arc::new)
    };

    match profile {
        Some(profile) => {
            let response = build_profile_json(&profile);

            (
                StatusCode::OK,
                [
                    (
                        header::CACHE_CONTROL,
                        "public, max-age=60, stale-while-revalidate=30",
                    ),
                    (header::CONTENT_TYPE, "application/json"),
                ],
                Json(response),
            )
                .into_response()
        }
        None => {
            tracing::info!("Profile not found for API request: {}", validated_username);
            (
                StatusCode::NOT_FOUND,
                [(header::CACHE_CONTROL, "public, max-age=30")],
                Json(json!({
                    "error": "Profile not found",
                    "username": validated_username
                })),
            )
                .into_response()
        }
    }
}

/// Authenticated profile endpoint — returns the caller's profile.
/// Requires Bearer token in Authorization header.
#[utoipa::path(
    get,
    path = "/api/v1/profile/me",
    tag = "profile",
    responses(
        (status = 200, description = "Caller's profile (or basic auth info if no profile yet)", body = serde_json::Value),
        (status = 401, description = "Missing / invalid / expired token"),
        (status = 503, description = "Auth or profile service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn profile_me_handler(headers: HeaderMap) -> impl IntoResponse {
    let token = match extract_request_token(&headers) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Missing authentication",
                    "hint": "Include 'Authorization: Bearer <token>' header or 'sb-access-token' cookie"
                })),
            )
                .into_response();
        }
    };
    let token = token.as_str();

    let jwt_cache = match get_jwt_cache() {
        Some(cache) => cache,
        None => {
            tracing::error!("JWT cache not initialized");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "Authentication service unavailable"
                })),
            )
                .into_response();
        }
    };

    let token_info = match jwt_cache.verify_and_cache(token).await {
        Ok(info) => info,
        Err(e) => {
            tracing::warn!(error = %e, "JWT verification failed");
            let (status, message) = match e {
                crate::auth::JwtCacheError::TokenExpired => (
                    StatusCode::UNAUTHORIZED,
                    "Token expired - please re-authenticate",
                ),
                crate::auth::JwtCacheError::SessionNotFound => (
                    StatusCode::UNAUTHORIZED,
                    "Session not found - please re-authenticate",
                ),
                crate::auth::JwtCacheError::InvalidToken(_) => {
                    (StatusCode::UNAUTHORIZED, "Invalid token")
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "Authentication error"),
            };
            return (
                status,
                Json(json!({
                    "error": message
                })),
            )
                .into_response();
        }
    };

    let profile_service = match get_profile_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "Profile service unavailable"
                })),
            )
                .into_response();
        }
    };

    let profile = match profile_service
        .get_profile_by_user_id(&token_info.user_id)
        .await
    {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::OK,
                Json(json!({
                    "user_id": token_info.user_id,
                    "email": token_info.email,
                    "role": token_info.role,
                    "profile_exists": false,
                    "message": "No profile found - please complete profile setup"
                })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(error = %e, user_id = %token_info.user_id, "Failed to fetch profile");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Failed to fetch profile"
                })),
            )
                .into_response();
        }
    };

    let mut response = build_profile_json(&profile);
    response["email"] = json!(token_info.email);
    response["role"] = json!(token_info.role);
    response["profile_exists"] = json!(true);

    (
        StatusCode::OK,
        [
            (header::CACHE_CONTROL, "private, max-age=30"),
            (header::CONTENT_TYPE, "application/json"),
        ],
        Json(response),
    )
        .into_response()
}

/// Set username endpoint — creates username for authenticated user.
/// Validates at axum level, then defers to the proxy_add_username RPC.
#[utoipa::path(
    post,
    path = "/api/v1/profile/username",
    tag = "profile",
    request_body = SetUsernameRequest,
    responses(
        (status = 200, description = "Username set successfully", body = serde_json::Value),
        (status = 400, description = "Invalid username format / body"),
        (status = 401, description = "Missing / invalid / expired token"),
        (status = 409, description = "Username already taken"),
        (status = 503, description = "Auth or profile service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn set_username_handler(
    headers: HeaderMap,
    Json(body): Json<SetUsernameRequest>,
) -> impl IntoResponse {
    let token = match extract_request_token(&headers) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Missing authentication",
                    "hint": "Include 'Authorization: Bearer <token>' header or 'sb-access-token' cookie"
                })),
            )
                .into_response();
        }
    };
    let token = token.as_str();

    let jwt_cache = match get_jwt_cache() {
        Some(cache) => cache,
        None => {
            tracing::error!("JWT cache not initialized");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "Authentication service unavailable"
                })),
            )
                .into_response();
        }
    };

    let token_info = match jwt_cache.verify_and_cache(token).await {
        Ok(info) => info,
        Err(e) => {
            tracing::warn!(error = %e, "JWT verification failed for set_username");
            let (status, message) = match e {
                crate::auth::JwtCacheError::TokenExpired => (
                    StatusCode::UNAUTHORIZED,
                    "Token expired - please re-authenticate",
                ),
                crate::auth::JwtCacheError::SessionNotFound => (
                    StatusCode::UNAUTHORIZED,
                    "Session not found - please re-authenticate",
                ),
                crate::auth::JwtCacheError::InvalidToken(_) => {
                    (StatusCode::UNAUTHORIZED, "Invalid token")
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "Authentication error"),
            };
            return (
                status,
                Json(json!({
                    "error": message
                })),
            )
                .into_response();
        }
    };

    let validated_username = match validate_username(&body.username) {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!(
                user_id = %token_info.user_id,
                username = %body.username,
                error = %e,
                "Username validation failed"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Invalid username",
                    "message": e.to_string()
                })),
            )
                .into_response();
        }
    };

    let profile_service = match get_profile_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "Profile service unavailable"
                })),
            )
                .into_response();
        }
    };

    match profile_service
        .set_username(&token_info.user_id, &validated_username)
        .await
    {
        Ok(canonical_username) => {
            tracing::info!(
                user_id = %token_info.user_id,
                username = %canonical_username,
                "Username successfully set"
            );
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "username": canonical_username,
                    "message": "Username set successfully"
                })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!(
                user_id = %token_info.user_id,
                username = %validated_username,
                error = %e,
                "Failed to set username"
            );

            let status = if e.contains("already taken") || e.contains("already have") {
                StatusCode::CONFLICT
            } else if e.contains("Invalid") {
                StatusCode::BAD_REQUEST
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };

            (
                status,
                Json(json!({
                    "error": e
                })),
            )
                .into_response()
        }
    }
}

#[allow(dead_code)]
fn format_duration(d: Duration) -> String {
    let secs = d.as_secs();
    let hours = secs / 3600;
    let mins = (secs % 3600) / 60;
    let secs = secs % 60;

    if hours > 0 {
        format!("{}h {}m {}s", hours, mins, secs)
    } else if mins > 0 {
        format!("{}m {}s", mins, secs)
    } else {
        format!("{}s", secs)
    }
}

/// Set Cache-Control based on request path.
async fn cache_headers(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;

    let cache_value = if path.starts_with("/_astro/") {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=86400"
    };

    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(cache_value));

    response
}

/// Vite outputs worker files with `.ts` extensions. `mime_guess` maps `.ts` to
/// `video/mp2t`, which browsers reject for Web Workers. Override to JS.
async fn fix_ts_mime(request: Request, next: Next) -> Response {
    let is_ts = request.uri().path().ends_with(".ts");
    let mut response = next.run(request).await;
    if is_ts {
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/javascript; charset=utf-8"),
        );
    }
    response
}

fn tuned_listener(addr: SocketAddr) -> Result<TcpListener> {
    use socket2::{Domain, Protocol, Socket, Type};

    let domain = match addr {
        SocketAddr::V4(_) => Domain::IPV4,
        SocketAddr::V6(_) => Domain::IPV6,
    };
    let socket = Socket::new(domain, Type::STREAM, Some(Protocol::TCP))?;

    socket.set_reuse_address(true)?;
    socket.set_keepalive(true)?;

    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        use socket2::TcpKeepalive;
        let ka = TcpKeepalive::new()
            .with_time(Duration::from_secs(30))
            .with_interval(Duration::from_secs(10));
        let _ = socket.set_tcp_keepalive(&ka);
    }

    socket.bind(&addr.into())?;
    socket.listen(1024)?;

    let std_listener = std::net::TcpListener::from(socket);
    std_listener.set_nonblocking(true)?;
    Ok(TcpListener::from_std(std_listener)?)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

/// Subset of forum data shown on the profile page. Built by
/// `fetch_forum_profile_block`; consumed by `render_profile_template`.
struct ForumProfileBlock {
    karma: i64,
    post_count: i64,
    comment_count: i64,
    upvotes_received: i64,
    trust_level: i16,
    signature: Option<String>,
    joined_human: String,
    last_active_human: Option<String>,
    /// Pre-rendered HTML for the recent threads list.
    recent_threads_html: String,
    /// Pre-rendered HTML for the recent comments list.
    recent_comments_html: String,
}

const FORUM_PROFILE_RECENT_LIMIT: i32 = 5;
const FORUM_PROFILE_COMMENT_EXCERPT: usize = 160;

async fn fetch_forum_profile_block(user_id: &str) -> Option<ForumProfileBlock> {
    let svc = get_forum_service()?;

    let public = match svc.get_public_profile(user_id).await {
        Ok(Some(p)) => p,
        Ok(None) => return None,
        Err(e) => {
            tracing::warn!("forum profile lookup failed for {}: {}", user_id, e);
            return None;
        }
    };

    let threads = svc
        .list_threads_by_author(user_id, FORUM_PROFILE_RECENT_LIMIT)
        .await
        .unwrap_or_else(|e| {
            tracing::warn!("forum recent threads lookup failed: {}", e);
            Vec::new()
        });
    let comments = svc
        .list_comments_by_author(user_id, FORUM_PROFILE_RECENT_LIMIT)
        .await
        .unwrap_or_else(|e| {
            tracing::warn!("forum recent comments lookup failed: {}", e);
            Vec::new()
        });

    let space_ids: Vec<String> = threads.iter().map(|t| t.space_id.clone()).collect();
    let spaces_by_id = svc.get_spaces_by_ids(&space_ids).await.unwrap_or_default();

    let mut recent_threads_html = String::with_capacity(threads.len() * 256);
    for t in &threads {
        let space_slug = spaces_by_id
            .get(&t.space_id)
            .map(|s| s.slug.clone())
            .unwrap_or_else(|| t.space_id.clone());
        let thread_slug_or_id = t.slug.clone().unwrap_or_else(|| t.id.clone());
        let partial = ProfileForumThreadRowPartial {
            thread_slug_or_id,
            title: t.title.clone(),
            space_slug,
            created_at_human: humanize_ts(&t.created_at),
            score: t.score,
            comment_count: t.comment_count,
            pinned: t.pinned,
        };
        recent_threads_html.push_str(&render_partial(&partial, "profile/_forum_thread_row"));
    }

    let mut recent_comments_html = String::with_capacity(comments.len() * 256);
    let ctx = forum_render_ctx();
    for c in &comments {
        let rendered = kbve::markdown::render(&c.body, &ctx);
        let excerpt = plain_excerpt(&rendered.html, FORUM_PROFILE_COMMENT_EXCERPT);
        let partial = ProfileForumCommentRowPartial {
            id: c.id.clone(),
            thread_id: c.thread_id.clone(),
            excerpt,
            created_at_human: humanize_ts(&c.created_at),
            score: c.score,
        };
        recent_comments_html.push_str(&render_partial(&partial, "profile/_forum_comment_row"));
    }

    Some(ForumProfileBlock {
        karma: public.karma,
        post_count: public.post_count,
        comment_count: public.comment_count,
        upvotes_received: public.upvotes_received,
        trust_level: public.trust_level,
        signature: public.signature,
        joined_human: humanize_ts(&public.joined_forum_at),
        last_active_human: public.last_active_at.as_deref().map(humanize_ts),
        recent_threads_html,
        recent_comments_html,
    })
}

/// Image-host allowlist for thread + comment markdown rendering. Empty
/// by default; populate once avatars / Supabase storage are wired.
const FORUM_IMG_HOSTS: &[&str] = &[];

const FEED_BODY_EXCERPT_CHARS: usize = 280;
const META_DESCRIPTION_CHARS: usize = 200;

fn forum_render_ctx() -> kbve::markdown::RenderCtx<'static> {
    kbve::markdown::RenderCtx {
        allowed_image_hosts: FORUM_IMG_HOSTS,
        extract_mentions: true,
        extract_hashtags: true,
    }
}

/// Percent-encode for `application/x-www-form-urlencoded` query-component
/// values (RFC 3986). Needed for cursor pagination: the cursor format
/// `<timestamp+offset>|<id>` carries `+` and `|` which the browser +
/// axum::extract::Query mangle if dumped raw into an `<a href>`.
fn url_encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", byte));
            }
        }
    }
    out
}

/// HTML-escape for plain text going into hand-rolled HTML fragments.
/// Askama templates auto-escape via the `e` filter; this helper covers
/// the few spots we build HTML strings directly.
fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Sentinel shown when an author UUID has no matching `profile.username`
/// row. Under the username-required RPC gate this only surfaces for
/// pre-gate posts or rows where the user has been deleted.
const FORUM_DELETED_USER: &str = "deleted-user";

fn resolve_username(map: &std::collections::HashMap<String, String>, uuid: &str) -> String {
    map.get(uuid)
        .cloned()
        .unwrap_or_else(|| FORUM_DELETED_USER.to_string())
}

/// Truncate rendered markdown to a feed excerpt. Char-count truncation
/// is safe here because ammonia already balanced the tags.
fn excerpt_html(rendered: &str, limit: usize) -> String {
    if rendered.chars().count() <= limit {
        return rendered.to_string();
    }
    let cut: String = rendered.chars().take(limit).collect();
    format!("{cut}…")
}

/// Strip HTML tags + collapse whitespace into a plain text meta description.
fn plain_excerpt(html: &str, limit: usize) -> String {
    let mut out = String::with_capacity(html.len().min(limit + 16));
    let mut in_tag = false;
    let mut last_was_space = true;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            c if c.is_whitespace() => {
                if !last_was_space {
                    out.push(' ');
                    last_was_space = true;
                }
            }
            c => {
                out.push(c);
                last_was_space = false;
            }
        }
        if out.chars().count() >= limit {
            break;
        }
    }
    out.trim().to_string()
}

fn render_partial<T: Template>(tpl: &T, name: &str) -> String {
    match tpl.render() {
        Ok(html) => html,
        Err(err) => {
            tracing::error!("forum partial '{}' render failed: {}", name, err);
            String::new()
        }
    }
}

fn humanize_ts(ts: &str) -> String {
    ts.split('.')
        .next()
        .unwrap_or(ts)
        .replace('T', " ")
        .replace('Z', "")
}

fn humanize_opt(ts: Option<&str>) -> String {
    ts.map(humanize_ts).unwrap_or_default()
}

fn sort_label(sort: &str) -> &'static str {
    match sort {
        "new" => "New",
        "top" => "Top",
        "bump" => "Bump",
        _ => "Hot",
    }
}

fn build_feed_items_html(
    rows: &[FeedRow],
    spaces_by_id: &std::collections::HashMap<String, SpaceRow>,
    usernames_by_id: &std::collections::HashMap<String, String>,
) -> String {
    let mut out = String::with_capacity(rows.len() * 512);
    let ctx = forum_render_ctx();
    for row in rows {
        let rendered = kbve::markdown::render(&row.body, &ctx);
        let body_excerpt_html = excerpt_html(&rendered.html, FEED_BODY_EXCERPT_CHARS);
        let (space_slug, space_name) = match spaces_by_id.get(&row.space_id) {
            Some(s) => (s.slug.clone(), s.name.clone()),
            None => (row.space_id.clone(), row.space_id.clone()),
        };
        let thread_slug_or_id = row.slug.clone().unwrap_or_else(|| row.id.clone());
        let partial = ForumFeedItemPartial {
            thread_slug_or_id,
            title: row.title.clone(),
            space_slug,
            space_name,
            author_username: resolve_username(usernames_by_id, &row.author_id),
            created_at_human: humanize_ts(&row.created_at),
            score: row.score,
            comment_count: row.comment_count,
            pinned: row.pinned,
            body_excerpt_html,
        };
        out.push_str(&render_partial(&partial, "forum/feed/_item"));
    }
    out
}

fn build_comments_html(
    rows: &[CommentRow],
    usernames_by_id: &std::collections::HashMap<String, String>,
) -> String {
    let mut out = String::with_capacity(rows.len() * 512);
    let ctx = forum_render_ctx();
    for row in rows {
        let rendered = kbve::markdown::render(&row.body, &ctx);
        let partial = ForumCommentPartial {
            id: row.id.clone(),
            depth: row.depth,
            author_id: row.author_id.clone(),
            author_username: resolve_username(usernames_by_id, &row.author_id),
            created_at_human: humanize_ts(&row.created_at),
            score: row.score,
            body_raw: row.body.clone(),
            body_html: rendered.html,
        };
        out.push_str(&render_partial(&partial, "forum/thread/_comment"));
    }
    out
}

fn build_pagination_html(rows: &[FeedRow], sort: &str, space_path: &str) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let last = match rows.last() {
        Some(r) => r,
        None => return String::new(),
    };
    let key = match sort {
        "new" => last.created_at.clone(),
        "bump" => last.last_activity_at.clone().unwrap_or_default(),
        "top" => last.score.to_string(),
        _ => return String::new(), // hot cursor needs hot_rank — skip
    };
    let cursor = format!("{}|{}", key, last.id);
    // `+`, `|`, `:` must be percent-encoded — html_escape only covers
    // `&<>"'`, and unescaped `+` is decoded as space by axum::extract::Query.
    format!(
        r#"<a class="forum-pagination__next" href="{base}?sort={sort}&amp;cursor={cursor}">Older →</a>"#,
        base = html_escape(space_path),
        sort = url_encode_component(sort),
        cursor = url_encode_component(&cursor),
    )
}

/// Static fallback used when the `forum.spaces` PostgREST query is
/// unreachable. Mirrors the seeded space list so /forum/ never 500s
/// from a transient DB hiccup.
const FALLBACK_SPACES: &[(&str, &str)] =
    &[("announcements", "Announcements"), ("support", "Support")];

async fn build_spaces_nav_html(current_slug: Option<&str>) -> String {
    let current = current_slug.unwrap_or("");
    let mut out = String::with_capacity(256);

    let render_link = |out: &mut String, slug: &str, label: &str| {
        let href = if slug.is_empty() {
            "/forum/".to_string()
        } else {
            format!("/forum/s/{}/", slug)
        };
        let is_active = slug == current;
        let class = if is_active {
            r#" class="forum-spaces__link forum-spaces__link--active""#
        } else {
            r#" class="forum-spaces__link""#
        };
        let aria = if is_active {
            r#" aria-current="page""#
        } else {
            ""
        };
        out.push_str(&format!(
            r#"<a href="{}"{}{}>{}</a>"#,
            href,
            class,
            aria,
            html_escape(label),
        ));
    };

    render_link(&mut out, "", "All");

    let live_spaces = match get_forum_service() {
        Some(svc) => svc.list_spaces().await.map_err(|e| {
            tracing::warn!("forum: list_spaces failed, using fallback nav: {}", e);
            e
        }),
        None => Err("forum service unavailable".to_string()),
    };

    match live_spaces {
        Ok(rows) if !rows.is_empty() => {
            for row in &rows {
                render_link(&mut out, &row.slug, &row.name);
            }
        }
        _ => {
            for (slug, label) in FALLBACK_SPACES {
                render_link(&mut out, slug, label);
            }
        }
    }

    out
}

async fn forum_feed_handler(
    axum::extract::Query(q): axum::extract::Query<FeedSortQuery>,
) -> Response {
    render_feed_page(None, None, &q).await
}

async fn forum_space_handler(
    Path(slug): Path<String>,
    axum::extract::Query(q): axum::extract::Query<FeedSortQuery>,
) -> Response {
    render_feed_page(Some(slug), None, &q).await
}

async fn forum_tag_handler(
    Path(slug): Path<String>,
    axum::extract::Query(q): axum::extract::Query<FeedSortQuery>,
) -> Response {
    render_feed_page(None, Some(slug), &q).await
}

/// GET /api/v1/forum/tags — JSON list of popularity-sorted tags.
/// Drives the astro-kbve build-time top-tags fetch.
#[utoipa::path(
    get,
    path = "/api/v1/forum/tags",
    tag = "forum",
    responses(
        (status = 200, description = "Popularity-sorted tag list", body = serde_json::Value),
        (status = 502, description = "Upstream forum DB error"),
        (status = 503, description = "Forum service not configured"),
    ),
)]
pub(crate) async fn api_list_tags() -> Response {
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "forum service unavailable"})),
            )
                .into_response();
        }
    };

    let result = if let Some(cache) = crate::db::get_kv_cache() {
        cache
            .get_or_fetch_json_tagged(
                "forum:tags:limit=200",
                None,
                || async {
                    svc.list_tags(200)
                        .await
                        .map_err(|e| jedi::entity::error::JediError::Database(e.into()))
                },
                |_: &Vec<crate::db::TagRow>| vec!["forum:tags".to_string()],
            )
            .await
            .map_err(|e| e.to_string())
    } else {
        svc.list_tags(200).await
    };

    match result {
        Ok(rows) => (
            StatusCode::OK,
            [(header::CACHE_CONTROL, "public, max-age=300")],
            Json(json!({ "tags": rows })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("forum.list_tags api failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "upstream error"})),
            )
                .into_response()
        }
    }
}

/// GET /api/v1/forum/spaces — JSON list of active spaces.
/// Drives the astro-kbve build-time spaces.json artifact.
#[utoipa::path(
    get,
    path = "/api/v1/forum/spaces",
    tag = "forum",
    responses(
        (status = 200, description = "Active forum spaces", body = serde_json::Value),
        (status = 502, description = "Upstream forum DB error"),
        (status = 503, description = "Forum service not configured"),
    ),
)]
pub(crate) async fn api_list_spaces() -> Response {
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "forum service unavailable"})),
            )
                .into_response();
        }
    };

    let result = if let Some(cache) = crate::db::get_kv_cache() {
        cache
            .get_or_fetch_json_tagged(
                "forum:spaces",
                None,
                || async {
                    svc.list_spaces()
                        .await
                        .map_err(|e| jedi::entity::error::JediError::Database(e.into()))
                },
                |_: &Vec<crate::db::SpaceRow>| vec!["forum:spaces".to_string()],
            )
            .await
            .map_err(|e| e.to_string())
    } else {
        svc.list_spaces().await
    };

    match result {
        Ok(rows) => (
            StatusCode::OK,
            [(header::CACHE_CONTROL, "public, max-age=300")],
            Json(json!({ "spaces": rows })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("forum.list_spaces api failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "upstream error"})),
            )
                .into_response()
        }
    }
}

async fn forum_tags_index_handler() -> Response {
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (StatusCode::SERVICE_UNAVAILABLE, "forum service unavailable").into_response();
        }
    };

    let rows = match svc.list_tags(200).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("forum: list_tags failed: {}", e);
            return (StatusCode::BAD_GATEWAY, "forum upstream error").into_response();
        }
    };

    let tags_html = build_tag_cards_html(&rows);
    let tag_count = rows.len();

    TemplateResponse(ForumTagsIndexTemplate {
        tags_html,
        tag_count,
    })
    .into_response()
}

fn build_tag_cards_html(rows: &[crate::db::TagRow]) -> String {
    if rows.is_empty() {
        return r#"<p class="forum-tag-card__empty">No tags yet — use <code>#hashtag</code> in a thread to create one.</p>"#.to_string();
    }
    let mut out = String::with_capacity(rows.len() * 96);
    for row in rows {
        out.push_str(&format!(
            r#"<a class="forum-tag-card" href="/forum/tag/{slug}/"><span class="forum-tag-card__slug">#{name}</span><span class="forum-tag-card__count">{count}</span></a>"#,
            slug = row.slug,
            name = html_escape(&row.name),
            count = row.thread_count,
        ));
    }
    out
}

#[derive(serde::Deserialize, Default)]
struct FeedSortQuery {
    sort: Option<String>,
    cursor: Option<String>,
}

async fn render_feed_page(
    space_slug: Option<String>,
    tag_slug: Option<String>,
    q: &FeedSortQuery,
) -> Response {
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (StatusCode::SERVICE_UNAVAILABLE, "forum service unavailable").into_response();
        }
    };

    let space = match space_slug.as_deref() {
        Some(slug) => match svc.get_space_by_slug(slug).await {
            Ok(Some(space)) => Some(space),
            Ok(None) => {
                return (
                    StatusCode::NOT_FOUND,
                    [(header::CACHE_CONTROL, "public, max-age=60")],
                    TemplateResponse(ForumSpaceNotFoundTemplate {
                        space_slug: slug.to_string(),
                    }),
                )
                    .into_response();
            }
            Err(e) => {
                tracing::error!("forum: get_space_by_slug({}) failed: {}", slug, e);
                return (StatusCode::BAD_GATEWAY, "forum upstream error").into_response();
            }
        },
        None => None,
    };

    let tag = match tag_slug.as_deref() {
        Some(slug) => match svc.get_tag_by_slug(slug).await {
            Ok(Some(t)) => Some(t),
            Ok(None) => {
                return (StatusCode::NOT_FOUND, format!("tag '{}' not found", slug))
                    .into_response();
            }
            Err(e) => {
                tracing::error!("forum: get_tag_by_slug({}) failed: {}", slug, e);
                return (StatusCode::BAD_GATEWAY, "forum upstream error").into_response();
            }
        },
        None => None,
    };

    let sort = q
        .sort
        .as_deref()
        .filter(|s| matches!(*s, "hot" | "new" | "top" | "bump"))
        .unwrap_or("hot")
        .to_string();
    let cursor = q.cursor.as_deref();
    let space_id_owned = space.as_ref().map(|s| s.id.clone());

    let query = FeedQuery {
        space_id: space_id_owned.as_deref(),
        tag_id: tag.as_ref().map(|t| t.id),
        sort: &sort,
        cursor,
        limit: 25,
        ..FeedQuery::default()
    };

    let rows = match svc.fetch_feed(&query).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("forum: fetch_feed failed: {}", e);
            return (StatusCode::BAD_GATEWAY, "forum upstream error").into_response();
        }
    };

    let mut spaces_by_id = std::collections::HashMap::new();
    if let Some(s) = space.as_ref() {
        spaces_by_id.insert(s.id.clone(), s.clone());
    } else {
        let space_ids: Vec<String> = rows.iter().map(|r| r.space_id.clone()).collect();
        spaces_by_id = svc.get_spaces_by_ids(&space_ids).await.unwrap_or_else(|e| {
            tracing::warn!("forum feed: spaces batch failed: {}", e);
            std::collections::HashMap::new()
        });
    }

    let usernames_by_id = match get_profile_service() {
        Some(profile_svc) => {
            let ids: Vec<String> = rows.iter().map(|r| r.author_id.clone()).collect();
            profile_svc
                .get_usernames_by_ids(&ids)
                .await
                .unwrap_or_else(|e| {
                    tracing::warn!("forum feed: username batch failed: {}", e);
                    std::collections::HashMap::new()
                })
        }
        None => std::collections::HashMap::new(),
    };

    let feed_items_html = build_feed_items_html(&rows, &spaces_by_id, &usernames_by_id);

    let feed_base_path = match (space.as_ref(), tag.as_ref()) {
        (Some(s), _) => format!("/forum/s/{}", s.slug),
        (_, Some(t)) => format!("/forum/tag/{}", t.slug),
        _ => "/forum/".to_string(),
    };
    let pagination_html = build_pagination_html(&rows, &sort, &feed_base_path);

    let (heading, og_title, canonical_suffix) = match (space.as_ref(), tag.as_ref()) {
        (Some(s), _) => (
            s.name.clone(),
            format!("{} — KBVE Forum", s.name),
            format!("s/{}", s.slug),
        ),
        (_, Some(t)) => (
            format!("#{}", t.slug),
            format!("#{} — KBVE Forum", t.slug),
            format!("tag/{}", t.slug),
        ),
        _ => (
            "KBVE Forum".to_string(),
            "KBVE Forum — Hot threads".to_string(),
            String::new(),
        ),
    };

    let meta_description = match (space.as_ref(), tag.as_ref()) {
        (Some(s), _) => s
            .description
            .clone()
            .unwrap_or_else(|| format!("{} discussions on KBVE.", s.name)),
        (_, Some(t)) => t
            .description
            .clone()
            .unwrap_or_else(|| format!("Threads tagged #{} on KBVE.", t.slug)),
        _ => "Discuss, trade, and play across KBVE communities.".to_string(),
    };

    TemplateResponse(ForumFeedTemplate {
        feed_heading: heading,
        feed_og_title: og_title,
        feed_meta_description: meta_description,
        feed_canonical_suffix: canonical_suffix,
        active_sort_label: sort_label(&sort).to_string(),
        feed_items_html,
        spaces_nav_html: build_spaces_nav_html(space_slug.as_deref()).await,
        pagination_html,
    })
    .into_response()
}

/// GET /forum/c/{slug} — permanent redirect to /forum/s/{slug}.
async fn forum_c_redirect(Path(slug): Path<String>) -> Redirect {
    Redirect::permanent(&format!("/forum/s/{}", slug))
}

/// GET /forum/c/ — permanent redirect to /forum/.
async fn forum_c_root_redirect() -> Redirect {
    Redirect::permanent("/forum/")
}

/// GET /forum/t/{slug_or_id}
async fn forum_thread_handler(Path(slug_or_id): Path<String>) -> Response {
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (StatusCode::SERVICE_UNAVAILABLE, "forum service unavailable").into_response();
        }
    };

    let pair: Option<(ThreadRow, SpaceRow)> =
        match svc.get_thread_by_slug_or_id(None, &slug_or_id).await {
            Ok(p) => p,
            Err(e) => {
                tracing::error!(
                    "forum: get_thread_by_slug_or_id({}) failed: {}",
                    slug_or_id,
                    e
                );
                return serve_astro_error_page(StatusCode::BAD_GATEWAY).await;
            }
        };

    let (thread, space) = match pair {
        Some(p) => p,
        None => {
            return serve_astro_error_page(StatusCode::NOT_FOUND).await;
        }
    };

    let comments = match svc.get_comments_for_thread(&thread.id).await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(
                "forum: get_comments_for_thread({}) failed: {}",
                thread.id,
                e
            );
            Vec::new()
        }
    };

    let ctx = forum_render_ctx();
    let body_rendered = kbve::markdown::render(&thread.body, &ctx);

    let usernames_by_id = match get_profile_service() {
        Some(profile_svc) => {
            let mut ids: Vec<String> = Vec::with_capacity(comments.len() + 1);
            ids.push(thread.author_id.clone());
            for c in &comments {
                ids.push(c.author_id.clone());
            }
            profile_svc
                .get_usernames_by_ids(&ids)
                .await
                .unwrap_or_else(|e| {
                    tracing::warn!("forum thread: username batch failed: {}", e);
                    std::collections::HashMap::new()
                })
        }
        None => std::collections::HashMap::new(),
    };

    let comments_html = build_comments_html(&comments, &usernames_by_id);
    let meta_description = plain_excerpt(&body_rendered.html, META_DESCRIPTION_CHARS);
    let thread_slug_or_id = thread.slug.clone().unwrap_or_else(|| thread.id.clone());

    let tag_rows = svc.get_thread_tags(&thread.id).await.unwrap_or_else(|e| {
        tracing::warn!("forum: get_thread_tags({}) failed: {}", thread.id, e);
        Vec::new()
    });
    let tags_html = build_tag_chips_html(&tag_rows);

    TemplateResponse(ForumThreadTemplate {
        thread_title: thread.title.clone(),
        thread_slug_or_id,
        thread_meta_description: meta_description,
        space_slug: space.slug.clone(),
        space_name: space.name.clone(),
        author_username: resolve_username(&usernames_by_id, &thread.author_id),
        author_avatar_url: String::new(),
        created_at_human: humanize_ts(&thread.created_at),
        last_activity_human: humanize_opt(thread.last_activity_at.as_deref()),
        score: thread.score,
        comment_count: thread.comment_count,
        thread_body_html: body_rendered.html,
        tags_html,
        comments_html,
    })
    .into_response()
}

fn build_tag_chips_html(rows: &[crate::db::TagRow]) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let mut out = String::with_capacity(rows.len() * 64);
    for row in rows {
        out.push_str(&format!(
            r#"<a class="forum-tag-chip" href="/forum/tag/{slug}/">#{name}</a>"#,
            slug = row.slug,
            name = html_escape(&row.name),
        ));
    }
    out
}

#[derive(serde::Deserialize, Default)]
struct ComposeQuery {
    space: Option<String>,
}

/// GET /forum/compose — renders the new-thread form. The actual submit
/// goes through POST /api/v1/forum/threads with a Bearer JWT.
async fn forum_compose_handler(
    axum::extract::Query(q): axum::extract::Query<ComposeQuery>,
) -> Response {
    TemplateResponse(ForumComposeTemplate {
        compose_title: "New thread".to_string(),
        compose_meta_description: "Start a new thread on the KBVE Forum. Markdown supported."
            .to_string(),
        default_space_slug: q.space.unwrap_or_default(),
    })
    .into_response()
}

pub(crate) async fn auth_user_id(headers: &HeaderMap) -> Result<String, Response> {
    let token = extract_request_token(headers).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Missing authentication"})),
        )
            .into_response()
    })?;

    let cache = get_jwt_cache().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "Auth service unavailable"})),
        )
            .into_response()
    })?;

    cache
        .verify_and_cache(&token)
        .await
        .map(|info| info.user_id)
        .map_err(|e| {
            tracing::warn!(error = %e, "JWT verify failed in forum write");
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid or expired token"})),
            )
                .into_response()
        })
}

#[derive(serde::Deserialize, kbve::holy::Sanitize, ToSchema)]
pub(crate) struct CreateThreadBody {
    #[holy(sanitize = "trim, lowercase, slug, truncate(50)")]
    pub space_slug: String,
    // No escape_html — askama auto-escapes on render; pre-escaping would
    // double-encode &amp; etc.
    #[holy(sanitize = "trim, control_strip, truncate(180)")]
    pub title: String,
    #[holy(sanitize = "nul_strip, truncate(50000)")]
    pub body: String,
    #[serde(default = "default_thread_type")]
    #[holy(sanitize = "trim, lowercase, truncate(32)")]
    pub thread_type: String,
}
fn default_thread_type() -> String {
    "discussion".to_string()
}

/// POST /api/v1/forum/threads — Bearer-authed thread creation.
/// Body: `{ space_slug, title, body, thread_type }`.
#[utoipa::path(
    post,
    path = "/api/v1/forum/threads",
    tag = "forum",
    request_body = CreateThreadBody,
    responses(
        (status = 201, description = "Thread created — `{thread_id}`", body = serde_json::Value),
        (status = 400, description = "RPC validation error (title length / username required / etc)"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 404, description = "Space slug not found or inactive"),
        (status = 502, description = "Upstream forum DB error"),
        (status = 503, description = "Forum service not configured"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn api_create_thread(
    headers: HeaderMap,
    Json(mut payload): Json<CreateThreadBody>,
) -> Response {
    payload.sanitize();
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Forum service unavailable"})),
            )
                .into_response();
        }
    };

    let space = match svc.get_space_by_slug(&payload.space_slug).await {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "error": format!("space '{}' not found or inactive", payload.space_slug)
                })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("forum: space lookup failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "upstream error"})),
            )
                .into_response();
        }
    };

    let ctx = forum_render_ctx();
    let body_render = kbve::markdown::render(&payload.body, &ctx);
    let tag_ids = if body_render.hashtags.is_empty() {
        Vec::new()
    } else {
        match svc
            .resolve_or_create_tag_slugs(&body_render.hashtags, &user_id)
            .await
        {
            Ok(ids) => ids,
            Err(e) => {
                tracing::warn!("forum: tag resolve failed, dropping tags: {}", e);
                Vec::new()
            }
        }
    };

    match svc
        .create_thread(
            &user_id,
            &space.id,
            payload.title.trim(),
            &payload.body,
            &payload.thread_type,
            None,
            &tag_ids,
        )
        .await
    {
        Ok(thread_id) => {
            (StatusCode::CREATED, Json(json!({"thread_id": thread_id}))).into_response()
        }
        Err(e) => {
            tracing::warn!("forum.service_create_thread error: {}", e);
            (StatusCode::BAD_REQUEST, Json(json!({"error": e}))).into_response()
        }
    }
}

#[derive(serde::Deserialize, kbve::holy::Sanitize, ToSchema)]
pub(crate) struct CreateCommentBody {
    #[holy(sanitize = "nul_strip, truncate(50000)")]
    pub body: String,
    #[serde(default)]
    pub parent_comment_id: Option<String>,
}

/// POST /api/v1/forum/t/{slug_or_id}/comments — Bearer-authed comment.
#[utoipa::path(
    post,
    path = "/api/v1/forum/t/{slug_or_id}/comments",
    tag = "forum",
    params(
        ("slug_or_id" = String, Path, description = "Thread slug or UUID")
    ),
    request_body = CreateCommentBody,
    responses(
        (status = 201, description = "Comment created — `{comment_id, thread_id}`", body = serde_json::Value),
        (status = 400, description = "RPC validation error"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 404, description = "Thread not found"),
        (status = 502, description = "Upstream forum DB error"),
        (status = 503, description = "Forum service not configured"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn api_create_comment(
    Path(slug_or_id): Path<String>,
    headers: HeaderMap,
    Json(mut payload): Json<CreateCommentBody>,
) -> Response {
    payload.sanitize();
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Forum service unavailable"})),
            )
                .into_response();
        }
    };

    let thread = match svc.get_thread_by_slug_or_id(None, &slug_or_id).await {
        Ok(Some((t, _))) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": format!("thread '{}' not found", slug_or_id)})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("forum: thread lookup failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "upstream error"})),
            )
                .into_response();
        }
    };

    match svc
        .create_comment(
            &user_id,
            &thread.id,
            &payload.body,
            payload.parent_comment_id.as_deref(),
        )
        .await
    {
        Ok(comment_id) => (
            StatusCode::CREATED,
            Json(json!({"comment_id": comment_id, "thread_id": thread.id})),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("forum.service_create_comment error: {}", e);
            (StatusCode::BAD_REQUEST, Json(json!({"error": e}))).into_response()
        }
    }
}

#[derive(serde::Deserialize, kbve::holy::Sanitize, ToSchema)]
pub(crate) struct EditCommentBody {
    #[holy(sanitize = "nul_strip, truncate(50000)")]
    pub body: String,
    /// Optional moderator reason — only honored on the staff-edit /
    /// staff-remove paths. Inline text, sanitized as a title-like field.
    #[serde(default)]
    #[holy(sanitize = "trim, control_strip, truncate(500)")]
    pub reason: Option<String>,
}

/// PATCH /api/v1/forum/c/{comment_id} — author edit-own.
/// SQL `service_edit_comment` re-checks author ownership.
#[utoipa::path(
    patch,
    path = "/api/v1/forum/c/{comment_id}",
    tag = "forum",
    params(
        ("comment_id" = String, Path, description = "Comment UUID")
    ),
    request_body = EditCommentBody,
    responses(
        (status = 200, description = "Edit applied — `{comment_id}`", body = serde_json::Value),
        (status = 400, description = "RPC validation / author mismatch"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Forum service not configured"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn api_edit_comment(
    Path(comment_id): Path<String>,
    headers: HeaderMap,
    Json(mut payload): Json<EditCommentBody>,
) -> Response {
    payload.sanitize();
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Forum service unavailable"})),
            )
                .into_response();
        }
    };

    match svc
        .edit_comment_as_author(&user_id, &comment_id, &payload.body)
        .await
    {
        Ok(()) => (StatusCode::OK, Json(json!({"comment_id": comment_id}))).into_response(),
        Err(e) => {
            tracing::warn!("forum edit_comment_as_author error: {}", e);
            (StatusCode::BAD_REQUEST, Json(json!({"error": e}))).into_response()
        }
    }
}

/// DELETE /api/v1/forum/c/{comment_id} — staff remove.
/// axum checks staff at the JWT layer first, then forwards to the
/// `service_staff_remove_comment` RPC which re-checks at the SQL layer.
#[utoipa::path(
    delete,
    path = "/api/v1/forum/c/{comment_id}",
    tag = "forum",
    params(
        ("comment_id" = String, Path, description = "Comment UUID")
    ),
    request_body = EditCommentBody,
    responses(
        (status = 200, description = "Removed — `{action_id, comment_id}`", body = serde_json::Value),
        (status = 400, description = "RPC validation error"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Caller is not staff"),
        (status = 502, description = "Upstream staff check error"),
        (status = 503, description = "Forum service not configured"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn api_remove_comment(
    Path(comment_id): Path<String>,
    headers: HeaderMap,
    Json(mut payload): Json<EditCommentBody>,
) -> Response {
    payload.sanitize();
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Forum service unavailable"})),
            )
                .into_response();
        }
    };

    // Belt-and-suspenders: deny non-staff at the axum layer; SQL re-checks.
    match svc.is_staff(&user_id).await {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "staff permissions required"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("forum.is_staff lookup failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "staff check upstream error"})),
            )
                .into_response();
        }
    }

    match svc
        .staff_remove_comment(&user_id, &comment_id, payload.reason.as_deref())
        .await
    {
        Ok(action_id) => (
            StatusCode::OK,
            Json(json!({"action_id": action_id, "comment_id": comment_id})),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("forum staff_remove_comment error: {}", e);
            (StatusCode::BAD_REQUEST, Json(json!({"error": e}))).into_response()
        }
    }
}

/// GET /api/v1/me — Bearer-authed identity probe. Returns
/// `{user_id, username, is_staff}`. Used by the compose page to
/// gate the form (signed-in + has-username before submit) and by
/// any client surface that needs to mirror user state.
#[utoipa::path(
    get,
    path = "/api/v1/me",
    tag = "profile",
    responses(
        (status = 200, description = "Caller identity probe (user_id, username, is_staff)", body = serde_json::Value),
        (status = 401, description = "Missing / invalid bearer token"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn api_me(headers: HeaderMap) -> Response {
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let username = match get_profile_service() {
        Some(svc) => svc.get_username_by_id(&user_id).await.unwrap_or_else(|e| {
            tracing::warn!("api_me username lookup failed: {}", e);
            None
        }),
        None => None,
    };
    let is_staff = match get_forum_service() {
        Some(svc) => svc.is_staff(&user_id).await.unwrap_or(false),
        None => false,
    };
    (
        StatusCode::OK,
        Json(json!({
            "user_id": user_id,
            "username": username,
            "is_staff": is_staff,
        })),
    )
        .into_response()
}

#[utoipa::path(
    get,
    path = "/api/v1/me/staff",
    tag = "profile",
    responses(
        (status = 200, description = "Staff role bundle for caller", body = serde_json::Value),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 502, description = "Upstream forum DB error"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn api_me_staff(headers: HeaderMap) -> Response {
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Forum service unavailable"})),
            )
                .into_response();
        }
    };
    match svc.is_staff(&user_id).await {
        Ok(is_staff) => (
            StatusCode::OK,
            Json(json!({"is_staff": is_staff, "user_id": user_id})),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!("forum.is_staff probe failed: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "staff check upstream error"})),
            )
                .into_response()
        }
    }
}

/// PATCH /api/v1/forum/c/{comment_id}/moderate — staff overwrite body.
#[utoipa::path(
    patch,
    path = "/api/v1/forum/c/{comment_id}/moderate",
    tag = "forum",
    params(
        ("comment_id" = String, Path, description = "Comment UUID")
    ),
    request_body = EditCommentBody,
    responses(
        (status = 200, description = "Moderation edit applied — `{action_id, comment_id}`", body = serde_json::Value),
        (status = 400, description = "RPC validation error"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Caller is not staff"),
        (status = 502, description = "Upstream staff check error"),
        (status = 503, description = "Forum service not configured"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn api_staff_edit_comment(
    Path(comment_id): Path<String>,
    headers: HeaderMap,
    Json(mut payload): Json<EditCommentBody>,
) -> Response {
    payload.sanitize();
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Forum service unavailable"})),
            )
                .into_response();
        }
    };

    match svc.is_staff(&user_id).await {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "staff permissions required"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("forum.is_staff lookup failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "staff check upstream error"})),
            )
                .into_response();
        }
    }

    match svc
        .staff_edit_comment(
            &user_id,
            &comment_id,
            &payload.body,
            payload.reason.as_deref(),
        )
        .await
    {
        Ok(()) => (StatusCode::OK, Json(json!({"comment_id": comment_id}))).into_response(),
        Err(e) => {
            tracing::warn!("forum staff_edit_comment error: {}", e);
            (StatusCode::BAD_REQUEST, Json(json!({"error": e}))).into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// Minimal router with health endpoint + middleware (no static file
    /// serving, which requires a real directory).
    fn test_router() -> Router {
        let middleware = tower::ServiceBuilder::new()
            .layer(SetResponseHeaderLayer::overriding(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_FRAME_OPTIONS,
                HeaderValue::from_static("DENY"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                HeaderName::from_static("referrer-policy"),
                HeaderValue::from_static("strict-origin-when-cross-origin"),
            ));

        Router::new()
            .route("/health", get(health))
            .layer(middleware)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["version"], crate::version::current());
    }

    #[tokio::test]
    async fn test_security_headers() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );
        assert_eq!(response.headers().get("x-frame-options").unwrap(), "DENY");
        assert_eq!(
            response.headers().get("referrer-policy").unwrap(),
            "strict-origin-when-cross-origin"
        );
    }

    #[tokio::test]
    async fn test_cache_headers_astro_path() {
        let app = Router::new()
            .route("/_astro/{*path}", get(|| async { "asset" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/_astro/bundle.abc123.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("immutable"));
        assert!(cc.contains("31536000"));
    }

    #[tokio::test]
    async fn test_cache_headers_html_page() {
        let app = Router::new()
            .route("/", get(|| async { "page" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("86400"));
    }

    #[tokio::test]
    async fn test_health_html_endpoint() {
        let state = AppState::new();
        let app = Router::new()
            .route("/health.html", get(health_html))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health.html")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("System Health"));
        assert!(html.contains("Operational"));
    }

    #[tokio::test]
    async fn test_api_status_endpoint() {
        let state = AppState::new();
        let app = Router::new()
            .route("/api/status", get(api_status))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert!(json["uptime_seconds"].is_number());
    }

    #[tokio::test]
    async fn test_profile_not_found() {
        let app = Router::new().route("/@{username}", get(profile_handler));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/@testuser")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            status == StatusCode::NOT_FOUND || status == StatusCode::OK,
            "Expected NOT_FOUND or OK, got {}",
            status
        );
        assert!(html.contains("@testuser") || html.contains("testuser"));
        assert!(html.contains("Profile Not Found") || html.contains("not found"));
    }

    #[tokio::test]
    async fn test_fix_ts_mime_rewrites() {
        let app = Router::new()
            .route("/worker.ts", get(|| async { "code" }))
            .route("/script.js", get(|| async { "code" }))
            .layer(axum::middleware::from_fn(fix_ts_mime));

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/worker.ts")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/javascript; charset=utf-8"
        );

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/script.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap().to_string());
        assert!(ct.is_none() || !ct.unwrap().contains("application/javascript"));
    }

    #[test]
    fn test_item_to_slug() {
        assert_eq!(
            item_to_slug("Dragon hunter crossbow"),
            "dragon-hunter-crossbow"
        );
        assert_eq!(
            item_to_slug("Dragon_hunter_crossbow"),
            "dragon-hunter-crossbow"
        );
        assert_eq!(item_to_slug("Willow logs"), "willow-logs");
        assert_eq!(item_to_slug("lobster"), "lobster");
    }

    #[test]
    fn test_archetype_flags_to_name() {
        assert_eq!(archetype_flags_to_name(1), "Warrior");
        assert_eq!(archetype_flags_to_name(2), "Mage");
        assert_eq!(archetype_flags_to_name(4), "Rogue");
        assert_eq!(archetype_flags_to_name(3), "Multi-class");
        assert_eq!(archetype_flags_to_name(0), "Adventurer");
    }

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(Duration::from_secs(45)), "45s");
        assert_eq!(format_duration(Duration::from_secs(125)), "2m 5s");
        assert_eq!(format_duration(Duration::from_secs(3661)), "1h 1m 1s");
    }

    #[tokio::test]
    async fn health_trailing_slash_returns_permanent_redirect() {
        let app = mount_permanent_redirects(
            Router::<()>::new().route("/health", get(health)),
            PERMANENT_REDIRECTS,
        );

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::PERMANENT_REDIRECT);
        assert_eq!(response.headers().get(header::LOCATION).unwrap(), "/health");
    }

    #[tokio::test]
    async fn permanent_redirect_table_is_non_empty_and_unique() {
        // Cheap sanity gate so a future refactor that empties the table
        // surfaces here before the routes regress in prod.
        assert!(!PERMANENT_REDIRECTS.is_empty());
        let mut sources: Vec<_> = PERMANENT_REDIRECTS.iter().map(|(s, _)| *s).collect();
        sources.sort_unstable();
        let before = sources.len();
        sources.dedup();
        assert_eq!(
            sources.len(),
            before,
            "PERMANENT_REDIRECTS source paths must be unique"
        );
    }

    #[tokio::test]
    async fn osrs_family_redirects_are_unique_and_disjoint() {
        use crate::transport::osrs_family_redirects::OSRS_FAMILY_REDIRECTS;
        // Internal uniqueness — duplicate routes panic axum at startup.
        let mut sources: Vec<_> = OSRS_FAMILY_REDIRECTS.iter().map(|(s, _)| *s).collect();
        sources.sort_unstable();
        let before = sources.len();
        sources.dedup();
        assert_eq!(
            sources.len(),
            before,
            "OSRS_FAMILY_REDIRECTS source paths must be unique"
        );
        // Disjoint from the hand-written table — both get mounted.
        let hand: std::collections::HashSet<_> =
            PERMANENT_REDIRECTS.iter().map(|(s, _)| *s).collect();
        for (src, _) in OSRS_FAMILY_REDIRECTS {
            assert!(
                !hand.contains(src),
                "family redirect {src} collides with PERMANENT_REDIRECTS"
            );
        }
    }

    #[tokio::test]
    async fn osrs_family_redirect_fires_to_base() {
        use crate::transport::osrs_family_redirects::OSRS_FAMILY_REDIRECTS;
        let app = mount_permanent_redirects(Router::<()>::new(), OSRS_FAMILY_REDIRECTS);
        for uri in [
            "/osrs/dragon-dagger-p",
            "/osrs/dragon-dagger-p/",
            "/osrs/dragon-dagger-p-5698",
            "/osrs/dragon-dagger-p-5698/",
        ] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::PERMANENT_REDIRECT);
            assert_eq!(
                response.headers().get(header::LOCATION).unwrap(),
                "/osrs/dragon-dagger/"
            );
        }
    }
}
