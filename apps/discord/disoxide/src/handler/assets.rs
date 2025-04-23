use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use http::header::{CACHE_CONTROL, HeaderValue};

use crate::entity::state::SharedState;

async fn custom_404() -> impl IntoResponse {
    const NOT_FOUND_HTML: &str = include_str!("../../dist/404.html");
    (StatusCode::NOT_FOUND, axum::response::Html(NOT_FOUND_HTML))
}

pub fn static_router() -> Router<SharedState> {

    let cache_layer = SetResponseHeaderLayer::if_not_present(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );

    Router::new()
        .nest_service("/_astro", ServeDir::new("dist/_astro").not_found_service(get(custom_404)))
        .nest_service("/~partytown", ServeDir::new("dist/~partytown").not_found_service(get(custom_404)))
        .nest_service("/collections", ServeDir::new("dist/collections").not_found_service(get(custom_404)))
        .nest_service("/integrations", ServeDir::new("dist/integrations").not_found_service(get(custom_404)))
        .nest_service("/pagefind", ServeDir::new("dist/pagefind").not_found_service(get(custom_404)))
        .nest_service("/sitegraph", ServeDir::new("dist/sitegraph").not_found_service(get(custom_404)))
        .nest_service("/assets", ServeDir::new("dist/assets").not_found_service(get(custom_404)))
        .nest_service("/images", ServeDir::new("dist/images").not_found_service(get(custom_404)))
        .nest_service("/i18n", ServeDir::new("dist/i18n").not_found_service(get(custom_404)))
        .route_service("/sw.js", ServeFile::new("dist/sw.js"))
        .route_service("/ads.txt", ServeFile::new("dist/ads.txt"))
        .route_service("/content-assets.mjs", ServeFile::new("dist/content-assets.mjs"))
        .route_service("/content-modules.mjs", ServeFile::new("dist/content-modules.mjs"))
        .route_service("/data-store.json", ServeFile::new("dist/data-store.json"))
        .route_service("/settings.json", ServeFile::new("dist/settings.json"))
        .route_service("/sitemap.xml", ServeFile::new("dist/sitemap.xml"))
        .route_service("/sitemap-0.xml", ServeFile::new("dist/sitemap-0.xml"))
        .route_service("/sitemap-index.xml", ServeFile::new("dist/sitemap-index.xml"))
        .route_service("/robots.txt", ServeFile::new("dist/robots.txt"))
        .route_service("/favicon.ico", ServeFile::new("dist/favicon.ico"))
        .route_service("/index.html", ServeFile::new("dist/index.html"))
        .fallback_service(ServeDir::new("dist").precompressed_gzip().not_found_service(get(custom_404)))
        .layer(cache_layer)
}