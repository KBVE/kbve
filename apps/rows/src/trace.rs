use axum::{extract::Request, middleware::Next, response::Response};
use tracing::info_span;
use uuid::Uuid;

/// Middleware that creates a per-request span with a unique request ID.
/// Vector/ClickHouse can correlate all log lines from the same request.
///
/// Zero-copy: method is Display'd into the span (no clone), path is
/// borrowed from the request URI (no String allocation).
pub async fn request_trace(req: Request, next: Next) -> Response {
    let request_id = Uuid::new_v4();
    let method = req.method().as_str();
    let path = req.uri().path();
    let customer = req
        .headers()
        .get("x-customerguid")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-");

    // info_span! captures the &str references before req is moved.
    // Fields are recorded eagerly, so no allocation after this point.
    let span = info_span!(
        "request",
        id = %request_id,
        %method,
        %path,
        %customer,
        status = tracing::field::Empty,
        latency_ms = tracing::field::Empty,
    );

    let start = std::time::Instant::now();
    let resp = {
        let _guard = span.enter();
        next.run(req).await
    };

    let latency = start.elapsed().as_millis() as u64;
    span.record("status", resp.status().as_u16());
    span.record("latency_ms", latency);

    tracing::info!(
        parent: &span,
        status = resp.status().as_u16(),
        latency_ms = latency,
        "request completed"
    );

    resp
}

#[macro_export]
macro_rules! trace_err {
    ($result:expr, $context:expr) => {
        match $result {
            Ok(val) => Ok(val),
            Err(e) => {
                tracing::error!(error = %e, context = $context, "operation failed");
                Err(e)
            }
        }
    };
}

#[macro_export]
macro_rules! success_or_err {
    ($result:expr) => {
        match $result {
            Ok(_) => axum::Json($crate::error::SuccessResponse::ok()),
            Err(e) => {
                tracing::error!(error = %e, "handler error");
                axum::Json($crate::error::SuccessResponse::err(e.to_string()))
            }
        }
    };
}
