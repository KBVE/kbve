use askama::Template;
use axum::{response::Html, http::StatusCode};
use crate::entity::state::SharedState;

#[derive(Template)]
#[template(path = "../dist/askama/index.html")]
pub struct AstroTemplate<'a> {
    content: &'a str,
}

impl<'a> AstroTemplate<'a> {
    pub fn new(content: &'a str) -> Self {
        Self { content }
    }
}

pub async fn home_handler(state: axum::extract::State<SharedState>) -> Result<Html<String>, StatusCode> {
    let template = AstroTemplate::new("Hello from Astro + Rust!");
    template
        .render()
        .map(Html)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn astro_router() -> axum::Router<SharedState> {
    axum::Router::new()
        .route("/askama", axum::routing::get(home_handler))
}