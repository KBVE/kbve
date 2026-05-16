use std::net::SocketAddr;
use std::sync::Arc;

use axum::{Router, extract::State, response::IntoResponse, routing::get};
use axum_prometheus::{
    AXUM_HTTP_REQUESTS_DURATION_SECONDS, PrometheusMetricLayer, PrometheusMetricLayerBuilder,
    metrics_exporter_prometheus::{Matcher, PrometheusBuilder, PrometheusHandle},
};
use tokio::net::TcpListener;
use tracing::{info, warn};

const DEFAULT_BUCKETS: &[f64] = &[
    0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
];

pub struct MetricsConfig {
    pub service_name: &'static str,
    pub port: u16,
}

#[derive(Clone)]
pub struct MetricsState {
    pub handle: Arc<PrometheusHandle>,
}

pub fn build_metrics_layer(
    service_name: &'static str,
) -> (PrometheusMetricLayer<'static>, PrometheusHandle) {
    PrometheusMetricLayerBuilder::new()
        .with_metrics_from_fn(|| {
            PrometheusBuilder::new()
                .set_buckets_for_metric(
                    Matcher::Full(AXUM_HTTP_REQUESTS_DURATION_SECONDS.to_string()),
                    DEFAULT_BUCKETS,
                )
                .expect("histogram bucket matcher must accept the axum duration metric name")
                .add_global_label("service", service_name)
                .install_recorder()
                .expect("prometheus recorder must install exactly once per process")
        })
        .build_pair()
}

pub fn metrics_router(handle: PrometheusHandle) -> Router {
    let state = MetricsState {
        handle: Arc::new(handle),
    };
    Router::new()
        .route("/metrics", get(render_metrics))
        .route("/health", get(metrics_health))
        .with_state(state)
}

async fn render_metrics(State(state): State<MetricsState>) -> impl IntoResponse {
    let body = state.handle.render();
    (
        [("Content-Type", "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
}

async fn metrics_health() -> impl IntoResponse {
    (axum::http::StatusCode::OK, "ok")
}

pub async fn serve_metrics(config: MetricsConfig, handle: PrometheusHandle) {
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let router = metrics_router(handle);
    match TcpListener::bind(addr).await {
        Ok(listener) => {
            info!(
                "{} metrics endpoint listening on http://{}/metrics",
                config.service_name, addr
            );
            if let Err(e) = axum::serve(listener, router).await {
                warn!("{} metrics server error: {e}", config.service_name);
            }
        }
        Err(e) => {
            warn!(
                "{} metrics endpoint failed to bind {}: {e}",
                config.service_name, addr
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn builds_layer_and_renders_empty_metrics() {
        let (_layer, handle) = build_metrics_layer("test-service");
        let rendered = handle.render();
        assert!(rendered.contains("# TYPE") || rendered.is_empty());
    }

    #[test]
    fn default_buckets_are_monotonic() {
        let mut prev = 0.0;
        for &b in DEFAULT_BUCKETS {
            assert!(
                b > prev,
                "buckets must be strictly increasing: {prev} -> {b}"
            );
            prev = b;
        }
    }
}
