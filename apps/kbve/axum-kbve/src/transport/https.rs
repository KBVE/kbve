use anyhow::Result;
use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Request, State},
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

use crate::astro::askama::{
    ForumCommentPartial, ForumFeedItemPartial, ForumFeedTemplate, ForumThreadTemplate,
    HealthTemplate, ProfileNotFoundTemplate, ProfileTemplate, RentEarthCharacterDisplay,
    TemplateResponse,
};
use crate::auth::{extract_bearer_token, get_jwt_cache};
use crate::db::{
    CommentRow, DiscordClient, FeedQuery, FeedRow, SpaceRow, ThreadRow, UserProfile,
    get_discord_client, get_forum_service, get_mc_service, get_osrs_cache, get_profile_cache,
    get_profile_service, get_rentearth_service, get_role_names, get_twitch_client,
    validate_username,
};
use askama::Template;

/// Static table of simple permanent redirects handled by Axum before hitting Astro.
const PERMANENT_REDIRECTS: &[(&str, &str)] = &[
    ("/application/kube", "/application/kubernetes/"),
    ("/application/kubectl", "/application/kubernetes/"),
    ("/application/bevy", "/application/rust/#bevy"),
    ("/application/bevy/", "/application/rust/#bevy"),
];

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
                version: env!("CARGO_PKG_VERSION"),
            }),
        }
    }
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

#[derive(Serialize)]
struct StatusResponse {
    status: &'static str,
    version: &'static str,
    uptime_seconds: u64,
}

/// Request body for setting username
#[derive(Debug, serde::Deserialize)]
struct SetUsernameRequest {
    username: String,
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
        // TLS mode — mkcert or production certs
        let tls_config = axum_server::tls_rustls::RustlsConfig::from_pem_file(&cert, &key)
            .await
            .map_err(|e| anyhow::anyhow!("failed to load TLS certs ({cert}, {key}): {e}"))?;

        info!("HTTPS listening on https://{addr}");

        axum_server::bind_rustls(addr, tls_config)
            .serve(app.into_make_service())
            .await?;
    } else {
        // Plain HTTP (production behind reverse proxy, or legacy dev)
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
        // Security headers
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
        .route("/health", get(health))
        .route("/health.html", get(health_html))
        .route("/api/status", get(api_status))
        .route("/api/v1/osrs/{item_id}", get(osrs_api_handler))
        .route("/api/v1/profile/me", get(profile_me_handler))
        .route("/api/v1/profile/username", post(set_username_handler))
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
        .route("/api/v1/mc/textures/{hash}", get(mc_texture_handler))
        .route("/@{username}", get(profile_handler))
        .route("/osrs/{item}", get(osrs_item_handler))
        .route("/osrs/{item}/", get(osrs_item_handler_trailing))
        // Bare /forum (no trailing slash) → /forum/. Crawlers + typed
        // URLs land on the canonical with a permanent redirect.
        .route("/forum", get(|| async { Redirect::permanent("/forum/") }))
        .route("/forum/", get(forum_feed_handler))
        .route("/forum/s/{slug}", get(forum_space_handler))
        .route("/forum/t/{slug_or_id}", get(forum_thread_handler))
        // SEO-friendly 301: /forum/c/{slug} → /forum/s/{slug}. `c/` reads
        // as "category" but the canonical URL is `s/` (space). Crawlers
        // collapse the duplicate into the canonical via the redirect.
        .route("/forum/c/", get(forum_c_root_redirect))
        .route("/forum/c/{slug}", get(forum_c_redirect))
        .route("/forum/c/{slug}/", get(forum_c_redirect));

    let public_router =
        mount_permanent_redirects(public_router, PERMANENT_REDIRECTS).with_state(state.clone());

    let main_app = static_router.merge(public_router).layer(middleware);

    // Proxy + WebSocket routes bypass global middleware (no 10s timeout, no 1MB body limit)
    let bypass_router = Router::new()
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
            "/dashboard/firecracker-net/proxy/{*path}",
            any(super::proxy::firecracker_net_proxy_handler),
        )
        .route(
            "/dashboard/firecracker-net/proxy",
            any(super::proxy::firecracker_net_proxy_handler),
        )
        // Public-facing persistent endpoint path — /fc/{name}/{*path}
        // routes to firecracker-ctl-net's /proxy/{name}/{*path} after a
        // staff-level auth gate. The {name} identifies the persistent VM.
        .route(
            "/fc/{name}/{*path}",
            any(super::proxy::firecracker_fc_handler),
        )
        .route("/fc/{name}", any(super::proxy::firecracker_fc_handler))
        .route(
            "/dashboard/kasm/proxy/{*path}",
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
            "/dashboard/chuckrpg/proxy/{*path}",
            any(super::proxy::chuckrpg_proxy_handler),
        )
        .route(
            "/dashboard/chuckrpg/proxy",
            any(super::proxy::chuckrpg_proxy_handler),
        );

    // Game server WebSocket is now handled by lightyear on a separate port
    // (GAME_WS_ADDR, default :5000). No Axum route needed.

    bypass_router.merge(main_app)
}

