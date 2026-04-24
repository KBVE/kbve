//! COOP/COEP isolation middleware for the `/isometric` + `/arcade/isometric`
//! subsites. Required because the isometric client uses SharedArrayBuffer
//! (WASM threads + WebTransport), which only lights up under a cross-origin
//! isolated document:
//!
//! - `Cross-Origin-Opener-Policy: same-origin`
//! - `Cross-Origin-Embedder-Policy: require-corp`
//! - `Cross-Origin-Resource-Policy: same-origin`
//!
//! Layer alongside `kbve::web::astro::corp_static_assets` so that:
//! 1. Every asset under `/_astro`, `/assets`, `/chunks`, `/pagefind`, `/images`
//!    gets CORP same-origin (satisfies COEP on the isometric document).
//! 2. Vite bundles under `/_astro` additionally carry COEP require-corp.
//! 3. Only the isometric HTML document itself gets the full COOP+COEP+CORP
//!    trio; other pages on the site stay non-isolated.

use axum::{
    http::{HeaderValue, header},
    middleware::Next,
    response::IntoResponse,
};

#[inline]
fn is_isometric_path(path: &str) -> bool {
    path.starts_with("/isometric") || path.starts_with("/arcade/isometric")
}

pub async fn coop_coep_isometric(req: axum::extract::Request, next: Next) -> impl IntoResponse {
    let is_isometric = is_isometric_path(req.uri().path());
    let mut resp = next.run(req).await;
    if is_isometric {
        let headers = resp.headers_mut();
        headers.insert(
            header::HeaderName::from_static("cross-origin-opener-policy"),
            HeaderValue::from_static("same-origin"),
        );
        headers.insert(
            header::HeaderName::from_static("cross-origin-embedder-policy"),
            HeaderValue::from_static("require-corp"),
        );
        headers.insert(
            header::HeaderName::from_static("cross-origin-resource-policy"),
            HeaderValue::from_static("same-origin"),
        );
    }
    resp
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn isometric_path_match() {
        assert!(is_isometric_path("/isometric"));
        assert!(is_isometric_path("/isometric/"));
        assert!(is_isometric_path("/isometric/play"));
        assert!(is_isometric_path("/arcade/isometric"));
        assert!(is_isometric_path("/arcade/isometric/test"));
        assert!(!is_isometric_path("/"));
        assert!(!is_isometric_path("/arcade"));
        assert!(!is_isometric_path("/_astro/foo.js"));
    }
}
