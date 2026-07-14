//! # ROWS — Rust Open World Server
//!
//! Single-binary game backend (REST + gRPC + WebSocket multiplexed on one port) that replaces the
//! legacy OWS .NET microservices for ChuckRPG. One process serves one tenant (`customer_guid`);
//! multiple deployments run side by side, fronted by the kbve.com dashboard's same-origin proxy
//! which injects the `X-CustomerGUID` header.
//!
//! ## Layout
//! - [`rest`] — axum HTTP surface. Handlers are grouped by domain (auth, characters, abilities,
//!   instances, zones, global data, admin users, system/dashboard) and annotated with
//!   `#[utoipa::path]`; the aggregated spec lives in [`openapi::ApiDoc`] and is served as Swagger UI
//!   on an internal-only port.
//! - [`service`] — `OWSService`, the business-logic layer the REST/gRPC/WS surfaces call into.
//! - `repo` — thin sqlx data-access wrappers (`CharsRepo`, `InstanceRepo`, `UsersRepo`).
//! - `agones` — GameServer fleet allocation + a watcher that reconciles tracking state.
//! - `grpc` / `ws` — the tonic and WebSocket transports sharing the same `OWSService`.
//! - `drain` — graceful-rollout draining: flip `/ready` to NotReady, notify players, wait the grace
//!   period, then release DB connections.
//!
//! ## Auth model
//! - Tenant routes require `X-CustomerGUID` (`require_customer_guid`).
//! - Server-to-server write routes additionally require an `x-service-key`
//!   (`rest::require_service_key`); player JWTs and session GUIDs do not pass.
//!
//! Regenerate the rendered API reference with `cargo doc -p rows --no-deps`.

#![allow(clippy::too_many_arguments)]
#![allow(dead_code)]

mod agones;
mod config;
mod convert;
mod db;
mod drain;
mod error;
mod grpc;
mod jobs;
mod middleware;
mod models;
mod mq;
mod openapi;
mod repo;
pub mod rest;
pub mod service;
mod state;
mod supabase;
mod trace;
mod ws;

use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tracing::{info, warn};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

/// Regenerate with `BUILD_PROTO=1 cargo build -p rows`.
pub mod proto {
    pub mod ows {
        include!("proto/ows.rs");
    }
    pub mod rows {
        include!("proto/rows.rs");
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // rustls 0.23+ no longer auto-selects a provider; must install before any TLS (kube-rs, sqlx).
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rows=info,tower_http=debug".into()),
        )
        .json()
        .with_target(true)
        .with_thread_ids(true)
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
        .init();

    let cfg = config::RowsConfig::from_env()?;
    info!(
        tenant = %cfg.tenant.slug,
        environment = cfg.tenant.environment.as_str(),
        customer_guid = %cfg.tenant.customer_guid,
        agones_fleet = %cfg.agones_fleet,
        agones_namespace = %cfg.agones_namespace,
        "Tenant configuration loaded"
    );

    let pool = db::connect_lazy(&cfg.database_url)?;
    info!("Database pool initialized (lazy; connections open on first use)");

    let pool_ro = match std::env::var("DATABASE_URL_RO")
        .ok()
        .filter(|s| !s.is_empty())
    {
        Some(ro_url) => {
            info!("Read-only DB pool configured from DATABASE_URL_RO");
            db::connect_lazy(&ro_url)?
        }
        None => pool.clone(),
    };

    let mq_producer = mq::try_connect(&cfg.rabbitmq_url).await;
    info!(
        available = mq_producer.is_some(),
        "RabbitMQ initialization complete"
    );

    let agones_client =
        agones::AgonesClient::try_new(&cfg.agones_namespace, &cfg.agones_fleet).await;
    info!(
        available = agones_client.is_some(),
        "Agones initialization complete"
    );

    // Env is resolved at container creation: a pod scheduled before the sealed secret unsealed
    // (optional: true secretKeyRef) runs WITHOUT the token until its next restart. The
    // fleet-restart trigger/clear fail closed (401 everyone), but the legacy RestartFleet gate is
    // conditional — with no token it stays open to any caller holding the tenant GUID. Surface
    // that state loudly so it's alertable instead of silent.
    if std::env::var("ROWS_FLEET_RESTART_TOKEN")
        .map(|v| v.is_empty())
        .unwrap_or(true)
    {
        tracing::warn!(
            "ROWS_FLEET_RESTART_TOKEN is not set — /fleet-restart/trigger and /fleet-restart/clear \
             reject all callers (fail closed), and the legacy RestartFleet remains UNGATED. If the \
             sealed secret exists, this pod may have started before it unsealed — restart the pod."
        );
    }

