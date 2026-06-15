use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;
use std::path::{Path, PathBuf};

#[derive(RustEmbed)]
#[folder = "web/dist"]
struct Assets;

pub async fn handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    if let Some(dir) = std::env::var_os("JOBBOARD_WEB_DIR") {
        return serve_disk(Path::new(&dir), path)
            .await
            .unwrap_or_else(not_found);
    }

    serve_embedded(path).unwrap_or_else(|| serve_embedded("index.html").unwrap_or_else(not_found))
}

fn serve_embedded(path: &str) -> Option<Response> {
    let asset = Assets::get(path)?;
    Some(with_mime(path, asset.data.into_owned()))
}

async fn serve_disk(dir: &Path, path: &str) -> Option<Response> {
    if let Some(body) = read_under(dir, path).await {
        return Some(with_mime(path, body));
    }
    let body = read_under(dir, "index.html").await?;
    Some(with_mime("index.html", body))
}

async fn read_under(dir: &Path, rel: &str) -> Option<Vec<u8>> {
    if rel.split('/').any(|seg| seg == "..") {
        return None;
    }
    let full: PathBuf = dir.join(rel);
    tokio::fs::read(full).await.ok()
}

fn with_mime(path: &str, body: Vec<u8>) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    ([(header::CONTENT_TYPE, mime.as_ref())], body).into_response()
}

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, "frontend not built").into_response()
}
