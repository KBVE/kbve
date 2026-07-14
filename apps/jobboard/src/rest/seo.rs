use crate::error::{ApiError, pg_err};
use crate::state::AppState;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use std::sync::Arc;

const SITE: &str = "https://jobs.kbve.com";

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/sitemap.xml", get(sitemap))
        .route("/og/{kind}/{name}", get(og_svg))
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

async fn sitemap(State(app): State<Arc<AppState>>) -> Result<Response, ApiError> {
    let conn = app.db.read().await?;
    let rows = conn
        .query(
            "SELECT slug FROM jobboard.verticals WHERE status > 0 ORDER BY sort_order, label",
            &[],
        )
        .await
        .map_err(pg_err)?;

    let mut urls: Vec<String> = vec!["/".into(), "/gigs".into(), "/talent".into(), "/post".into()];
    for r in &rows {
        let slug: String = r.get(0);
        urls.push(format!("/gigs?discipline={}", slug));
    }

    let mut body = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for u in urls {
        body.push_str(&format!(
            "  <url><loc>{}{}</loc></url>\n",
            SITE,
            xml_escape(&u)
        ));
    }
    body.push_str("</urlset>\n");

    Ok((
        [(header::CONTENT_TYPE, "application/xml; charset=utf-8")],
        body,
    )
        .into_response())
}

// Branded OG card (1200x630 SVG). Per-item titles will come once gigs/talent
// are served by Axum; for now it renders the section kind on the brand card.
async fn og_svg(Path((kind, name)): Path<(String, String)>) -> Response {
    let slug = name.strip_suffix(".svg").unwrap_or(&name);
    let label = match kind.as_str() {
        "gig" => "Gig",
        "talent" => "Talent",
        _ => "Jobs",
    };
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cf0"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#181a20"/>
  <rect x="40" y="40" width="1120" height="550" rx="28" fill="#20232b" stroke="#2c303b"/>
  <circle cx="150" cy="150" r="46" fill="url(#g)"/>
  <text x="220" y="165" font-family="system-ui,sans-serif" font-size="44" font-weight="700" fill="#e9eaf0">KBVE Jobs</text>
  <text x="100" y="360" font-family="system-ui,sans-serif" font-size="72" font-weight="800" fill="#ffffff">{label}</text>
  <text x="100" y="430" font-family="system-ui,sans-serif" font-size="34" fill="#a6acbb">{slug}</text>
  <text x="100" y="540" font-family="system-ui,sans-serif" font-size="28" fill="#6b7080">jobs.kbve.com</text>
</svg>"##,
        label = label,
        slug = xml_escape(slug),
    );
    (
        [
            (header::CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=3600"),
        ],
        svg,
    )
        .into_response()
}