    let app_state = state::AppState::builder()
        .db(pool)
        .db_ro(pool_ro)
        .tenant(cfg.tenant.clone())
        .agones_config(&cfg.agones_namespace, &cfg.agones_fleet)
        .reaper_config(cfg.reaper.clone())
        .accept_new_joins(cfg.accept_new_joins)
        .fleet_restart_stall_secs(cfg.fleet_restart_stall_secs)
        .mq(mq_producer)
        .agones(agones_client)
        .build()?;

    let svc = Arc::new(service::OWSService::new(app_state.clone()));

    // Crash-recovery: rebuild tracking map from live Agones allocations.
    if let Some(ref agones) = app_state.agones {
        match agones.reconcile_allocations().await {
            Ok(allocs) => {
                for (instance_id, gs_name) in &allocs {
                    app_state.zone_servers.insert(*instance_id, gs_name.clone());
                }
                info!(recovered = allocs.len(), "Startup reconciliation complete");
            }
            Err(e) => {
                warn!(error = %e, "Startup reconciliation failed (non-fatal)");
            }
        }
    }

    jobs::spawn_all(svc.clone());

    {
        let watcher_state = app_state.clone();
        tokio::spawn(async move {
            agones::watcher::spawn_gameserver_watcher(watcher_state).await;
        });
        info!("GameServer watcher spawned");
    }

    // world_server_id=0 is a placeholder; real value comes from register_launcher.
    mq::spawn_consumer(&cfg.rabbitmq_url, 0, svc.clone()).await;

    let drain_grace_secs: u64 = std::env::var("ROWS_DRAIN_GRACE_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8);
    let shutdown_state = app_state.clone();

    let grpc_router = grpc::router(svc.clone());
    let rest_router = rest::router(app_state, svc.clone());
    let ws_router = ws::router(svc);

    // Per-tenant service label so multiple ROWS deployments don't collide in Prometheus.
    // Leaked once at startup; jedi's metrics API takes a &'static str.
    let metrics_service: &'static str =
        Box::leak(format!("rows-{}", cfg.tenant.slug).into_boxed_str());
    let (prom_layer, prom_handle) =
        jedi::entity::pipe_prometheus::build_metrics_layer(metrics_service);

    let app = rest_router
        .merge(ws_router)
        .merge(grpc_router.into_axum_router())
        .layer(prom_layer)
        .layer(axum::middleware::from_fn(trace::request_trace))
        .layer(TimeoutLayer::with_status_code(
            http::StatusCode::GATEWAY_TIMEOUT,
            std::time::Duration::from_secs(90),
        ))
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024))
        .layer(CorsLayer::permissive());

    tokio::spawn(jedi::entity::pipe_prometheus::serve_metrics(
        jedi::entity::pipe_prometheus::MetricsConfig {
            service_name: metrics_service,
            port: cfg.metrics_port,
        },
        prom_handle,
    ));

    // Swagger UI binds an internal-only port; deliberately not exposed via HTTPRoute/gateway.
    let docs_addr: SocketAddr = SocketAddr::new(cfg.http_addr.ip(), cfg.docs_port);
    let docs_app = axum::Router::new().merge(
        SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", openapi::ApiDoc::openapi()),
    );
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(docs_addr).await.unwrap();
        info!("Swagger UI listening on {docs_addr} (internal only)");
        axum::serve(listener, docs_app).await.ok();
    });

    let addr = cfg.http_addr;
    info!("ROWS listening on {addr} (REST + gRPC + WS multiplexed)");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_state.clone(), drain_grace_secs))
        .await?;

    // In-flight requests have drained; release DB connections promptly so the incoming pod
    // gets its connection headroom without waiting for TCP/idle timeouts.
    shutdown_state.db.close().await;
    shutdown_state.db_ro.close().await;
    info!("ROWS shutdown complete");
    Ok(())
}

async fn shutdown_signal(state: std::sync::Arc<state::AppState>, grace_secs: u64) {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("Received Ctrl+C, shutting down..."),
        _ = terminate => info!("Received SIGTERM, shutting down..."),
    }

    // 1. Flip readiness to NotReady so k8s deregisters this pod from the Service endpoints.
    state
        .draining
        .store(true, std::sync::atomic::Ordering::SeqCst);
    info!("Draining: /ready now reports NotReady");

    // 2. Fire the (stub) player notification.
    state
        .notifier
        .notify_players_shutdown(&drain::ShutdownNotice {
            reason: drain::ShutdownReason::Rollout,
            message: "ROWS is restarting for an update.".into(),
            grace_secs,
        });

    // 3. Wait out the grace period so endpoint removal propagates and in-flight work settles.
    info!(
        grace_secs,
        "Draining: waiting grace period before graceful shutdown"
    );
    tokio::time::sleep(std::time::Duration::from_secs(grace_secs)).await;
}
