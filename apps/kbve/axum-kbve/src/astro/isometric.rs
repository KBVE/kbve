//! COOP/COEP isolation middleware for routes that need SharedArrayBuffer
//! (WASM threads, bitecs SAB-backed worlds, WebTransport). Browsers only
//! enable SAB under a cross-origin isolated document, which means stamping:
//!
//! - `Cross-Origin-Opener-Policy: same-origin`
//! - `Cross-Origin-Embedder-Policy: require-corp`
//! - `Cross-Origin-Resource-Policy: same-origin`
//!
//! Layer alongside `kbve::web::astro::corp_static_assets` so that:
//! 1. Every asset under `/_astro`, `/assets`, `/chunks`, `/pagefind`, `/images`
//!    gets CORP same-origin (satisfies COEP on isolated documents).
//! 2. Vite bundles under `/_astro` additionally carry COEP require-corp.
//! 3. Only the isolated HTML documents themselves get the full
//!    COOP+COEP+CORP trio; the rest of the site stays non-isolated.
//!
//! Add a route here when its client wants SAB. Today: the isometric subsite
//! and the tower-defense arcade.

use axum::{
    http::{HeaderValue, header},
    middleware::Next,
    response::IntoResponse,
};

const ISOLATED_PREFIXES: &[&str] = &["/isometric", "/arcade/isometric", "/arcade/towerdefense"];

#[inline]
fn needs_cross_origin_isolation(path: &str) -> bool {
    ISOLATED_PREFIXES.iter().any(|p| path.starts_with(p))
}

pub async fn coop_coep_isometric(req: axum::extract::Request, next: Next) -> impl IntoResponse {
    let is_isolated = needs_cross_origin_isolation(req.uri().path());
    let mut resp = next.run(req).await;
    if is_isolated {
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
    fn isolation_path_match() {
        assert!(needs_cross_origin_isolation("/isometric"));
        assert!(needs_cross_origin_isolation("/isometric/"));
        assert!(needs_cross_origin_isolation("/isometric/play"));
        assert!(needs_cross_origin_isolation("/arcade/isometric"));
        assert!(needs_cross_origin_isolation("/arcade/isometric/test"));
        assert!(needs_cross_origin_isolation("/arcade/towerdefense"));
        assert!(needs_cross_origin_isolation("/arcade/towerdefense/"));
        assert!(!needs_cross_origin_isolation("/"));
        assert!(!needs_cross_origin_isolation("/arcade"));
        assert!(!needs_cross_origin_isolation("/_astro/foo.js"));
    }
}
