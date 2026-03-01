use axum::{extract::Request, http::HeaderValue, middleware::Next, response::Response};

/// Typed wrapper for a request ID, stored in request extensions.
///
/// Handlers can extract this from the request to correlate logs and traces.
///
/// ```ignore
/// async fn handler(Extension(request_id): Extension<RequestId>) -> String {
///     format!("Request ID: {}", request_id.0)
/// }
/// ```
#[derive(Debug, Clone)]
pub struct RequestId(pub String);

/// Axum middleware that generates a unique ULID-based request ID for each request.
///
/// - Inserts a `RequestId` into request extensions for downstream handlers
/// - Adds `x-request-id` header to the response
pub async fn request_id_middleware(mut req: Request, next: Next) -> Response {
    let id = crate::utility::generate_ulid_as_string();

    req.extensions_mut().insert(RequestId(id.clone()));

    let mut resp = next.run(req).await;

    if let Ok(val) = HeaderValue::from_str(&id) {
        resp.headers_mut().insert("x-request-id", val);
    }

    resp
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::{Request as HttpRequest, StatusCode},
        middleware,
        routing::get,
    };
    use tower::ServiceExt;

    async fn ok_handler() -> &'static str {
        "ok"
    }

    fn build_app() -> Router {
        Router::new()
            .route("/", get(ok_handler))
            .layer(middleware::from_fn(request_id_middleware))
    }

    #[tokio::test]
    async fn test_adds_request_id_to_response_header() {
        let app = build_app();

        let req = HttpRequest::builder().uri("/").body(Body::empty()).unwrap();

        let resp = app.oneshot(req).await.unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert!(resp.headers().get("x-request-id").is_some());
    }

    #[tokio::test]
    async fn test_request_id_is_valid_ulid() {
        let app = build_app();

        let req = HttpRequest::builder().uri("/").body(Body::empty()).unwrap();

        let resp = app.oneshot(req).await.unwrap();

        let id = resp
            .headers()
            .get("x-request-id")
            .unwrap()
            .to_str()
            .unwrap();

        // ULID is 26 characters, Crockford's Base32
        assert_eq!(id.len(), 26);
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[tokio::test]
    async fn test_each_request_gets_unique_id() {
        let app = build_app();

        let req1 = HttpRequest::builder().uri("/").body(Body::empty()).unwrap();
        let resp1 = app.clone().oneshot(req1).await.unwrap();
        let id1 = resp1
            .headers()
            .get("x-request-id")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();

        let req2 = HttpRequest::builder().uri("/").body(Body::empty()).unwrap();
        let resp2 = app.oneshot(req2).await.unwrap();
        let id2 = resp2
            .headers()
            .get("x-request-id")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();

        assert_ne!(id1, id2);
    }
}
