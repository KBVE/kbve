use anyhow::Result;
use std::{net::SocketAddr, time::Duration};

use axum::{
    Router,
    http::{HeaderName, HeaderValue, Method, header},
    response::IntoResponse,
    routing::get,
};
use tokio::net::TcpListener;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::info;

const MAX_BODY: usize = 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// Comma-separated origin allowlist; entries may be exact or `scheme://*.suffix`.
pub fn allowed_origins() -> Vec<String> {
    std::env::var("MAIL_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

fn origin_allowed(allowed: &[String], origin: &str) -> bool {
    allowed.iter().any(|entry| {
        if let Some((scheme, host_pat)) = entry.split_once("://") {
            if let Some(suffix) = host_pat.strip_prefix("*.") {
                return origin
                    .strip_prefix(scheme)
                    .and_then(|rest| rest.strip_prefix("://"))
                    .is_some_and(|host| {
                        host.strip_suffix(suffix)
                            .is_some_and(|lead| lead.ends_with('.') && lead.len() > 1)
                    });
            }
        }
        entry == origin
    })
}

fn cors_layer(allowed: Vec<String>) -> CorsLayer {
    let allow = if allowed.is_empty() {
        tracing::warn!("MAIL_ALLOWED_ORIGINS unset — CORS allows any origin; set it in production");
        AllowOrigin::any()
    } else {
        AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin.to_str().is_ok_and(|o| origin_allowed(&allowed, o))
        })
    };
    CorsLayer::new()
        .allow_origin(allow)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
}

pub async fn serve() -> Result<()> {
    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5600);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let listener = TcpListener::bind(addr).await?;
    info!("HTTP listening on http://{addr}");

    axum::serve(listener, router(allowed_origins()))
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

pub fn router(allowed: Vec<String>) -> Router {
    let middleware = tower::ServiceBuilder::new()
        .layer(
            tower_http::trace::TraceLayer::new_for_http().make_span_with(
                tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
            ),
        )
        .layer(cors_layer(allowed))
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
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
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
        .timeout(REQUEST_TIMEOUT)
        .load_shed()
        .layer(tower_http::limit::RequestBodyLimitLayer::new(MAX_BODY));

    Router::new()
        .route("/health", get(health))
        .merge(super::mail::router())
        .layer(middleware)
}

async fn health() -> impl IntoResponse {
    "OK"
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, extract::Request, http::StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[test]
    fn exact_origin_match() {
        let allowed = vec!["https://kbve.com".to_string()];
        assert!(origin_allowed(&allowed, "https://kbve.com"));
        assert!(!origin_allowed(&allowed, "https://evil.kbve.com"));
    }

    #[test]
    fn wildcard_subdomain_match() {
        let allowed = vec!["https://*.kbve.com".to_string()];
        assert!(origin_allowed(&allowed, "https://mail.kbve.com"));
        assert!(!origin_allowed(&allowed, "https://evilkbve.com"));
        assert!(!origin_allowed(&allowed, "http://mail.kbve.com"));
        assert!(!origin_allowed(&allowed, "https://kbve.com"));
    }

    #[tokio::test]
    async fn health_responds_ok() {
        let response = router(vec![])
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
        assert_eq!(&body[..], b"OK");
    }

    #[tokio::test]
    async fn responses_carry_security_headers_and_are_not_cacheable() {
        let response = router(vec![])
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let headers = response.headers();
        assert_eq!(headers.get("x-content-type-options").unwrap(), "nosniff");
        assert_eq!(headers.get("x-frame-options").unwrap(), "DENY");
        assert_eq!(
            headers.get("referrer-policy").unwrap(),
            "strict-origin-when-cross-origin"
        );
        assert_eq!(headers.get(header::CACHE_CONTROL).unwrap(), "no-store");
    }

    #[tokio::test]
    async fn mail_routes_are_mounted_and_require_a_bearer() {
        let response = router(vec![])
            .oneshot(
                Request::builder()
                    .uri("/mail/me")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