// ---------------------------------------------------------------------------
// Health / status handlers (monorepo versions)
// ---------------------------------------------------------------------------

async fn health() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn health_html(State(state): State<AppState>) -> impl IntoResponse {
    let uptime = state.inner.start_time.elapsed().as_secs();
    TemplateResponse(HealthTemplate {
        status: "Operational".to_string(),
        version: state.inner.version.to_string(),
        uptime_seconds: uptime,
    })
}

async fn api_status(State(state): State<AppState>) -> impl IntoResponse {
    let uptime = state.inner.start_time.elapsed().as_secs();
    Json(StatusResponse {
        status: "ok",
        version: state.inner.version,
        uptime_seconds: uptime,
    })
}

// ---------------------------------------------------------------------------
// Profile page handler
// ---------------------------------------------------------------------------

/// Profile page handler - displays user profile by username.
/// Uses cache-first strategy with Discord enrichment.
async fn profile_handler(Path(username): Path<String>) -> impl IntoResponse {
    // Step 1: Validate username format (prevents unnecessary DB/cache calls)
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

    // Step 2: Try cache first; concurrent misses collapse to one enrichment.
    let profile = if let Some(cache) = get_profile_cache() {
        cache
            .get_or_load(&validated_username, |u| async move {
                fetch_enriched_profile(&u).await
            })
            .await
            .map(|arc| (*arc).clone())
    } else {
        fetch_profile_from_db(&validated_username).await
    };

    // Step 3: Render response with appropriate cache headers
    match profile {
        Some(profile) => {
            let response = render_profile_template(&validated_username, &profile);
            // Cache for 5 minutes, allow stale content while revalidating
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
            // Don't cache 404s as long - user might register soon
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

// ---------------------------------------------------------------------------
// Profile enrichment pipeline
// ---------------------------------------------------------------------------

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
    // Only enrich if we have Discord info and a Discord client
    let discord_id = match &profile.discord {
        Some(d) => d.id.clone(),
        None => return profile,
    };

    let client = match get_discord_client() {
        Some(c) => c,
        None => return profile,
    };

    // Fetch guild member data
    match client.get_guild_member(&discord_id).await {
        Ok(Some(member)) => {
            // Update Discord info with guild-specific data
            if let Some(ref mut discord) = profile.discord {
                // Mark as guild member
                discord.is_guild_member = Some(true);

                // Store guild nickname
                discord.guild_nickname = member.nick.clone();

                // Use guild nickname for display if available
                if member.nick.is_some() {
                    discord.username = member.nick.clone();
                }

                // Use guild avatar if available, otherwise use user avatar
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

                // Use global_name if we still don't have a username
                if discord.username.is_none() {
                    if let Some(ref user) = member.user {
                        discord.username = user.global_name.clone().or(Some(user.username.clone()));
                    }
                }

                // Store join date
                discord.joined_at = member.joined_at.clone();

                // Store role IDs and resolve role names from cached guild roles
                discord.role_ids = member.roles.clone();
                discord.role_names = get_role_names(&member.roles);

                // Check if user is boosting
                discord.is_boosting = Some(member.premium_since.is_some());
            }

            tracing::debug!("Enriched Discord profile for user {}", discord_id);
        }
        Ok(None) => {
            // User is NOT in the KBVE Discord guild
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
    // Only enrich if we have Twitch info and a Twitch client
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

    // Check if user is currently live
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

    // Optionally fetch fresh user data for updated avatar
    match client.get_user_by_login(&twitch_username).await {
        Ok(Some(user)) => {
            if let Some(ref mut twitch) = profile.twitch {
                // Update avatar URL from Twitch API (more reliable/up-to-date)
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
    // Only enrich if we have a RentEarth service
    let service = match get_rentearth_service() {
        Some(s) => s,
        None => return profile,
    };

    // Fetch RentEarth profile for this user
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

// ---------------------------------------------------------------------------
// Profile template rendering
// ---------------------------------------------------------------------------

/// Convert archetype flags to human-readable class name
fn archetype_flags_to_name(flags: i64) -> String {
    // Primary archetypes based on flag values from the schema
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

/// Render profile to template response
fn render_profile_template(
    username: &str,
    profile: &UserProfile,
) -> TemplateResponse<ProfileTemplate> {
    // Extract Discord info
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

    // Extract GitHub info
    let (github_username, github_avatar) = profile
        .github
        .as_ref()
        .map(|g| (g.username.clone(), g.avatar_url.clone()))
        .unwrap_or((None, None));

    // Extract Twitch info
    let (twitch_username, twitch_avatar, twitch_is_live) = profile
        .twitch
        .as_ref()
        .map(|t| (t.username.clone(), t.avatar_url.clone(), t.is_live))
        .unwrap_or((None, None, None));

    // Extract RentEarth info
    let (rentearth_characters, rentearth_total_playtime_hours, rentearth_last_activity) = profile
        .rentearth
        .as_ref()
        .map(|r| {
            let characters: Vec<RentEarthCharacterDisplay> = r
                .characters
                .iter()
                .map(|c| {
                    // Convert archetype_flags to human-readable name
                    let archetype_name = archetype_flags_to_name(c.archetype_flags);
                    // Convert playtime seconds to hours
                    let total_playtime_hours = c.total_playtime_seconds.unwrap_or(0) / 3600;
                    // Compute health percentage (0-100), avoiding division by zero
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

    // Get first character of username for avatar placeholder
    let username_first_char = username
        .chars()
        .next()
        .map(|c| c.to_uppercase().to_string())
        .unwrap_or_else(|| "?".to_string());

    // Pre-compute profile description for SEO (avoids template conditionals)
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

    // Debug log all template values to diagnose visibility issues
    tracing::info!(
        "Profile {} - discord_username: {:?}, discord_is_guild_member: {:?}, twitch_username: {:?}, twitch_is_live: {:?}, github_username: {:?}",
        username,
        discord_username,
        discord_is_guild_member,
        twitch_username,
        twitch_is_live,
        github_username
    );

    // Determine primary avatar URL (prefer Discord > GitHub > Twitch)
    let primary_avatar_url = discord_avatar
        .clone()
        .or_else(|| github_avatar.clone())
        .or_else(|| twitch_avatar.clone());

    TemplateResponse(ProfileTemplate {
        username: username.to_string(),
        username_first_char,
        profile_description,
        // Banner/Hero fields (static placeholders for now)
        unsplash_banner_id: "1594671581654-cc7ed83167bb".to_string(),
        bio: None,
        status: None,
        primary_avatar_url,
        // Discord fields
        discord_username,
        discord_avatar,
        discord_is_guild_member,
        discord_id,
        discord_guild_nickname,
        discord_joined_at,
        discord_is_boosting,
        discord_role_count,
        discord_role_names,
        // GitHub fields
        github_username,
        github_avatar,
        // Twitch fields
        twitch_username,
        twitch_avatar,
        twitch_is_live,
        // RentEarth fields
        rentearth_characters,
        rentearth_total_playtime_hours,
        rentearth_last_activity,
    })
}

/// Build a JSON response object from a UserProfile
fn build_profile_json(profile: &UserProfile) -> serde_json::Value {
    let mut response = json!({
        "username": profile.username,
        "user_id": profile.user_id,
    });

    // Add Discord data if present
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

    // Add GitHub data if present
    if let Some(ref github) = profile.github {
        response["github"] = json!({
            "id": github.id,
            "username": github.username,
            "avatar_url": github.avatar_url,
        });
    }

    // Add Twitch data if present
    if let Some(ref twitch) = profile.twitch {
        response["twitch"] = json!({
            "id": twitch.id,
            "username": twitch.username,
            "avatar_url": twitch.avatar_url,
            "is_live": twitch.is_live,
        });
    }

    // Add RentEarth data if present
    if let Some(ref rentearth) = profile.rentearth {
        response["rentearth"] = json!(rentearth);
    }

    // Add connected providers list
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

    // Add provider count
    response["provider_count"] = json!(connected_providers.len());

    response
}

// ---------------------------------------------------------------------------
// OSRS handlers
// ---------------------------------------------------------------------------

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

/// OSRS item page handler - redirects to static Astro pages.
/// Supports both item names (Dragon_hunter_crossbow) and numeric IDs (21012).
async fn osrs_item_handler(Path(item): Path<String>) -> impl IntoResponse {
    let cache = match get_osrs_cache() {
        Some(c) => c,
        None => {
            // Fallback: redirect to the item slug directly, let Astro handle 404
            let slug = item_to_slug(&item);
            return (
                StatusCode::TEMPORARY_REDIRECT,
                [(header::LOCATION, format!("/osrs/{}/", slug))],
            )
                .into_response();
        }
    };

    // Try to parse as numeric ID first, otherwise treat as item name
    let result = if let Ok(id) = item.parse::<u32>() {
        cache.get_by_id(id).await
    } else {
        cache.get_by_name(&item).await
    };

    match result {
        Some(item_with_price) => {
            // Convert item name to Astro slug format (lowercase, hyphens)
            let slug = item_to_slug(&item_with_price.item.name);

            // 301 redirect to Astro static page
            (
                StatusCode::MOVED_PERMANENTLY,
                [(header::LOCATION, format!("/osrs/{}/", slug))],
            )
                .into_response()
        }
        None => {
            // Item not found in cache - redirect to slug anyway, let Astro handle 404
            let slug = item_to_slug(&item);
            (
                StatusCode::TEMPORARY_REDIRECT,
                [(header::LOCATION, format!("/osrs/{}/", slug))],
            )
                .into_response()
        }
    }
}

/// OSRS item handler for trailing slash URLs (e.g., /osrs/willow-Logs/, /osrs/385/).
/// Supports both item names and numeric IDs, normalizes to canonical lowercase slug.
async fn osrs_item_handler_trailing(Path(item): Path<String>) -> Response<Body> {
    // Check if this is a numeric ID - if so, look it up and redirect to the canonical slug
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
        // Numeric ID not found - fall through to 404
    }

    let slug = item_to_slug(&item);

    // Only redirect if the URL needs normalization (case differs)
    if slug != item {
        // Redirect to canonical lowercase slug
        return Response::builder()
            .status(StatusCode::MOVED_PERMANENTLY)
            .header(header::LOCATION, format!("/osrs/{}/", slug))
            .body(Body::empty())
            .unwrap();
    }

    // Already canonical - serve the static file
    // We need to read and serve the file ourselves since we matched the route
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| {
        // Try to find the dist directory
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

    // Try gzipped version first
    if let Ok(content) = tokio::fs::read(&gz_path).await {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_ENCODING, "gzip")
            .header(header::CACHE_CONTROL, "public, max-age=3600")
            .body(Body::from(content))
            .unwrap();
    }

    // Try uncompressed version
    if let Ok(content) = tokio::fs::read(&file_path).await {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "public, max-age=3600")
            .body(Body::from(content))
            .unwrap();
    }

    // File not found - serve 404
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

/// OSRS API endpoint - returns item price data as JSON.
/// GET /api/v1/osrs/{item_id}
///
/// Supports both numeric IDs (21012) and item names (dragon_hunter_crossbow).
/// Returns current GE prices from the cache (refreshed every 60s).
async fn osrs_api_handler(Path(item_id): Path<String>) -> impl IntoResponse {
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

    // Try to parse as numeric ID first, otherwise treat as item name
    let result = if let Ok(id) = item_id.parse::<u32>() {
        cache.get_by_id(id).await
    } else {
        cache.get_by_name(&item_id).await
    };

    match result {
        Some(item_with_price) => {
            let item = &item_with_price.item;
            let price = &item_with_price.price;

            // Calculate average price
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

// ---------------------------------------------------------------------------
// Profile API handlers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MC API handlers
// ---------------------------------------------------------------------------

/// MC players API endpoint - returns online player list with UUIDs and skin URLs.
/// GET /api/v1/mc/players
///
/// Data is cached and refreshed every 15s via RCON background task.
async fn mc_players_handler() -> impl IntoResponse {
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

/// MC texture proxy - fetches skin PNGs from textures.minecraft.net.
/// GET /api/v1/mc/textures/{hash}
///
/// Hash must be 60-64 hex characters. Responses are immutably cached (24h).
async fn mc_texture_handler(Path(hash): Path<String>) -> impl IntoResponse {
    // Validate hash: 60-64 hex chars only
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

// ---------------------------------------------------------------------------
// Profile API handlers
// ---------------------------------------------------------------------------

/// Profile API endpoint - returns user profile data as JSON.
/// GET /api/v1/profile/{username}
///
/// Returns the user's profile data including connected accounts (Discord, GitHub, Twitch)
/// and enriched data from external APIs when available.
async fn profile_api_handler(Path(username): Path<String>) -> impl IntoResponse {
    // Validate username format
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

    // Try cache first; concurrent misses collapse to one enrichment.
    let profile = if let Some(cache) = get_profile_cache() {
        cache
            .get_or_load(&validated_username, |u| async move {
                fetch_enriched_profile(&u).await
            })
            .await
            .map(|arc| (*arc).clone())
    } else {
        fetch_profile_from_db(&validated_username).await
    };

    match profile {
        Some(profile) => {
            // Build JSON response with all profile data
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

/// Authenticated profile endpoint - returns the current user's profile.
/// GET /api/v1/profile/me
///
/// Requires Bearer token in Authorization header.
async fn profile_me_handler(headers: HeaderMap) -> impl IntoResponse {
    // Extract Authorization header
    let auth_header = match headers.get(header::AUTHORIZATION) {
        Some(h) => match h.to_str() {
            Ok(s) => s,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Invalid Authorization header encoding"
                    })),
                )
                    .into_response();
            }
        },
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Missing Authorization header",
                    "hint": "Include 'Authorization: Bearer <token>' header"
                })),
            )
                .into_response();
        }
    };

    // Extract bearer token
    let token = match extract_bearer_token(auth_header) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Invalid Authorization header format",
                    "hint": "Use 'Bearer <token>' format"
                })),
            )
                .into_response();
        }
    };

    // Get JWT cache
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

    // Verify token with Supabase (cached)
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

    // Now fetch the user's profile by their user_id
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

    // Get profile by user_id
    let profile = match profile_service
        .get_profile_by_user_id(&token_info.user_id)
        .await
    {
        Ok(Some(p)) => p,
        Ok(None) => {
            // User authenticated but no profile yet - return basic info
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

    // Build and return profile JSON
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

/// Set username endpoint - creates username for authenticated user.
/// POST /api/v1/profile/username
///
/// Requires Bearer token in Authorization header.
/// Body: { "username": "desired_username" }
///
/// Validates username at multiple levels:
/// 1. Client-side validation (Handy app)
/// 2. Axum-level validation (this endpoint)
/// 3. Database-level validation (proxy_add_username RPC)
async fn set_username_handler(
    headers: HeaderMap,
    Json(body): Json<SetUsernameRequest>,
) -> impl IntoResponse {
    // Step 1: Extract and verify bearer token
    let auth_header = match headers.get(header::AUTHORIZATION) {
        Some(h) => match h.to_str() {
            Ok(s) => s,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Invalid Authorization header encoding"
                    })),
                )
                    .into_response();
            }
        },
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Missing Authorization header",
                    "hint": "Include 'Authorization: Bearer <token>' header"
                })),
            )
                .into_response();
        }
    };

    let token = match extract_bearer_token(auth_header) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "Invalid Authorization header format",
                    "hint": "Use 'Bearer <token>' format"
                })),
            )
                .into_response();
        }
    };

    // Step 2: Verify JWT with Supabase
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

    // Step 3: Validate username format at Axum level
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

    // Step 4: Get profile service and set username
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

    // Call the set_username method with verified user_id
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

            // Determine appropriate status code based on error
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

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/// Set Cache-Control based on request path.
async fn cache_headers(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;

    let cache_value = if path.starts_with("/_astro/") {
        // Content-hashed Vite bundles — cache forever
        "public, max-age=31536000, immutable"
    } else if path.starts_with("/pagefind/") || path.starts_with("/images/") {
        // Build-time generated, static until next deploy
        "public, max-age=86400"
    } else if path.ends_with(".html") || path == "/" || !path.contains('.') {
        // Static HTML pages — immutable until next container deploy
        "public, max-age=86400"
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

// ---------------------------------------------------------------------------
// Forum SSR handlers
// ---------------------------------------------------------------------------

/// Image-host allowlist for thread + comment markdown rendering. Empty
/// by default; populate once we wire avatars / Supabase storage.
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

/// Crude HTML-escape for plain text strings going into pre-rendered HTML
/// fragments. Askama templates use the default `e` filter for direct
/// interpolation; this helper is for the few spots we hand-roll HTML.
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

/// Truncate the rendered markdown to a feed excerpt. Naive char-count
/// truncation is fine here because ammonia already balanced the tags.
/// We append an ellipsis if the body was cut.
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
    // Trim to date+time prefix (YYYY-MM-DDTHH:MM:SS). Good enough until a
    // real relative-time formatter lands.
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
            author_username: resolve_username(usernames_by_id, &row.author_id),
            created_at_human: humanize_ts(&row.created_at),
            score: row.score,
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
    format!(
        r#"<a class="forum-pagination__next" href="{base}?sort={sort}&cursor={cursor}">Older →</a>"#,
        base = html_escape(space_path),
        sort = html_escape(sort),
        cursor = html_escape(&cursor),
    )
}

fn build_spaces_nav_html() -> String {
    // Minimal nav until a service_list_spaces RPC + caching layer lands.
    r#"<a href="/forum/">All</a>"#.to_string()
}

async fn forum_feed_handler(
    axum::extract::Query(q): axum::extract::Query<FeedSortQuery>,
) -> Response {
    render_feed_page(None, &q).await
}

async fn forum_space_handler(
    Path(slug): Path<String>,
    axum::extract::Query(q): axum::extract::Query<FeedSortQuery>,
) -> Response {
    render_feed_page(Some(slug), &q).await
}

#[derive(serde::Deserialize, Default)]
struct FeedSortQuery {
    sort: Option<String>,
    cursor: Option<String>,
}

async fn render_feed_page(space_slug: Option<String>, q: &FeedSortQuery) -> Response {
    let svc = match get_forum_service() {
        Some(s) => s,
        None => {
            return (StatusCode::SERVICE_UNAVAILABLE, "forum service unavailable").into_response();
        }
    };

    // Resolve space if filtering by slug.
    let space = match space_slug.as_deref() {
        Some(slug) => match svc.get_space_by_slug(slug).await {
            Ok(Some(space)) => Some(space),
            Ok(None) => {
                return (StatusCode::NOT_FOUND, format!("space {} not found", slug))
                    .into_response();
            }
            Err(e) => {
                tracing::error!("forum: get_space_by_slug({}) failed: {}", slug, e);
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

    // Build (space_id → SpaceRow). When filtered to a single space we
    // already have the row; otherwise batch-fetch every space referenced
    // by the feed rows so the chip renders the slug instead of a UUID.
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

    // Batch-resolve every author UUID to a username. One round-trip via
    // PostgREST `?user_id=in.(…)`. Missing rows fall back to a sentinel
    // through resolve_username().
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

    let space_path = match space.as_ref() {
        Some(s) => format!("/forum/s/{}", s.slug),
        None => "/forum/".to_string(),
    };
    let pagination_html = build_pagination_html(&rows, &sort, &space_path);

    let (heading, og_title, canonical_suffix) = match space.as_ref() {
        Some(s) => (
            s.name.clone(),
            format!("{} — KBVE Forum", s.name),
            format!("s/{}", s.slug),
        ),
        None => (
            "KBVE Forum".to_string(),
            "KBVE Forum — Hot threads".to_string(),
            String::new(),
        ),
    };

    let meta_description = match space.as_ref() {
        Some(s) => s
            .description
            .clone()
            .unwrap_or_else(|| format!("{} discussions on KBVE.", s.name)),
        None => "Discuss, trade, and play across KBVE communities.".to_string(),
    };

    TemplateResponse(ForumFeedTemplate {
        feed_heading: heading,
        feed_og_title: og_title,
        feed_meta_description: meta_description,
        feed_canonical_suffix: canonical_suffix,
        active_sort_label: sort_label(&sort).to_string(),
        feed_items_html,
        spaces_nav_html: build_spaces_nav_html(),
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
                return (StatusCode::BAD_GATEWAY, "forum upstream error").into_response();
            }
        };

    let (thread, space) = match pair {
        Some(p) => p,
        None => {
            return (
                StatusCode::NOT_FOUND,
                format!("thread {} not found", slug_or_id),
            )
                .into_response();
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

    // Batch-resolve thread author + every commenter to a username.
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
        tags_html: String::new(),
        comments_html,
    })
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// Build a minimal router with just the health endpoint + middleware
    /// (no static file serving, which requires a real directory).
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
        assert_eq!(json["version"], env!("CARGO_PKG_VERSION"));
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

        // Profile handler now returns 404 for not-found (with cache), or BAD_REQUEST for invalid.
        // Without DB/cache services initialized, fetch_profile_from_db returns None,
        // so we get NOT_FOUND with the ProfileNotFoundTemplate.
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

        // .ts file should get JS content-type
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

        // .js file should NOT be rewritten
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
}
