use axum::{extract::Request, middleware::Next, response::Response};
use tracing::{Span, info_span};
use uuid::Uuid;

/// Middleware that creates a per-request span with a unique request ID.
/// Vector/ClickHouse can correlate all log lines from the same request.
pub async fn request_trace(req: Request, next: Next) -> Response {
    let request_id = Uuid::new_v4();
    let method = req.method().clone();
    let uri = req.uri().path().to_string();
    let customer_guid = req
        .headers()
        .get("x-customerguid")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-");

    let span = info_span!(
        "request",
        id = %request_id,
        method = %method,
        path = %uri,
        customer = %customer_guid,
        status = tracing::field::Empty,
        latency_ms = tracing::field::Empty,
    );

    let start = std::time::Instant::now();
    let resp = {
        let _guard = span.enter();
        next.run(req).await
    };

    let latency = start.elapsed().as_millis();
    span.record("status", resp.status().as_u16());
    span.record("latency_ms", latency);

    // Emit a structured log line that ClickHouse can index
    tracing::info!(
        parent: &span,
        status = resp.status().as_u16(),
        latency_ms = latency,
        "request completed"
    );

    resp
}

/// Macro for tracing errors from repo/service calls.
/// Logs the error with context and converts to the appropriate response type.
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

/// Macro for wrapping a handler result into a SuccessResponse JSON.
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
